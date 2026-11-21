import { db } from "./pool.ts";

export const WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_EMAIL = 8;
export const MAX_FAILURES_PER_IP = 30;

// ¿Se superó el límite de intentos fallidos recientes para este correo o esta IP?
export async function isThrottled(email: string, ip: string): Promise<boolean> {
  const row = await db.queryOne<{ by_email: number; by_ip: number }>(
    `SELECT SUM(email = ?) AS by_email, SUM(? <> '' AND ip = ?) AS by_ip
       FROM auth_attempts
      WHERE created_at > UTC_TIMESTAMP(3) - INTERVAL ? MINUTE AND (email = ? OR (? <> '' AND ip = ?))`,
    [email, ip, ip, WINDOW_MINUTES, email, ip, ip],
  );
  return Number(row?.by_email ?? 0) >= MAX_FAILURES_PER_EMAIL || Number(row?.by_ip ?? 0) >= MAX_FAILURES_PER_IP;
}

export async function recordFailure(email: string, ip: string) {
  await db.exec("INSERT INTO auth_attempts (email, ip) VALUES (?, ?)", [email, ip.slice(0, 45)]);
  // Limpieza oportunista de registros viejos.
  await db.exec("DELETE FROM auth_attempts WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL 1 DAY LIMIT 200");
}

export async function clearFailures(email: string) {
  await db.exec("DELETE FROM auth_attempts WHERE email = ?", [email]);
}
