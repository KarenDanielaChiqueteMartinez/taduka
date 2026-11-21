// Pruebas de la autenticación propia: hash de contraseñas, tokens de sesión y límite de intentos.
//   node --env-file=.env.local --no-warnings --test db/tests/auth.test.ts
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const url = process.env.DATABASE_URL_TEST;
if (!url || !/\/[A-Za-z0-9_]*_test(\?.*)?$/.test(url)) {
  throw new Error("DATABASE_URL_TEST debe apuntar a una base cuyo nombre termine en _test.");
}
process.env.DATABASE_URL = url;

const { db, closePool } = await import("../../src/lib/db/pool.ts");
const attempts = await import("../../src/lib/db/auth-attempts.ts");
const { hashPassword, verifyPassword, verifyAgainstDummy } = await import("../../src/lib/auth/password.ts");
const { hashToken, newSessionToken, sessionExpiry, SESSION_DAYS } = await import("../../src/lib/auth/tokens.ts");

before(async () => {
  await db.exec("TRUNCATE TABLE auth_attempts");
});
after(async () => {
  await closePool();
});

test("contraseñas: el hash verifica la correcta y rechaza cualquier otra", async () => {
  const hash = await hashPassword("Mi contraseña segura 123");
  assert.match(hash, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await verifyPassword("Mi contraseña segura 123", hash), true);
  assert.equal(await verifyPassword("mi contraseña segura 123", hash), false, "distingue mayúsculas");
  assert.equal(await verifyPassword("", hash), false);
  assert.equal(await verifyPassword("Mi contraseña segura 123 ", hash), false, "espacio final");
});

test("contraseñas: cada hash lleva su propia sal y los formatos inválidos no verifican", async () => {
  const [a, b] = await Promise.all([hashPassword("igual"), hashPassword("igual")]);
  assert.notEqual(a, b, "misma contraseña, hashes distintos");
  for (const bad of ["", "texto", "scrypt$1$2$3$x", "bcrypt$16384$8$1$AAAA$BBBB", "scrypt$abc$8$1$AAAA$BBBB", `scrypt$${2 ** 30}$8$1$AAAA$BBBB`]) {
    assert.equal(await verifyPassword("igual", bad), false, bad);
  }
  assert.equal(await verifyAgainstDummy("lo que sea"), false);
});

test("contraseñas: los caracteres Unicode equivalentes se normalizan", async () => {
  const hash = await hashPassword("café"); // é precompuesta
  assert.equal(await verifyPassword("café", hash), true, "é descompuesta (e + acento)");
});

test("sesiones: el token es aleatorio, largo y solo se guarda su hash", () => {
  const a = newSessionToken();
  const b = newSessionToken();
  assert.notEqual(a.token, b.token);
  assert.ok(a.token.length >= 43, "256 bits en base64url");
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(hashToken(a.token), a.hash);
  assert.notEqual(a.hash, a.token);
  const from = new Date("2026-01-01T00:00:00Z");
  assert.equal(sessionExpiry(from).toISOString(), new Date(from.getTime() + SESSION_DAYS * 86_400_000).toISOString());
});

test("intentos: 8 fallos por correo bloquean ese correo, pero no a otro", async () => {
  for (let i = 0; i < 7; i++) await attempts.recordFailure("victima@test.local", "10.0.0.1");
  assert.equal(await attempts.isThrottled("victima@test.local", "10.0.0.2"), false, "7 fallos todavía no bloquean");
  await attempts.recordFailure("victima@test.local", "10.0.0.1");
  assert.equal(await attempts.isThrottled("victima@test.local", "10.0.0.9"), true, "8 fallos bloquean el correo desde cualquier IP");
  assert.equal(await attempts.isThrottled("otra@test.local", "10.0.0.77"), false, "otro correo no se ve afectado");
  await attempts.clearFailures("victima@test.local");
  assert.equal(await attempts.isThrottled("victima@test.local", "10.0.0.9"), false, "un inicio correcto limpia los fallos");
});

test("intentos: 30 fallos desde una IP la bloquean aunque cambie de correo", async () => {
  for (let i = 0; i < 30; i++) await attempts.recordFailure(`barrido${i}@test.local`, "203.0.113.5");
  assert.equal(await attempts.isThrottled("nuevo@test.local", "203.0.113.5"), true);
  assert.equal(await attempts.isThrottled("nuevo@test.local", "203.0.113.6"), false, "otra IP no se ve afectada");
  assert.equal(await attempts.isThrottled("nuevo@test.local", ""), false, "sin IP solo cuenta el correo");
});

test("intentos: los fallos viejos (fuera de la ventana de 15 minutos) no cuentan", async () => {
  await db.exec("TRUNCATE TABLE auth_attempts");
  for (let i = 0; i < 10; i++) {
    await db.exec(
      "INSERT INTO auth_attempts (email, ip, created_at) VALUES ('viejo@test.local', '198.51.100.1', UTC_TIMESTAMP(3) - INTERVAL 16 MINUTE)",
    );
  }
  assert.equal(await attempts.isThrottled("viejo@test.local", "198.51.100.1"), false);
});
