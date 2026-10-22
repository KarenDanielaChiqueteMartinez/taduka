import assert from "node:assert/strict";
import { test } from "node:test";
import { isAuthorized } from "./auth.ts";
import { checkConfig } from "./config.ts";
import { createHandler } from "./handler.ts";
import { createResendMailer } from "./resend.ts";
import { lot, makeFakes, store } from "./fakes.ts";

const SECRET = "secreto-de-prueba-123";

function request(init: { method?: string; secret?: string | null; body?: unknown } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.secret !== null) headers.set("x-cron-secret", init.secret ?? SECRET);
  return new Request("http://localhost/functions/v1/inventory-alerts", {
    method: init.method ?? "POST",
    headers,
    body: init.method === "GET" ? undefined : JSON.stringify(init.body ?? { job: "urgent_alerts" }),
  });
}

function handlerWith(options: {
  deps: ReturnType<typeof makeFakes>["deps"];
  problems?: string[];
}) {
  let built = 0;
  let checkedConfig = 0;
  const handler = createHandler({
    secret: SECRET,
    configProblems: () => {
      checkedConfig += 1;
      return options.problems ?? [];
    },
    buildDeps: () => {
      built += 1;
      return options.deps;
    },
  });
  return { handler, built: () => built, checkedConfig: () => checkedConfig };
}

const fixture = () =>
  makeFakes({ stores: [store("s", "T", "u")], lots: [lot("1", "s")], emails: { u: "u@example.test" } });

test("invocación no autorizada: 401 sin crear clientes, sin leer configuración y sin tocar tiendas", async () => {
  const f = fixture();
  const h = handlerWith({ deps: f.deps });
  for (const req of [
    request({ secret: null }),
    request({ secret: "otro" }),
    request({ secret: "" }),
    request({ method: "GET", secret: null }),
  ]) {
    const response = await h.handler(req);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  }
  assert.equal(h.built(), 0);
  assert.equal(h.checkedConfig(), 0);
  assert.equal(f.items.length, 0);
  assert.equal(f.calls.length, 0);
});

test("sin autorización no se revela si la configuración está incompleta", async () => {
  const h = handlerWith({ deps: fixture().deps, problems: ["RESEND_API_KEY", "APP_URL"] });
  const response = await h.handler(request({ secret: "otro" }));
  const text = await response.text();
  assert.equal(response.status, 401);
  assert.doesNotMatch(text, /RESEND|APP_URL|config/i);
});

test("autorizado con configuración incompleta: 500 genérico, sin nombres de variables y sin procesar", async () => {
  const f = fixture();
  const h = handlerWith({ deps: f.deps, problems: ["RESEND_API_KEY"] });
  const response = await h.handler(request());
  const text = await response.text();
  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(text), { error: "configuration_error" });
  assert.doesNotMatch(text, /RESEND/);
  assert.equal(h.built(), 0);
  assert.equal(f.items.length, 0);
});

test("solo acepta POST y un job válido", async () => {
  const h = handlerWith({ deps: makeFakes({ stores: [], lots: [], emails: {} }).deps });
  assert.equal((await h.handler(request({ method: "GET" }))).status, 405);
  assert.equal((await h.handler(request({ body: { job: "borrar_todo" } }))).status, 400);
});

test("con el secreto correcto ejecuta el trabajo y devuelve conteos sin datos personales", async () => {
  const f = fixture();
  const h = handlerWith({ deps: f.deps });
  const response = await h.handler(request());
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), { job: "urgent_alerts", claimed: 1, sent: 1, failed: 0, omitted: 0 });
  assert.doesNotMatch(text, /example\.test/);
});

test("secreto del servidor ausente: ninguna invocación es válida", async () => {
  const handler = createHandler({
    secret: "",
    configProblems: () => [],
    buildDeps: () => fixture().deps,
  });
  assert.equal((await handler(request({ secret: "" }))).status, 401);
  assert.equal((await handler(request())).status, 401);
});

test("isAuthorized compara el secreto completo", () => {
  assert.equal(isAuthorized(SECRET, SECRET), true);
  assert.equal(isAuthorized(SECRET + "x", SECRET), false);
  assert.equal(isAuthorized(SECRET.slice(0, -1), SECRET), false);
  assert.equal(isAuthorized(null, SECRET), false);
  assert.equal(isAuthorized("", ""), false);
});

