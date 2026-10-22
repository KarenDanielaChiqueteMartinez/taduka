// Prueba de extremo a extremo LOCAL de la Edge Function inventory-alerts:
//   función real en Edge Runtime  ->  Resend SIMULADO (mock-resend.mjs)  ->  base local.
// Requisitos (todo local): `supabase start`, `supabase functions serve --env-file supabase/functions/.env`,
// `node supabase/dev-tools/mock-resend.mjs 54999`, Docker en el PATH.
// No contacta con api.resend.com. No imprime secretos (solo resultados booleanos/conteos).
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const FUNCTION_URL = "http://127.0.0.1:54321/functions/v1/inventory-alerts";
const MOCK = "http://127.0.0.1:54999";
const DB = "supabase_db_TADUKA";
const RUN = Date.now().toString(36);

const env = Object.fromEntries(
  readFileSync("supabase/functions/.env", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const CRON_SECRET = env.CRON_SECRET;

// --- utilidades -------------------------------------------------------------
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  -> ${detail}` : ""}`);
};

const sql = (query) =>
  execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-t", "-A", "-F", "|", "-c", query], {
    encoding: "utf8",
  }).trim();

function serviceKey() {
  const out = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", shell: true });
  const match = /^(?:SERVICE_ROLE_KEY|SECRET_KEY)="?([^"\n]+)"?$/m.exec(out);
  if (!match) throw new Error("no se encontró la clave de servicio local");
  return match[1];
}

