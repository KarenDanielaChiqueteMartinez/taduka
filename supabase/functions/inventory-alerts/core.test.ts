import assert from "node:assert/strict";
import { test } from "node:test";
import { runJob } from "./core.ts";
import { lot, makeFakes, store } from "./fakes.ts";

// 2026-10-22 14:30 UTC = 07:30 en America/Mazatlan (UTC-7).
const MORNING = new Date("2026-10-22T14:30:00Z");
const MORNING_LATER = new Date("2026-10-22T16:00:00Z");
// 2026-10-22 10:00 UTC = 03:00 local.
const NIGHT = new Date("2026-10-22T10:00:00Z");

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const base = {
  stores: [store(A, "Tienda A", "user-a"), store(B, "Tienda B", "user-b")],
  emails: { "user-a": "a@example.test", "user-b": "b@example.test" } as Record<string, string | null>,
};

// ---------------------------------------------------------------------------
// Contenido de los correos
// ---------------------------------------------------------------------------

test("resumen diario: cuenta vencidos y por vencer y ordena por caducidad", async () => {
  const f = makeFakes({
    ...base,
    lots: [
      lot("3", A, { product_name: "Yogur", expiration_date: "2026-10-28", status: "por_vencer", days_to_expiry: 6 }),
      lot("1", A, { product_name: "Leche", expiration_date: "2026-10-20", status: "vencido", days_to_expiry: -2 }),
      lot("2", A, { product_name: "Queso", expiration_date: "2026-10-25", status: "por_vencer", days_to_expiry: 3 }),
    ],
  });
  const result = await runJob("daily_summary", f.deps, MORNING);
  assert.equal(result.sent, 2);
  const mail = f.deliveries().find((m) => m.to === "a@example.test")!;
  assert.match(mail.html, /Vencidos con existencia:<\/strong> 1/);
  assert.match(mail.html, /Por vencer<\/strong> \(en 7 días o menos\)<strong>:<\/strong> 2/);
  const positions = ["Leche", "Queso", "Yogur"].map((n) => mail.html.indexOf(n));
  assert.ok(positions.every((p) => p > 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "orden ascendente por caducidad");
  assert.match(mail.html, /no apto para la venta/);
  assert.match(mail.html, /lang="es"/);
  assert.match(mail.html, /https:\/\/app\.example\.test\/lots\?product=/);
});

test("resumen diario sin alertas: se envía el aviso de que no hay pendientes", async () => {
  const f = makeFakes({ ...base, lots: [lot("1", A, { status: "vigente", days_to_expiry: 40 })] });
  const result = await runJob("daily_summary", f.deps, MORNING);
  assert.equal(result.sent, 2);
  const mail = f.deliveries().find((m) => m.to === "a@example.test")!;
  assert.match(mail.subject, /Sin alertas/);
  assert.match(mail.html, /no hay alertas pendientes/);
});

test("resumen diario: excluye lotes agotados", async () => {
  const f = makeFakes({
    ...base,
    lots: [lot("1", A, { product_name: "Agotado", current_quantity: 0, status: "vencido", days_to_expiry: -1 })],
  });
  await runJob("daily_summary", f.deps, MORNING);
  const mail = f.deliveries().find((m) => m.to === "a@example.test")!;
  assert.doesNotMatch(mail.html, /Agotado/);
  assert.match(mail.subject, /Sin alertas/);
});

test("resumen diario: solo una vez por tienda y fecha local", async () => {
  const f = makeFakes({ ...base, lots: [] });
  await runJob("daily_summary", f.deps, MORNING);
  const second = await runJob("daily_summary", f.deps, MORNING_LATER);
  assert.equal(second.claimed, 0);
  assert.equal(f.deliveries().length, 2);
  const nextDay = await runJob("daily_summary", f.deps, new Date("2026-10-23T14:30:00Z"));
  assert.equal(nextDay.sent, 2);
});

test("resumen diario: fuera del horario local no se detecta ni se envía nada", async () => {
  const f = makeFakes({ ...base, lots: [] });
  const result = await runJob("daily_summary", f.deps, NIGHT);
  assert.equal(result.skipped, "fuera_de_horario");
  assert.equal(f.calls.length, 0);
  assert.equal(f.items.length, 0);
});

// ---------------------------------------------------------------------------
// Alertas urgentes
// ---------------------------------------------------------------------------

test("alerta urgente: una sola vez por lote y estado", async () => {
  const f = makeFakes({ ...base, lots: [lot("1", A)] });
  const first = await runJob("urgent_alerts", f.deps);
  const second = await runJob("urgent_alerts", f.deps);
  assert.equal(first.sent, 1);
  assert.equal(second.claimed, 0);
  assert.equal(f.deliveries().length, 1);
});

test("alerta urgente: nueva alerta, en un envío nuevo, al pasar de por_vencer a vencido", async () => {
  const lots = [lot("1", A, { status: "por_vencer" })];
  const f = makeFakes({ ...base, lots });
  await runJob("urgent_alerts", f.deps);
  lots[0] = { ...lots[0], status: "vencido", days_to_expiry: -1 };
  const result = await runJob("urgent_alerts", f.deps);
  assert.equal(result.sent, 1);
  assert.equal(f.deliveries().length, 2);
  assert.match(f.deliveries()[1].subject, /vencido/);
  assert.match(f.deliveries()[1].html, /VENCIDO · no apto para la venta/);
  assert.equal(f.batches.length, 2, "el envío anterior no se modifica");
});

test("alerta urgente: ignora lotes agotados y vigentes", async () => {
  const f = makeFakes({
    ...base,
    lots: [lot("1", A, { current_quantity: 0 }), lot("2", A, { status: "vigente", days_to_expiry: 30 })],
  });
  const result = await runJob("urgent_alerts", f.deps);
  assert.equal(result.claimed, 0);
  assert.equal(f.calls.length, 0);
});

test("alerta urgente: si el lote se agotó antes de armar el correo, se omite sin enviar", async () => {
  const lots = [lot("1", A)];
  const f = makeFakes({ ...base, lots });
  const originalAssemble = f.deps.db.assembleBatches;
  f.deps.db.assembleBatches = async () => {
    await originalAssemble();
    lots[0] = { ...lots[0], current_quantity: 0 }; // se vendió entre la detección y el envío
  };
  const result = await runJob("urgent_alerts", f.deps);
  assert.equal(result.omitted, 1);
  assert.equal(f.calls.length, 0);
  assert.equal(f.batches[0].status, "skipped");
  assert.equal(f.items[0].status, "skipped");
});

// ---------------------------------------------------------------------------
// Idempotencia, reintentos y contenido inmutable
// ---------------------------------------------------------------------------

test("fallo de Resend: queda fallido, se reintenta y se confirma con la misma clave", async () => {
  const f = makeFakes({ ...base, lots: [lot("1", A)], behaviors: ["fail"] });
  const first = await runJob("urgent_alerts", f.deps);
  assert.equal(first.failed, 1);
  assert.equal(f.deliveries().length, 0);
  assert.equal(f.batches[0].status, "failed");

  const retry = await runJob("urgent_alerts", f.deps);
  assert.equal(retry.sent, 1);
  assert.equal(f.batches[0].status, "sent");
  assert.equal(f.batches[0].attempts, 2);
  assert.equal(f.batches[0].messageId, "msg-1");
  assert.deepEqual(f.batches[0].history, ["resend_http_500"], "se conserva el historial del fallo");
  assert.equal(f.calls[0].idempotencyKey, f.calls[1].idempotencyKey);
  assert.match(f.calls[0].idempotencyKey, /^batch:batch-\d+$/);
});

test("el reintento envía EXACTAMENTE el mismo contenido aunque los datos hayan cambiado", async () => {
  const lots = [lot("1", A, { current_quantity: 5, days_to_expiry: 3 })];
  const f = makeFakes({ ...base, lots, behaviors: ["fail", "fail"] });
  await runJob("urgent_alerts", f.deps);
  // Entre intentos cambian la existencia y los días restantes.
  lots[0] = { ...lots[0], current_quantity: 2, days_to_expiry: 2 };
  await runJob("urgent_alerts", f.deps);
  lots[0] = { ...lots[0], current_quantity: 1, days_to_expiry: 1 };
  await runJob("urgent_alerts", f.deps);

  assert.equal(f.calls.length, 3);
  assert.equal(new Set(f.calls.map((c) => c.idempotencyKey)).size, 1);
  assert.equal(new Set(f.calls.map((c) => c.html)).size, 1, "mismo HTML en los 3 intentos");
  assert.equal(new Set(f.calls.map((c) => c.subject)).size, 1);
  assert.match(f.calls[2].html, /caduca en 3 días/, "conserva el texto del primer intento");
  assert.equal(f.batches[0].status, "sent");
  assert.equal(f.deliveries().length, 1);
});

test("el grupo de alertas no cambia entre reintentos: una alerta nueva va en un envío aparte", async () => {
  const lots = [lot("1", A)];
  const f = makeFakes({ ...base, lots, behaviors: ["fail"] });
  await runJob("urgent_alerts", f.deps); // el lote 1 falla
  lots.push(lot("2", A, { product_name: "Nuevo lote" }));
  const result = await runJob("urgent_alerts", f.deps);
  assert.equal(result.sent, 2, "reintento del envío 1 + envío nuevo para el lote 2");
  const keys = f.calls.map((c) => c.idempotencyKey);
  assert.equal(new Set(keys).size, 2);
  const retried = f.calls.filter((c) => c.idempotencyKey === keys[0]);
  assert.equal(retried.length, 2);
  assert.doesNotMatch(retried[1].html, /Nuevo lote/, "el envío reintentado no incorpora lotes nuevos");
  assert.equal(f.deliveries().length, 2);
});

test("Resend recibió el correo pero TADUKA no registró la respuesta: el reintento no duplica", async () => {
  const f = makeFakes({ ...base, lots: [lot("1", A)], behaviors: ["accept_then_error"] });
  const first = await runJob("urgent_alerts", f.deps);
  assert.equal(first.failed, 1, "TADUKA ve un error y lo deja fallido (no enviado)");
  assert.equal(f.deliveries().length, 1, "pero Resend sí entregó el correo");

  const retry = await runJob("urgent_alerts", f.deps);
  assert.equal(retry.sent, 1);
  assert.equal(f.deliveries().length, 1, "la misma clave y contenido devuelven la respuesta original");
  assert.equal(f.batches[0].status, "sent");
  assert.equal(f.batches[0].messageId, "msg-1");
});

test("se envió pero falló el registro en la base: queda pendiente y el reintento reutiliza clave y contenido", async () => {
  const f = makeFakes({ ...base, lots: [lot("1", A)] });
  const realFinishSent = f.deps.db.finishSent;
  f.deps.db.finishSent = () => Promise.reject(new Error("db caída"));
  const first = await runJob("urgent_alerts", f.deps);
  assert.equal(first.failed, 0, "no se marca como fallido algo que sí salió");
  assert.equal(f.batches[0].status, "pending");
  assert.ok(f.errors.some((e) => /no se pudo registrar/.test(e)));

  f.deps.db.finishSent = realFinishSent;
  f.batches[0].stale = true; // pasaron los 15 minutos de abandono
  const retry = await runJob("urgent_alerts", f.deps);
  assert.equal(retry.sent, 1);
  assert.equal(f.deliveries().length, 1, "Resend devolvió la respuesta original, sin segundo correo");
  assert.equal(f.calls[0].idempotencyKey, f.calls[1].idempotencyKey);
  assert.equal(f.batches[0].status, "sent");
});

test("409 invalid_idempotent_request: no se genera una clave nueva y nunca se marca como enviado", async () => {
  const f = makeFakes({ ...base, lots: [lot("1", A)], failWith: "resend_http_409_invalid_idempotent_request" });
  for (let i = 0; i < 7; i++) await runJob("urgent_alerts", f.deps);
  assert.equal(new Set(f.calls.map((c) => c.idempotencyKey)).size, 1, "siempre la misma clave");
  assert.equal(f.calls.length, 5, "se detiene al agotar los intentos");
  assert.equal(f.batches[0].status, "failed");
  assert.equal(f.batches[0].lastError, "resend_http_409_invalid_idempotent_request");
  assert.equal(f.batches[0].history.length, 5, "el historial conserva cada fallo");
  assert.equal(f.deliveries().length, 0);
});

test("respuesta sin id de mensaje: no cuenta como enviado", async () => {
  const f = makeFakes({ ...base, lots: [lot("1", A)], behaviors: ["no_id"] });
  const result = await runJob("urgent_alerts", f.deps);
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.equal(f.batches[0].status, "failed");
  assert.equal(f.batches[0].messageId, undefined);
  assert.equal(f.batches[0].lastError, "resend_respuesta_invalida");
});

test("agotamiento de intentos: tras 5 fallos queda fallido y no se vuelve a intentar", async () => {
  const f = makeFakes({ ...base, lots: [lot("1", A)], failWith: "resend_http_500" });
  for (let i = 0; i < 8; i++) await runJob("urgent_alerts", f.deps);
  assert.equal(f.calls.length, 5);
  assert.equal(f.batches[0].attempts, 5);
  assert.equal(f.batches[0].status, "failed");
  assert.ok(f.items.every((i) => i.status === "failed"));
});

test("pendiente abandonado sin intentos restantes: se marca fallido sin enviar", async () => {
  const f = makeFakes({ ...base, lots: [lot("1", A)] });
  await f.deps.db.detectUrgentItems();
  await f.deps.db.assembleBatches();
  Object.assign(f.batches[0], { status: "pending", attempts: 5, stale: true });
  const result = await runJob("urgent_alerts", f.deps);
  assert.equal(result.claimed, 0);
  assert.equal(f.calls.length, 0);
  assert.equal(f.batches[0].status, "failed");
  assert.equal(f.batches[0].lastError, "abandonado");
  assert.ok(f.items.every((i) => i.status === "failed"));
});

test("ejecuciones simultáneas no duplican el envío", async () => {
  const f = makeFakes({ ...base, lots: [lot("1", A)] });
  const results = await Promise.all([
    runJob("urgent_alerts", f.deps),
    runJob("urgent_alerts", f.deps),
    runJob("urgent_alerts", f.deps),
  ]);
  assert.equal(results.reduce((n, r) => n + r.claimed, 0), 1, "solo una ejecución reclama el envío");
  assert.equal(f.calls.length, 1);
  assert.equal(f.deliveries().length, 1);
});

test("un correo fallido nunca se marca como enviado", async () => {
  const f = makeFakes({ ...base, lots: [], failWith: "resend_http_500" });
  const result = await runJob("daily_summary", f.deps, MORNING);
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 2);
  assert.ok(f.batches.every((b) => b.status === "failed" && !b.messageId));
});

