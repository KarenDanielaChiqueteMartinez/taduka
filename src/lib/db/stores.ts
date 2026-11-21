import { db, newId, transaction } from "./pool.ts";

export type Role = "owner" | "staff";

export type Membership = {
  role: Role;
  store: { id: string; name: string; expiry_alert_days: number };
};

// Tienda activa del usuario: la primera a la que pertenece. Es la ÚNICA fuente del store_id
// que usa el resto de la aplicación (nunca viene del navegador).
export async function getMembership(userId: string): Promise<Membership | null> {
  const row = await db.queryOne<{
    role: Role;
    id: string;
    name: string;
    expiry_alert_days: number;
  }>(
    `SELECT m.role, s.id, s.name, s.expiry_alert_days
       FROM store_members m JOIN stores s ON s.id = m.store_id
      WHERE m.user_id = ?
      ORDER BY m.created_at ASC, s.created_at ASC
      LIMIT 1`,
    [userId],
  );
  if (!row) return null;
  return { role: row.role, store: { id: row.id, name: row.name, expiry_alert_days: row.expiry_alert_days } };
}

// Crea la tienda y la membresía de propietario en una sola transacción.
export async function createStore(userId: string, name: string): Promise<string> {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 80) throw new RangeError("Nombre de tienda inválido");
  return transaction(async (tx) => {
    const id = newId();
    await tx.exec("INSERT INTO stores (id, name, created_by) VALUES (?, ?, ?)", [id, clean, userId]);
    await tx.exec("INSERT INTO store_members (store_id, user_id, role) VALUES (?, ?, 'owner')", [id, userId]);
    return id;
  });
}

export async function countMemberships(userId: string): Promise<number> {
  const row = await db.queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM store_members WHERE user_id = ?",
    [userId],
  );
  return Number(row?.n ?? 0);
}
