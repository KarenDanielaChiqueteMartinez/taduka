import { db, newId } from "./pool.ts";

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
};

export async function createUser(input: {
  email: string;
  passwordHash: string;
  displayName?: string | null;
}): Promise<string> {
  const id = newId();
  await db.exec(
    "INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)",
    [id, input.email, input.passwordHash, input.displayName ?? null],
  );
  return id;
}

export function findUserByEmail(email: string) {
  return db.queryOne<UserRow>(
    "SELECT id, email, password_hash, display_name FROM users WHERE email = ?",
    [email],
  );
}

export async function markLogin(userId: string) {
  await db.exec("UPDATE users SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?", [userId]);
}

// --- Sesiones: en la base solo se guarda el hash SHA-256 del token de la cookie. ---------------

export async function createSession(tokenHash: string, userId: string, expiresAt: Date) {
  await db.exec(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    [tokenHash, userId, expiresAt.toISOString().slice(0, 23).replace("T", " ")],
  );
}

export type SessionUser = { id: string; email: string; display_name: string | null };

export function findSessionUser(tokenHash: string) {
  return db.queryOne<SessionUser>(
    `SELECT u.id, u.email, u.display_name
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)`,
    [tokenHash],
  );
}

export async function deleteSession(tokenHash: string) {
  await db.exec("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
}

export async function deleteExpiredSessions() {
  await db.exec("DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP(3)");
}
