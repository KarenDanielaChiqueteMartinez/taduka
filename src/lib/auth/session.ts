import { cookies } from "next/headers";
import { createSession, deleteSession, findSessionUser, type SessionUser } from "@/lib/db/users";
import { hashToken, newSessionToken, SESSION_COOKIE, sessionExpiry } from "@/lib/auth/tokens";

const cookieOptions = (expires: Date) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  expires,
});

// Inicia sesión: guarda el hash del token en la base y el token en una cookie httpOnly.
export async function startSession(userId: string) {
  const { token, hash } = newSessionToken();
  const expires = sessionExpiry();
  await createSession(hash, userId, expires);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expires));
}

// Usuario de la sesión actual (o null). Valida contra la base: una cookie falsa o vencida no sirve.
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;
  return findSessionUser(hashToken(token));
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && token.length <= 128) await deleteSession(hashToken(token));
  store.delete(SESSION_COOKIE);
}
