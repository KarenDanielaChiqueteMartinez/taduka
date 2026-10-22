import { buildDailySummary, buildUrgentAlert } from "./email.ts";
import { localDateTime, SUMMARY_END_HOUR, SUMMARY_START_HOUR } from "./time.ts";
import type { Batch, BatchItem, Deps, Job, LotRow, Snapshot, Store } from "./types.ts";

export type JobResult = {
  job: Job;
  skipped?: "fuera_de_horario";
  // Conteos por envío (un envío = un correo).
  claimed: number;
  sent: number;
  failed: number;
  omitted: number;
};

type Tally = Pick<JobResult, "sent" | "failed" | "omitted">;
type Built = { snapshot: Snapshot } | { outcome: "failed" | "skipped" };

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 120);
}

// Destinatario: solo la cuenta que creó la tienda (stores.created_by), resuelta en Auth.
async function resolveRecipient(deps: Deps, store: Store, batch: Batch): Promise<string | null> {
  try {
    const email = await deps.directory.getEmail(store.created_by);
    if (email && email.trim()) return email.trim();
    deps.logger.error("notificaciones: la cuenta que creó la tienda no tiene correo", {
      storeId: store.id,
      batchId: batch.id,
    });
    await deps.db.finishFailed(batch.id, "recipient_missing");
  } catch (error) {
    deps.logger.error("notificaciones: no se pudo resolver el destinatario", {
      storeId: store.id,
      batchId: batch.id,
      error: errorCode(error),
    });
    await deps.db.finishFailed(batch.id, "recipient_lookup_failed");
  }
  return null;
}

// Construye el correo por primera vez (solo si el envío aún no tiene instantánea).
async function buildSnapshot(deps: Deps, batch: Batch): Promise<Built> {
  const store = await deps.db.getStore(batch.storeId);
  if (!store) {
    await deps.db.skipBatch(batch.id, "tienda_no_encontrada");
    return { outcome: "skipped" };
  }
  const items = await deps.db.getBatchItems(batch.id);
  if (items.length === 0) {
    await deps.db.skipBatch(batch.id, "sin_filas_pendientes");
    return { outcome: "skipped" };
  }

  let lots: LotRow[];
  let localDate = "";
  if (batch.kind === "urgent_alert") {
    // Se vuelven a leer los lotes de ESTA tienda: agotados o con otro estado se omiten.
    const read = await deps.db.getLotsByIds(
      store.id,
      items.flatMap((i) => (i.lotId ? [i.lotId] : [])),
    );
    const byId = new Map<string, LotRow>(read.map((l) => [l.id, l]));
    const applies = (i: BatchItem) => {
      const lot = i.lotId ? byId.get(i.lotId) : undefined;
      return lot !== undefined && lot.current_quantity > 0 && lot.status === i.notifiedStatus;
    };
    const stale = items.filter((i) => !applies(i));
    if (stale.length > 0) await deps.db.skipItems(stale.map((i) => i.logId), "ya_no_aplica");
    const kept = items.filter(applies);
    if (kept.length === 0) {
      await deps.db.skipBatch(batch.id, "ya_no_aplica");
      return { outcome: "skipped" };
    }
    lots = kept.map((i) => byId.get(i.lotId!)!);
  } else {
    localDate = items[0].localDate ?? "";
    lots = await deps.db.getAttentionLots(store.id);
  }

  const recipient = await resolveRecipient(deps, store, batch);
  if (!recipient) return { outcome: "failed" };

  const message =
    batch.kind === "urgent_alert"
      ? buildUrgentAlert({
          storeName: store.name,
          alertDays: store.expiry_alert_days,
          lots,
          appUrl: deps.appUrl,
        })
      : buildDailySummary({
          storeName: store.name,
          localDate,
          alertDays: store.expiry_alert_days,
          lots,
          appUrl: deps.appUrl,
        });
  return { snapshot: { recipient, ...message } };
}

async function processBatch(deps: Deps, batch: Batch, tally: Tally) {
  try {
    let snapshot = batch.snapshot;
    if (!snapshot) {
      const built = await buildSnapshot(deps, batch);
      if ("outcome" in built) {
        if (built.outcome === "failed") tally.failed += 1;
        else tally.omitted += 1;
        return;
      }
      // La instantánea se persiste ANTES del primer envío: si algo falla después, el
      // reintento enviará exactamente este contenido con la misma clave.
      if (!(await deps.db.saveSnapshot(batch.id, built.snapshot))) {
        await deps.db.finishFailed(batch.id, "snapshot_no_guardada");
        tally.failed += 1;
        return;
      }
      snapshot = built.snapshot;
    }

    let messageId: string;
    try {
      const result = await deps.mailer.send({
        to: snapshot.recipient,
        subject: snapshot.subject,
        html: snapshot.html,
        text: snapshot.text,
        // Siempre la misma clave para este envío; nunca se genera una nueva tras un 409.
        idempotencyKey: `batch:${batch.id}`,
      });
      messageId = result.id;
    } catch (error) {
      deps.logger.error("notificaciones: el proveedor no confirmó el envío", {
        storeId: batch.storeId,
        batchId: batch.id,
        attempt: batch.attempts,
        error: errorCode(error),
      });
      await deps.db.finishFailed(batch.id, errorCode(error));
      tally.failed += 1;
      return;
    }

    // Solo con respuesta satisfactoria (id de Resend) se cierra como enviado.
    try {
      if (!(await deps.db.finishSent(batch.id, messageId))) {
        deps.logger.error("notificaciones: el envío ya no estaba pendiente al confirmarlo", {
          batchId: batch.id,
        });
      }
    } catch (error) {
      // Se envió pero no se registró: queda pendiente y su reintento reutiliza clave y contenido.
      deps.logger.error("notificaciones: se envió pero no se pudo registrar", {
        storeId: batch.storeId,
        batchId: batch.id,
        error: errorCode(error),
      });
    }
    tally.sent += 1;
  } catch (error) {
    deps.logger.error("notificaciones: error procesando el envío", {
      storeId: batch.storeId,
      batchId: batch.id,
      error: errorCode(error),
    });
    await deps.db.finishFailed(batch.id, "error_interno").catch(() => undefined);
    tally.failed += 1;
  }
}

async function runBatches(job: Job, deps: Deps, kind: Batch["kind"]): Promise<JobResult> {
  const result: JobResult = { job, claimed: 0, sent: 0, failed: 0, omitted: 0 };
  await deps.db.assembleBatches();
  const batches = await deps.db.claimBatches(kind);
  result.claimed = batches.length;
  for (const batch of batches) await processBatch(deps, batch, result);
  return result;
}

async function runDaily(deps: Deps, now: Date): Promise<JobResult> {
  const local = localDateTime(now);
  if (local.hour < SUMMARY_START_HOUR || local.hour >= SUMMARY_END_HOUR) {
    return { job: "daily_summary", skipped: "fuera_de_horario", claimed: 0, sent: 0, failed: 0, omitted: 0 };
  }
  await deps.db.detectDailyItems(local.date);
  return runBatches("daily_summary", deps, "daily_summary");
}

async function runUrgent(deps: Deps): Promise<JobResult> {
  await deps.db.detectUrgentItems();
  return runBatches("urgent_alerts", deps, "urgent_alert");
}

export function runJob(job: Job, deps: Deps, now: Date = new Date()): Promise<JobResult> {
  return job === "daily_summary" ? runDaily(deps, now) : runUrgent(deps);
}