// ---------------------------------------------------------------------------
// Aislamiento y destinatario
// ---------------------------------------------------------------------------

test("aislamiento: cada correo solo incluye lotes de su propia tienda", async () => {
  const f = makeFakes({
    ...base,
    lots: [lot("1", A, { product_name: "Solo de A" }), lot("2", B, { product_name: "Solo de B" })],
  });
  await runJob("urgent_alerts", f.deps);
  const toA = f.deliveries().find((m) => m.to === "a@example.test")!;
  const toB = f.deliveries().find((m) => m.to === "b@example.test")!;
  assert.match(toA.html, /Solo de A/);
  assert.doesNotMatch(toA.html, /Solo de B/);
  assert.match(toB.html, /Solo de B/);
  assert.doesNotMatch(toB.html, /Solo de A/);
  assert.equal(f.batches.length, 2);

  const daily = makeFakes({ ...base, lots: [lot("1", A, { product_name: "Solo de A" })] });
  await runJob("daily_summary", daily.deps, MORNING);
  const mailB = daily.deliveries().find((m) => m.to === "b@example.test")!;
  assert.doesNotMatch(mailB.html, /Solo de A/);
  assert.match(mailB.subject, /Sin alertas/);
});

test("destinatario: sin correo se registra el error, no se inventa uno y luego se puede enviar", async () => {
  const emails: Record<string, string | null> = { "user-a": null, "user-b": "b@example.test" };
  const f = makeFakes({ ...base, emails, lots: [lot("1", A), lot("2", B)] });
  const result = await runJob("urgent_alerts", f.deps);
  assert.equal(result.failed, 1);
  assert.equal(result.sent, 1);
  assert.deepEqual(f.deliveries().map((m) => m.to), ["b@example.test"]);
  assert.ok(f.errors.some((e) => /no tiene correo/.test(e)));
  const failed = f.batches.find((b) => b.storeId === A)!;
  assert.equal(failed.status, "failed");
  assert.equal(failed.lastError, "recipient_missing");
  assert.equal(failed.snapshot, null, "sin destinatario no se fija instantánea");

  emails["user-a"] = "a@example.test"; // se corrige la cuenta
  const retry = await runJob("urgent_alerts", f.deps);
  assert.equal(retry.sent, 1);
  assert.deepEqual(f.deliveries().map((m) => m.to).sort(), ["a@example.test", "b@example.test"]);
});

test("el destinatario queda fijado en la instantánea aunque el correo de la cuenta cambie", async () => {
  const emails: Record<string, string | null> = { "user-a": "a@example.test", "user-b": null };
  const f = makeFakes({ ...base, emails, lots: [lot("1", A)], behaviors: ["fail"] });
  await runJob("urgent_alerts", f.deps);
  emails["user-a"] = "nuevo@example.test";
  await runJob("urgent_alerts", f.deps);
  assert.deepEqual(new Set(f.calls.map((c) => c.to)), new Set(["a@example.test"]));
});

test("el contenido del correo escapa HTML de datos del usuario", async () => {
  const f = makeFakes({
    ...base,
    stores: [store(A, "Tienda <script>x</script>", "user-a")],
    lots: [lot("1", A, { product_name: '<img src=x onerror="alert(1)">' })],
  });
  await runJob("urgent_alerts", f.deps);
  const html = f.deliveries()[0].html;
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});