const fullEnv: Record<string, string> = {
  CRON_SECRET: "x",
  RESEND_API_KEY: "x",
  EMAIL_FROM: "TADUKA <alertas@example.test>",
  APP_URL: "https://app.example.test",
  SUPABASE_URL: "http://kong:8000",
  SUPABASE_SERVICE_ROLE_KEY: "x",
};

test("checkConfig: configuración completa no reporta problemas", () => {
  assert.deepEqual(checkConfig((n) => fullEnv[n]), []);
});

test("checkConfig: reporta cada variable ausente solo por nombre", () => {
  for (const name of ["RESEND_API_KEY", "EMAIL_FROM", "APP_URL", "CRON_SECRET"]) {
    const problems = checkConfig((n) => (n === name ? undefined : fullEnv[n]));
    assert.ok(problems.includes(name), `${name} ausente`);
  }
  assert.deepEqual(checkConfig((n) => (n === "CRON_SECRET" ? "  " : fullEnv[n])), ["CRON_SECRET"]);
  assert.doesNotMatch(checkConfig(() => undefined).join(), /\bx\b/);
});

test("checkConfig: formatos inválidos y destino de Resend no permitido", () => {
  assert.ok(checkConfig((n) => (n === "APP_URL" ? "app.example.test" : fullEnv[n])).some((p) => p.startsWith("APP_URL")));
  assert.ok(checkConfig((n) => (n === "EMAIL_FROM" ? "sin-arroba" : fullEnv[n])).some((p) => p.startsWith("EMAIL_FROM")));
  assert.ok(checkConfig((n) => (n === "RESEND_API_URL" ? "https://evil.example.test/emails" : fullEnv[n])).some((p) => p.startsWith("RESEND_API_URL")));
  assert.deepEqual(checkConfig((n) => (n === "RESEND_API_URL" ? "http://host.docker.internal:9999/emails" : fullEnv[n])), []);
  assert.deepEqual(checkConfig((n) => (n === "RESEND_API_URL" ? "https://api.resend.com/emails" : fullEnv[n])), []);
});

test("cliente de Resend: éxito devuelve el id y envía la clave de idempotencia", async () => {
  let seen: { url: string; headers: Headers; body: Record<string, unknown> } | undefined;
  const mailer = createResendMailer({
    apiKey: "re_test_clave",
    from: "TADUKA <alertas@example.test>",
    apiUrl: "http://resend.local/emails",
    fetchFn: (input, init) => {
      seen = {
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      };
      return Promise.resolve(new Response(JSON.stringify({ id: "abc-123" }), { status: 200 }));
    },
  });
  const result = await mailer.send({ to: "u@example.test", subject: "s", html: "<p>h</p>", text: "t", idempotencyKey: "k1" });
  assert.equal(result.id, "abc-123");
  assert.equal(seen?.headers.get("Idempotency-Key"), "k1");
  assert.equal(seen?.headers.get("Authorization"), "Bearer re_test_clave");
  assert.deepEqual(seen?.body.to, ["u@example.test"]);
});

test("cliente de Resend: error HTTP incluye estado y código corto, sin filtrar la clave ni el cuerpo", async () => {
  const failing = createResendMailer({
    apiKey: "re_test_clave",
    from: "x@example.test",
    fetchFn: () =>
      Promise.resolve(
        new Response(JSON.stringify({ name: "invalid_idempotent_request", message: "re_test_clave inválida" }), { status: 409 }),
      ),
  });
  await assert.rejects(
    failing.send({ to: "u@example.test", subject: "s", html: "h", text: "t", idempotencyKey: "k" }),
    (error: Error) =>
      error.message === "resend_http_409_invalid_idempotent_request" && !error.message.includes("re_test_clave"),
  );

  const plain = createResendMailer({
    apiKey: "k",
    from: "x@example.test",
    fetchFn: () => Promise.resolve(new Response("no es json", { status: 500 })),
  });
  await assert.rejects(
    plain.send({ to: "u@example.test", subject: "s", html: "h", text: "t", idempotencyKey: "k" }),
    (error: Error) => error.message === "resend_http_500",
  );
});

test("cliente de Resend: una respuesta 200 sin id no cuenta como envío confirmado", async () => {
  const noId = createResendMailer({
    apiKey: "k",
    from: "x@example.test",
    fetchFn: () => Promise.resolve(new Response("{}", { status: 200 })),
  });
  await assert.rejects(
    noId.send({ to: "u@example.test", subject: "s", html: "h", text: "t", idempotencyKey: "k" }),
    /resend_respuesta_invalida/,
  );
});
