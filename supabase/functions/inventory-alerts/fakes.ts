// Dobles de prueba en memoria. Imitan el contrato de las funciones SQL (detect/assemble/claim/
// finish) y el comportamiento de idempotencia de Resend. La semántica real de SQL se prueba con
// pgTAP (supabase/tests/database/02_*) y, de extremo a extremo, contra el runtime local.
import type {
  Batch,
  BatchItem,
  BatchKind,
  Db,
  Deps,
  Directory,
  EmailMessage,
  LotRow,
  Mailer,
  Snapshot,
  Store,
} from "./types.ts";

export type FakeLot = LotRow & { store_id: string };

type Item = {
  id: string;
  storeId: string;
  kind: BatchKind;
  lotId: string | null;
  notified: "por_vencer" | "vencido" | null;
  localDate: string | null;
  batchId: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
};

export type FakeBatch = {
  id: string;
  storeId: string;
  kind: BatchKind;
  status: "pending" | "sent" | "failed" | "skipped";
  attempts: number;
  stale: boolean;
  snapshot: Snapshot | null;
  messageId?: string;
  lastError?: string;
  history: string[];
};

export type SentEmail = EmailMessage & { to: string; idempotencyKey: string };
// Comportamiento del proveedor simulado para cada llamada (en orden); por defecto "ok".
export type Behavior = "ok" | "fail" | "accept_then_error" | "no_id";

const MAX_ATTEMPTS = 5;