const invoke = async (job, { secret = CRON_SECRET, method = "POST" } = {}) => {
  const headers = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-cron-secret"] = secret;
  const response = await fetch(FUNCTION_URL, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify({ job }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const mock = {
  reset: () => fetch(`${MOCK}/__reset`, { method: "POST" }),
  script: (modes) =>
    fetch(`${MOCK}/__script`, { method: "POST", body: JSON.stringify({ modes }) }),
  requests: async () => (await (await fetch(`${MOCK}/__requests`)).json()).requests,
  deliveries: async () => (await (await fetch(`${MOCK}/__requests`)).json()).deliveries,
};
// Solo las solicitudes dirigidas a destinatarios de ESTA corrida.
const mine = async () =>
  (await mock.requests()).filter((r) => (r.to ?? []).some((t) => t.includes(RUN)));

const today = "(now() at time zone 'America/Mazatlan')::date";
const batches = (storeId) =>
  sql(
    `select id, status, attempts, coalesce(last_error,''), provider_message_id is not null,
            jsonb_array_length(error_history), snapshot_at is not null
     from public.notification_batches where store_id = '${storeId}' order by created_at`,
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, status, attempts, lastError, hasId, history, hasSnapshot] = line.split("|");
      return { id, status, attempts: Number(attempts), lastError, hasId: hasId === "t", history: Number(history), hasSnapshot: hasSnapshot === "t" };
    });

// --- datos de prueba --------------------------------------------------------
async function createUser(key, body) {
  const response = await fetch("http://127.0.0.1:54321/auth/v1/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`no se pudo crear el usuario de prueba (${response.status})`);
  return json.id;
}

function addStore(id, name, owner) {
  sql(`insert into public.stores (id, name, created_by) values ('${id}', '${name}', '${owner}')`);
  const productId = randomUUID();
  sql(`insert into public.products (id, store_id, name, unit) values ('${productId}', '${id}', 'Leche ${name}', 'litro')`);
  return productId;
}
function addLot(storeId, productId, code, expOffset, qty = 5) {
  sql(
    `insert into public.lots (store_id, product_id, supplier_lot_code, entry_date, expiration_date, initial_quantity)
     values ('${storeId}', '${productId}', '${code}', ${today} - 10, ${today} + ${expOffset}, ${qty})`,
  );
}

// --- ejecución --------------------------------------------------------------
const key = serviceKey();
const emailA = `e2e-${RUN}-a@example.test`;
const emailB = `e2e-${RUN}-b@example.test`;
const userA = await createUser(key, { email: emailA, email_confirm: true, password: randomUUID() });
const userB = await createUser(key, { email: emailB, email_confirm: true, password: randomUUID() });
const userC = await createUser(key, { phone: `+5255${String(Date.now()).slice(-8)}`, phone_confirm: true, password: randomUUID() });

const storeA = randomUUID(), storeB = randomUUID(), storeC = randomUUID();
const prodA = addStore(storeA, `A ${RUN}`, userA);
const prodB = addStore(storeB, `B ${RUN}`, userB);
const prodC = addStore(storeC, `C ${RUN}`, userC);
addLot(storeA, prodA, "A-VENCIDO", -2);
addLot(storeA, prodA, "A-POR-VENCER", 3);
addLot(storeA, prodA, "A-VIGENTE", 60);
addLot(storeA, prodA, "A-AGOTADO", -1);
sql(`update public.lots set current_quantity = 0 where supplier_lot_code = 'A-AGOTADO' and store_id = '${storeA}'`);
addLot(storeB, prodB, "B-POR-VENCER", 2);
addLot(storeC, prodC, "C-POR-VENCER", 1);

await mock.reset();
console.log(`\n== Corrida ${RUN} ==\n`);

// 1. Autorización
let r = await invoke("urgent_alerts", { secret: null });
check("sin secreto -> 401", r.status === 401 && r.body?.error === "unauthorized");
r = await invoke("urgent_alerts", { secret: "incorrecto" });
check("secreto incorrecto -> 401", r.status === 401);
r = await invoke("urgent_alerts", { secret: null, method: "GET" });
check("GET sin secreto -> 401", r.status === 401);
check("las invocaciones no autorizadas no llegaron a Resend ni a la base",
  (await mock.requests()).length === 0 && Number(sql(`select count(*) from public.notification_log where store_id = '${storeA}'`)) === 0);
r = await invoke("borrar_todo");
check("job inválido con secreto correcto -> 400", r.status === 400);

// 2. Solicitud autorizada: A y B reciben su correo; C (sin correo) falla
r = await invoke("urgent_alerts");
check("solicitud autorizada llega a la función (200)", r.status === 200, JSON.stringify(r.body));
let reqs = await mine();
const toA = reqs.filter((x) => x.to.includes(emailA));
const toB = reqs.filter((x) => x.to.includes(emailB));
check("tienda A recibe un solo correo urgente", toA.length === 1);
check("tienda B recibe un solo correo urgente", toB.length === 1);
check("la solicitud a Resend llevó la clave de API de prueba", reqs.every((x) => x.authOk));
check("clave de idempotencia con formato batch:<id>", reqs.every((x) => /^batch:[0-9a-f-]{36}$/.test(x.key)));
check("claves distintas por tienda", new Set(reqs.map((x) => x.key)).size === reqs.length);
let bA = batches(storeA), bB = batches(storeB), bC = batches(storeC);
check("A: envío confirmado con id de mensaje", bA.length === 1 && bA[0].status === "sent" && bA[0].hasId && bA[0].attempts === 1, JSON.stringify(bA));
check("B: envío confirmado con id de mensaje", bB.length === 1 && bB[0].status === "sent" && bB[0].hasId);
check("C (sin correo en Auth): fallido recipient_missing, sin instantánea, sin envío",
  bC.length === 1 && bC[0].status === "failed" && bC[0].lastError === "recipient_missing" && !bC[0].hasSnapshot && !bC[0].hasId);
const itemsA = sql(`select status, notified_status from public.notification_log where store_id = '${storeA}' and kind = 'urgent_alert' order by notified_status`);
check("A: solo se alertaron el lote vencido y el por vencer (no vigente ni agotado)", itemsA === "sent|por_vencer\nsent|vencido", itemsA);
const bodyHtml = sql(`select html from public.notification_batches where id = '${bA[0].id}'`);
check("el correo de A incluye sus lotes y NO los de otras tiendas",
  bodyHtml.includes(`Leche A ${RUN}`) && !bodyHtml.includes(`Leche B ${RUN}`) && !bodyHtml.includes(`Leche C ${RUN}`));
check("el vencido se rotula como no apto para la venta", bodyHtml.includes("no apto para la venta"));

// 3. Sin repeticiones
const countAB = async () =>
  (await mine()).filter((x) => x.to.includes(emailA) || x.to.includes(emailB)).length;
const beforeAB = await countAB();
await invoke("urgent_alerts");
check("segunda ejecución no envía alertas repetidas (A y B)", (await countAB()) === beforeAB);
check("A y B siguen con 1 envío cada una",
  batches(storeA).length === 1 && batches(storeB).length === 1);

// 4. Fallo temporal de Resend -> reintento con la MISMA clave y MISMO contenido, aunque cambien los datos
addLot(storeA, prodA, "A-LOTE-2", 1, 8);
await mock.script(["fail500"]);
const sizeBefore = (await mine()).length;
await invoke("urgent_alerts");
let afterFail = (await mine()).slice(sizeBefore);
check("fallo 500 de Resend -> un intento", afterFail.length === 1 && afterFail[0].status === 500);
let failed = batches(storeA).find((b) => b.status === "failed");
check("el envío queda fallido (no enviado) con el error guardado y su historial",
  failed && failed.lastError.startsWith("resend_http_500") && !failed.hasId && failed.hasSnapshot && failed.history === 1, JSON.stringify(failed));
const firstKey = afterFail[0].key, firstHash = afterFail[0].htmlHash;
sql(`update public.lots set current_quantity = 1, expiration_date = ${today} + 2 where supplier_lot_code = 'A-LOTE-2' and store_id = '${storeA}'`);
await invoke("urgent_alerts");
const retry = (await mine()).slice(sizeBefore + 1);
check("el reintento conserva la clave de idempotencia", retry.length === 1 && retry[0].key === firstKey);
check("el reintento conserva el contenido exacto (hash del HTML)", retry[0].htmlHash === firstHash);
check("tras el reintento exitoso queda enviado con intentos = 2",
  batches(storeA).some((b) => b.id && b.status === "sent" && b.attempts === 2 && b.hasId));

// 5. Resend recibe el correo pero TADUKA no registra la respuesta
addLot(storeA, prodA, "A-LOTE-3", 2, 4);
await mock.script(["accept_then_500"]);
const delBefore = await mock.deliveries();
const s5 = (await mine()).length;
await invoke("urgent_alerts");
check("Resend aceptó el correo pero respondió error: TADUKA lo deja fallido", batches(storeA).filter((b) => b.status === "failed").length === 1);
await invoke("urgent_alerts");
const s5reqs = (await mine()).slice(s5);
check("el reintento reutiliza la clave y Resend responde con la respuesta original (replay)",
  s5reqs.length === 2 && s5reqs[0].key === s5reqs[1].key && s5reqs[1].replay === true && s5reqs[1].status === 200);
check("no se entregó un segundo correo", (await mock.deliveries()) === delBefore + 1);
check("el envío termina confirmado", batches(storeA).every((b) => b.status === "sent"));

// 6. Conflicto de idempotencia 409: no se cambia de clave y nunca se marca como enviado
addLot(storeB, prodB, "B-LOTE-2", 3, 3);
await mock.script(["conflict409", "conflict409", "conflict409", "conflict409", "conflict409", "conflict409"]);
const s6 = (await mine()).length;
for (let i = 0; i < 6; i++) await invoke("urgent_alerts");
const s6reqs = (await mine()).slice(s6);
check("409: exactamente 5 intentos (tope) con la misma clave", s6reqs.length === 5 && new Set(s6reqs.map((x) => x.key)).size === 1, `${s6reqs.length} solicitudes`);
const b409 = batches(storeB).find((b) => b.status === "failed");
check("409: el envío queda fallido, sin id de mensaje, con historial de 5 errores",
  b409 && !b409.hasId && b409.attempts === 5 && b409.history >= 5 && b409.lastError.includes("409_invalid_idempotent_request"), JSON.stringify(b409));
check("409: el sexto intento ya no llegó a Resend", s6reqs.length === 5);

// 7. Respuesta 200 sin id: no cuenta como enviado
addLot(storeA, prodA, "A-LOTE-4", 2, 2);
await mock.script(["noid"]);
const s7 = (await mine()).length;
await invoke("urgent_alerts");
const noId = batches(storeA).find((b) => b.status === "failed");
check("200 sin id -> fallido con resend_respuesta_invalida y sin id guardado",
  noId && noId.lastError === "resend_respuesta_invalida" && !noId.hasId, JSON.stringify(noId));
await invoke("urgent_alerts");
check("su reintento (misma clave) lo confirma sin duplicar",
  batches(storeA).every((b) => b.status === "sent") && (await mine()).slice(s7).length === 2);

// 8. Pendiente abandonado con intentos agotados -> fallido sin enviar
const abandonedId = b409.id;
sql(`update public.notification_batches set status = 'pending', attempts = 5, attempted_at = now() - interval '1 hour' where id = '${abandonedId}'`);
sql(`update public.notification_log set status = 'pending' where batch_id = '${abandonedId}'`);
const s8 = (await mine()).length;
await invoke("urgent_alerts");
const ab = sql(`select status, last_error from public.notification_batches where id = '${abandonedId}'`);
check("pendiente abandonado -> fallido 'abandonado' sin contactar a Resend", ab === "failed|abandonado" && (await mine()).length === s8, ab);

// 9. Concurrencia: 6 invocaciones simultáneas con una alerta nueva
addLot(storeA, prodA, "A-CONCURRENTE", 1, 6);
const s9 = (await mine()).length;
const results = await Promise.all(Array.from({ length: 6 }, () => invoke("urgent_alerts")));
const s9reqs = (await mine()).slice(s9);
check("6 invocaciones simultáneas -> una sola solicitud a Resend", s9reqs.length === 1, `${s9reqs.length}`);
check("todas respondieron 200", results.every((x) => x.status === 200));
check("el reclamo lo obtuvo una sola ejecución",
  results.reduce((n, x) => n + (x.body?.claimed ?? 0), 0) >= 1 && s9reqs.length === 1);
check("el envío concurrente quedó enviado una vez", batches(storeA).filter((b) => b.status === "sent").length === 5 && Number(sql(`select count(*) from public.notification_batches where store_id = '${storeA}' and status = 'pending'`)) === 0);

// 10. Resumen diario
const mazatlanHour = Number(
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Mazatlan", hour: "2-digit", hourCycle: "h23" }).format(new Date()),
);
const s10 = (await mine()).length;
r = await invoke("daily_summary");
// E2E_WINDOW_WIDE=1: la ventana horaria de time.ts se ensanchó TEMPORALMENTE para esta prueba.
if (process.env.E2E_WINDOW_WIDE === "1" || (mazatlanHour >= 7 && mazatlanHour < 12)) {
  const daily = (await mine()).slice(s10);
  const dailyA = daily.filter((x) => x.to.includes(emailA));
  const dailyB = daily.filter((x) => x.to.includes(emailB));
  check(`resumen diario dentro de la ventana (hora local ${mazatlanHour}): un correo por tienda con correo`,
    r.status === 200 && dailyA.length === 1 && dailyB.length === 1, JSON.stringify(r.body));
  check("el resumen de A usa una clave batch:<id> distinta de las alertas",
    dailyA.length === 1 && /^batch:/.test(dailyA[0].key) && !(await mine()).slice(0, s10).some((x) => x.key === dailyA[0].key));
  check("el resumen de A está ordenado e incluye solo A",
    (() => { const h = sql(`select html from public.notification_batches where store_id = '${storeA}' and kind = 'daily_summary'`);
      return h.includes(`Leche A ${RUN}`) && !h.includes(`Leche B ${RUN}`) && h.indexOf("Resumen diario") >= 0; })());
  const dailyBatches = sql(`select status, attempts, provider_message_id is not null from public.notification_batches where store_id = '${storeA}' and kind = 'daily_summary'`);
  check("el resumen de A queda enviado con id de mensaje", dailyBatches === "sent|1|t", dailyBatches);
  check("C (sin correo) falla el resumen con recipient_missing",
    sql(`select status || '|' || coalesce(last_error,'') from public.notification_batches where store_id = '${storeC}' and kind = 'daily_summary'`) === "failed|recipient_missing");
  const again = (await mine()).length;
  await invoke("daily_summary");
  check("el resumen no se repite el mismo día", (await mine()).length === again);
} else {
  check(`resumen diario fuera de la ventana (hora local ${mazatlanHour}): omitido sin enviar`,
    r.status === 200 && r.body?.skipped === "fuera_de_horario" && (await mine()).length === s10, JSON.stringify(r.body));
}

// 11. Higiene de logs: ningún secreto en los logs del runtime ni en las solicitudes registradas
const logs = execFileSync("docker", ["logs", "supabase_edge_runtime_TADUKA"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
check("los logs del runtime no contienen CRON_SECRET", !logs.includes(CRON_SECRET));
check("los logs del runtime no contienen la clave de Resend de prueba", !logs.includes(env.RESEND_API_KEY));
check("los logs del runtime no contienen la clave de servicio", !logs.includes(key));
check("los logs del runtime no contienen los correos de destino", !logs.includes(emailA) && !logs.includes(emailB));

console.log(`\n${failures === 0 ? "TODO OK" : `${failures} comprobaciones FALLARON`}`);
process.exit(failures === 0 ? 0 : 1);
