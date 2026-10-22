// Fila de la vista lots_with_status. El estado lo calcula la base de datos; aquí no se recalcula.
export type LotRow = {
  id: string;
  product_id: string;
  product_name: string;
  unit: string;
  supplier_lot_code: string | null;
  expiration_date: string;
  current_quantity: number;
  days_to_expiry: number;
  status: "vencido" | "por_vencer" | "vigente";
};

export type Store = {
  id: string;
  name: string;
  created_by: string;
  expiry_alert_days: number;
};

export type Job = "daily_summary" | "urgent_alerts";
export type BatchKind = "daily_summary" | "urgent_alert";

export type EmailMessage = { subject: string; html: string; text: string };

// Instantánea inmutable del correo: se fija una vez y todos los reintentos la envían tal cual.
export type Snapshot = EmailMessage & { recipient: string };

// Un envío = un correo. Su id es estable y da la clave de idempotencia (`batch:<id>`).
export type Batch = {
  id: string;
  storeId: string;
  kind: BatchKind;
  attempts: number;
  snapshot: Snapshot | null;
};

// Fila pendiente del registro que el envío cubre (resumen de tienda/fecha, o lote/estado).
export type BatchItem = {
  logId: string;
  lotId: string | null;
  notifiedStatus: "por_vencer" | "vencido" | null;
  localDate: string | null;
};

export interface Db {
  detectDailyItems(localDate: string): Promise<void>;
  detectUrgentItems(): Promise<void>;
  assembleBatches(): Promise<void>;
  claimBatches(kind: BatchKind): Promise<Batch[]>;
  getBatchItems(batchId: string): Promise<BatchItem[]>;
  getStore(storeId: string): Promise<Store | null>;
  // Lotes con existencia vencidos o por vencer, ordenados por caducidad ascendente.
  getAttentionLots(storeId: string): Promise<LotRow[]>;
  getLotsByIds(storeId: string, lotIds: string[]): Promise<LotRow[]>;
  saveSnapshot(batchId: string, snapshot: Snapshot): Promise<boolean>;
  skipItems(logIds: string[], reason: string): Promise<void>;
  skipBatch(batchId: string, reason: string): Promise<boolean>;
  finishSent(batchId: string, providerMessageId: string): Promise<boolean>;
  finishFailed(batchId: string, error: string): Promise<boolean>;
}

export interface Directory {
  // Correo de la cuenta en Supabase Auth, o null si no tiene.
  getEmail(userId: string): Promise<string | null>;
}

export interface Mailer {
  // Lanza un error si el proveedor no confirma el envío con un id.
  send(message: EmailMessage & { to: string; idempotencyKey: string }): Promise<{ id: string }>;
}

export interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
}

export type Deps = { db: Db; directory: Directory; mailer: Mailer; logger: Logger; appUrl: string };
