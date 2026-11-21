import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "taduka_session";
export const SESSION_DAYS = 30;

// El token (256 bits aleatorios) solo vive en la cookie; la base guarda su SHA-256, así que
// un volcado de la tabla sessions no permite iniciar sesión.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function sessionExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_DAYS * 86_400_000);
}
