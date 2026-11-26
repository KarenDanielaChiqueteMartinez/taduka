import { db, newId, transaction } from "./pool.ts";

export type LotStatus = "vencido" | "por_vencer" | "vigente";

// Fila de la vista lots_with_status (estado y días calculados por la base de datos).
export type LotView = {
  id: string;
  product_id: string;
  product_name: string;
  unit: string;
  supplier_lot_code: string | null;
  entry_date: string;
  expiration_date: string;
  initial_quantity: number;
  current_quantity: number;
  days_to_expiry: number;
  status: LotStatus;
};

const LOT_COLUMNS = `id, product_id, product_name, unit, supplier_lot_code, entry_date,
  expiration_date, initial_quantity, current_quantity, days_to_expiry, status`;

// Primero los lotes que vencen antes (FEFO).
export function listLots(storeId: string, options: { productId?: string; limit?: number } = {}) {
  const params: unknown[] = [storeId];
  let where = "store_id = ?";
  if (options.productId) {
    where += " AND product_id = ?";
    params.push(options.productId);
  }
  params.push(Math.max(1, Math.min(options.limit ?? 500, 1000)));
  return db.query<LotView>(
    `SELECT ${LOT_COLUMNS} FROM lots_with_status WHERE ${where}
      ORDER BY expiration_date ASC, created_at ASC LIMIT ?`,
    params,
  );
}

export type LotInput = {
  productId: string;
  // Si no se indica, el disparador lots_bi genera el código del lote.
  supplierLotCode?: string | null;
  entryDate: string; // YYYY-MM-DD
  expirationDate: string; // YYYY-MM-DD
  quantity: string; // decimal con hasta 3 decimales
};

// La existencia actual la fija el trigger lots_bi (= cantidad inicial). La FK compuesta
// (product_id, store_id) impide ligar un lote a un producto de otra tienda.
export async function createLot(storeId: string, input: LotInput): Promise<string> {
  const id = newId();
  await db.exec(
    `INSERT INTO lots (id, store_id, product_id, supplier_lot_code, entry_date, expiration_date, initial_quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, input.productId, input.supplierLotCode ?? null, input.entryDate, input.expirationDate, input.quantity],
  );
  return id;
}

// Crea varios lotes a la vez (nota de remisión): todos o ninguno. Cada lote recibe su código
// del disparador lots_bi; la FK compuesta impide ligarlos a productos de otra tienda.
export async function createLots(storeId: string, inputs: LotInput[]): Promise<number> {
  return transaction(async (tx) => {
    for (const input of inputs) {
      await tx.exec(
        `INSERT INTO lots (id, store_id, product_id, supplier_lot_code, entry_date, expiration_date, initial_quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId(), storeId, input.productId, input.supplierLotCode ?? null, input.entryDate, input.expirationDate, input.quantity],
      );
    }
    return inputs.length;
  });
}

// --- Movimientos de existencias (conteo, ajuste, baja): único camino para cambiar la existencia ---

export class DomainError extends Error {
  readonly code: "invalid" | "not_found";
  constructor(code: "invalid" | "not_found", message: string) {
    super(message);
    this.code = code;
  }
}

export type MovementType = "count" | "adjustment" | "write_off";

export async function registerMovement(
  storeId: string,
  userId: string,
  input: { lotId: string; type: MovementType; quantityAfter: number; reason?: string | null },
): Promise<string> {
  const { lotId, type } = input;
  if (!["count", "adjustment", "write_off"].includes(type)) {
    throw new DomainError("invalid", "Tipo de movimiento inválido");
  }
  if (!Number.isFinite(input.quantityAfter) || input.quantityAfter < 0) {
    throw new DomainError("invalid", "Cantidad inválida");
  }
  const after = Math.round(input.quantityAfter * 1000) / 1000;
  const reason = (input.reason ?? "").trim() || null;

  return transaction(async (tx) => {
    // Se bloquea el lote (de ESTA tienda) para que dos conteos simultáneos no se pisen.
    const lot = await tx.queryOne<{ current_quantity: number }>(
      "SELECT current_quantity FROM lots WHERE id = ? AND store_id = ? FOR UPDATE",
      [lotId, storeId],
    );
    if (!lot) throw new DomainError("not_found", "Lote no encontrado");
    const before = Number(lot.current_quantity);

    if (type !== "count" && !reason) throw new DomainError("invalid", "El motivo es obligatorio");
    if (type === "write_off" && after >= before) {
      throw new DomainError("invalid", "La baja debe reducir la existencia");
    }
    if (type === "adjustment" && after === before) {
      throw new DomainError("invalid", "El ajuste debe cambiar la existencia");
    }

    const id = newId();
    await tx.exec(
      `INSERT INTO inventory_movements (id, store_id, lot_id, type, quantity_before, quantity_after, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, lotId, type, before, after, reason, userId],
    );
    await tx.exec("UPDATE lots SET current_quantity = ? WHERE id = ? AND store_id = ?", [after, lotId, storeId]);
    return id;
  });
}

// --- Actividad ---------------------------------------------------------------------------------

export type MovementRow = {
  id: string;
  type: MovementType;
  difference: number;
  reason: string | null;
  created_at: string; // UTC
  supplier_lot_code: string | null;
  product_name: string;
  unit: string;
};

export function listMovements(storeId: string, limit = 60) {
  return db.query<MovementRow>(
    `SELECT m.id, m.type, m.difference, m.reason, m.created_at,
            l.supplier_lot_code, p.name AS product_name, p.unit
       FROM inventory_movements m
       JOIN lots l ON l.id = m.lot_id AND l.store_id = m.store_id
       JOIN products p ON p.id = l.product_id AND p.store_id = l.store_id
      WHERE m.store_id = ?
      ORDER BY m.created_at DESC LIMIT ?`,
    [storeId, Math.max(1, Math.min(limit, 200))],
  );
}

export type EntryRow = {
  id: string;
  product_name: string;
  unit: string;
  supplier_lot_code: string | null;
  initial_quantity: number;
  created_at: string; // UTC
};

export function listEntries(storeId: string, limit = 60) {
  return db.query<EntryRow>(
    `SELECT id, product_name, unit, supplier_lot_code, initial_quantity, created_at
       FROM lots_with_status WHERE store_id = ?
      ORDER BY created_at DESC LIMIT ?`,
    [storeId, Math.max(1, Math.min(limit, 200))],
  );
}

// Movimiento recién registrado (cantidades reales antes y después, calculadas en la base).
export function getMovement(storeId: string, id: string) {
  return db.queryOne<{ quantity_before: number; quantity_after: number; difference: number }>(
    "SELECT quantity_before, quantity_after, difference FROM inventory_movements WHERE id = ? AND store_id = ?",
    [id, storeId],
  );
}
