// Servidor local que SIMULA la API de Resend (POST /emails) para probar la Edge Function sin
// enviar correos reales ni contactar con api.resend.com.
//
//   node supabase/dev-tools/mock-resend.mjs [puerto]        (por defecto 54999, escucha en 0.0.0.0)
//   MOCK_RESEND_KEY=<clave de prueba>                        (opcional: exige ese Bearer)
//
// Imita la idempotencia de Resend: misma clave + mismo contenido => respuesta original sin
// "entregar" otra vez; misma clave + contenido distinto => 409 invalid_idempotent_request.
// Control (JSON): POST /__script {"modes":[...]} consume un modo por solicitud (luego "ok");
// GET /__requests; POST /__reset. Modos: ok | fail500 | conflict409 | noid | accept_then_500.
// El registro NUNCA guarda el valor del encabezado Authorization.
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? process.env.MOCK_RESEND_PORT ?? 54999);
const expectedKey = process.env.MOCK_RESEND_KEY ?? "";

let script = [];
let requests = [];
let counter = 0;
const stored = new Map(); // idempotency key -> { hash, id }

const hash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 16);
const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://mock");

  if (url.pathname === "/__requests") {
    return send(res, 200, {
      requests,
      deliveries: [...stored.values()].length,
    });
  }
  if (url.pathname === "/__reset" && req.method === "POST") {
    script = [];
    requests = [];
    stored.clear();
    counter = 0;
    return send(res, 200, { ok: true });
  }
  if (url.pathname === "/__script" && req.method === "POST") {
    script = JSON.parse((await readBody(req)) || "{}").modes ?? [];
    return send(res, 200, { ok: true, queued: script.length });
  }
  if (url.pathname !== "/emails" || req.method !== "POST") return send(res, 404, { name: "not_found" });

  const raw = await readBody(req);
  const auth = req.headers.authorization ?? "";
  const key = String(req.headers["idempotency-key"] ?? "");
  const mode = script.shift() ?? "ok";
  const entry = { n: requests.length + 1, mode, key, authOk: false, replay: false, status: 0 };
  requests.push(entry);

  entry.authOk = auth.startsWith("Bearer ") && (!expectedKey || auth === `Bearer ${expectedKey}`);
  if (!entry.authOk) return send(res, (entry.status = 401), { name: "missing_api_key" });
  if (key.length < 1 || key.length > 256) {
    return send(res, (entry.status = 400), { name: "invalid_idempotency_key" });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return send(res, (entry.status = 422), { name: "validation_error" });
  }
  Object.assign(entry, {
    to: body.to,
    from: body.from,
    subject: body.subject,
    htmlHash: hash(String(body.html)),
    textHash: hash(String(body.text)),
    htmlLength: String(body.html).length,
  });
  const payloadHash = hash(raw);

  if (mode === "fail500") return send(res, (entry.status = 500), { name: "internal_server_error" });
  if (mode === "conflict409") return send(res, (entry.status = 409), { name: "invalid_idempotent_request" });

  const known = stored.get(key);
  if (known && known.payloadHash !== payloadHash) {
    return send(res, (entry.status = 409), { name: "invalid_idempotent_request" });
  }
  let id;
  if (known) {
    id = known.id;
    entry.replay = true;
  } else {
    id = `mock-${String(++counter).padStart(4, "0")}`;
    stored.set(key, { payloadHash, id });
  }

  if (mode === "accept_then_500") return send(res, (entry.status = 500), { name: "internal_server_error" });
  if (mode === "noid") return send(res, (entry.status = 200), {});
  return send(res, (entry.status = 200), { id });
}).listen(port, "0.0.0.0", () => console.log(`mock-resend escuchando en el puerto ${port}`));
