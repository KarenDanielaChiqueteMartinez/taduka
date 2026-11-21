import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

// Hash de contraseñas con scrypt (incluido en Node: sin dependencias nuevas).
// Formato guardado: scrypt$N$r$p$sal(base64)$hash(base64) — los parámetros viajan con el hash,
// así se pueden endurecer más adelante sin invalidar las contraseñas existentes.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0) || n > 1 << 20) return false;
  const expected = Buffer.from(parts[5], "base64");
  const actual = await derive(password, Buffer.from(parts[4], "base64"), n, r, p);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Se compara contra un hash falso cuando el correo no existe, para que el tiempo de respuesta
// no revele qué cuentas están registradas.
let dummy: Promise<string> | undefined;
export function verifyAgainstDummy(password: string): Promise<boolean> {
  dummy ??= hashPassword("contraseña-inexistente-para-igualar-tiempos");
  return dummy.then((hash) => verifyPassword(password, hash)).then(() => false);
}

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200; // evita enviar contraseñas enormes al hash