export function makeFakes(init: {
  stores: Store[];
  lots: FakeLot[];
  emails: Record<string, string | null>;
  behaviors?: Behavior[];
  // Si se define, todos los envíos rechazan con este error y no entregan nada.
  failWith?: string;
  appUrl?: string;
}) {
  const items: Item[] = [];
  const batches: FakeBatch[] = [];
  const calls: SentEmail[] = [];
  // Correos realmente entregados por el proveedor simulado (deduplicados por clave, como Resend).
  const deliveries = new Map<string, { id: string; payloadHash: string; mail: SentEmail }>();
  const errors: string[] = [];
  let counter = 0;
  let callIndex = 0;
  const nextId = (p: string) => `${p}-${++counter}`;

  const attention = (l: FakeLot) =>
    l.current_quantity > 0 && (l.status === "vencido" || l.status === "por_vencer");
  const toRow = (l: FakeLot): LotRow => {
    const row: Partial<FakeLot> = { ...l };
    delete row.store_id;
    return row as LotRow;
  };
  const publicBatch = (b: FakeBatch): Batch => ({
    id: b.id, storeId: b.storeId, kind: b.kind, attempts: b.attempts, snapshot: b.snapshot,
  });

  const db: Db = {
    detectDailyItems(localDate) {
      for (const s of init.stores) {
        if (!items.some((i) => i.kind === "daily_summary" && i.storeId === s.id && i.localDate === localDate)) {
          items.push({ id: nextId("item"), storeId: s.id, kind: "daily_summary", lotId: null, notified: null, localDate, batchId: null, status: "pending" });
        }
      }
      return Promise.resolve();
    },
    detectUrgentItems() {
      for (const l of init.lots.filter(attention)) {
        const notified = l.status as "por_vencer" | "vencido";
        if (!items.some((i) => i.kind === "urgent_alert" && i.lotId === l.id && i.notified === notified)) {
          items.push({ id: nextId("item"), storeId: l.store_id, kind: "urgent_alert", lotId: l.id, notified, localDate: null, batchId: null, status: "pending" });
        }
      }
      return Promise.resolve();
    },
    assembleBatches() {
      const groups = new Map<string, Item[]>();
      for (const i of items.filter((x) => x.batchId === null && x.status === "pending")) {
        const key = `${i.storeId}|${i.kind}|${i.localDate ?? ""}`;
        groups.set(key, [...(groups.get(key) ?? []), i]);
      }
      for (const group of groups.values()) {
        const b: FakeBatch = {
          id: nextId("batch"), storeId: group[0].storeId, kind: group[0].kind,
          status: "pending", attempts: 0, stale: false, snapshot: null, history: [],
        };
        batches.push(b);
        for (const i of group) i.batchId = b.id;
      }
      return Promise.resolve();
    },
    claimBatches(kind) {
      const claimed: Batch[] = [];
      for (const b of batches.filter((x) => x.kind === kind)) {
        if (b.status === "pending" && b.attempts >= MAX_ATTEMPTS && b.stale) {
          b.status = "failed";
          b.lastError = "abandonado";
          b.history.push("abandonado");
          items.filter((i) => i.batchId === b.id && i.status === "pending").forEach((i) => (i.status = "failed"));
          continue;
        }
        const claimable =
          b.attempts < MAX_ATTEMPTS &&
          ((b.status === "pending" && b.attempts === 0) || b.status === "failed" || (b.status === "pending" && b.stale));
        if (!claimable) continue;
        b.status = "pending";
        b.attempts += 1;
        b.stale = false;
        items.filter((i) => i.batchId === b.id && i.status === "failed").forEach((i) => (i.status = "pending"));
        claimed.push(publicBatch(b));
      }
      return Promise.resolve(claimed);
    },
    getBatchItems: (batchId) =>
      Promise.resolve(
        items
          .filter((i) => i.batchId === batchId && i.status === "pending")
          .map((i): BatchItem => ({ logId: i.id, lotId: i.lotId, notifiedStatus: i.notified, localDate: i.localDate })),
      ),
    getStore: (id) => Promise.resolve(init.stores.find((s) => s.id === id) ?? null),
    getAttentionLots: (storeId) =>
      Promise.resolve(
        init.lots
          .filter((l) => l.store_id === storeId && attention(l))
          .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date))
          .map(toRow),
      ),
    getLotsByIds: (storeId, ids) =>
      Promise.resolve(init.lots.filter((l) => l.store_id === storeId && ids.includes(l.id)).map(toRow)),
    saveSnapshot(batchId, snapshot) {
      const b = batches.find((x) => x.id === batchId);
      if (!b || b.status !== "pending" || b.snapshot) return Promise.resolve(false);
      b.snapshot = snapshot;
      return Promise.resolve(true);
    },
    skipItems(ids) {
      items.filter((i) => ids.includes(i.id) && i.status === "pending").forEach((i) => (i.status = "skipped"));
      return Promise.resolve();
    },
    skipBatch(batchId, reason) {
      const b = batches.find((x) => x.id === batchId);
      if (!b || b.status !== "pending" || b.snapshot) return Promise.resolve(false);
      b.status = "skipped";
      b.lastError = reason;
      items.filter((i) => i.batchId === b.id && i.status === "pending").forEach((i) => (i.status = "skipped"));
      return Promise.resolve(true);
    },
    finishSent(batchId, messageId) {
      const b = batches.find((x) => x.id === batchId);
      if (!b || b.status !== "pending" || !b.snapshot || !messageId) return Promise.resolve(false);
      b.status = "sent";
      b.messageId = messageId;
      items.filter((i) => i.batchId === b.id && i.status === "pending").forEach((i) => (i.status = "sent"));
      return Promise.resolve(true);
    },
    finishFailed(batchId, error) {
      const b = batches.find((x) => x.id === batchId);
      if (!b || b.status !== "pending") return Promise.resolve(false);
      b.status = "failed";
      b.lastError = error;
      b.history.push(error);
      items.filter((i) => i.batchId === b.id && i.status === "pending").forEach((i) => (i.status = "failed"));
      return Promise.resolve(true);
    },
  };

  const directory: Directory = {
    getEmail: (userId) => Promise.resolve(init.emails[userId] ?? null),
  };

  const mailer: Mailer = {
    send(message) {
      calls.push(message);
      if (init.failWith) return Promise.reject(new Error(init.failWith));
      const behavior = init.behaviors?.[callIndex++] ?? "ok";
      if (behavior === "fail") return Promise.reject(new Error("resend_http_500"));

      // Idempotencia como Resend: misma clave + mismo contenido = respuesta original;
      // misma clave + contenido distinto = 409 invalid_idempotent_request.
      const payloadHash = JSON.stringify([message.to, message.subject, message.html, message.text]);
      const known = deliveries.get(message.idempotencyKey);
      let id: string;
      if (known) {
        if (known.payloadHash !== payloadHash) {
          return Promise.reject(new Error("resend_http_409_invalid_idempotent_request"));
        }
        id = known.id;
      } else {
        id = `msg-${deliveries.size + 1}`;
        deliveries.set(message.idempotencyKey, { id, payloadHash, mail: message });
      }
      if (behavior === "accept_then_error") return Promise.reject(new Error("resend_http_500"));
      if (behavior === "no_id") return Promise.reject(new Error("resend_respuesta_invalida"));
      return Promise.resolve({ id });
    },
  };

  const deps: Deps = {
    db,
    directory,
    mailer,
    logger: { error: (message) => void errors.push(message) },
    appUrl: init.appUrl ?? "https://app.example.test",
  };

  return {
    deps,
    items,
    batches,
    calls,
    errors,
    deliveries: () => [...deliveries.values()].map((d) => d.mail),
  };
}

export const store = (id: string, name: string, createdBy: string): Store => ({
  id,
  name,
  created_by: createdBy,
  expiry_alert_days: 7,
});

export const lot = (
  id: string,
  storeId: string,
  overrides: Partial<FakeLot> = {},
): FakeLot => ({
  id,
  store_id: storeId,
  product_id: `00000000-0000-0000-0000-${id.padStart(12, "0")}`,
  product_name: `Producto ${id}`,
  unit: "pieza",
  supplier_lot_code: null,
  expiration_date: "2026-10-30",
  current_quantity: 5,
  days_to_expiry: 3,
  status: "por_vencer",
  ...overrides,
});
