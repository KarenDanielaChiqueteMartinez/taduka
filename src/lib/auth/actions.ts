"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clearFailures, isThrottled, recordFailure } from "@/lib/db/auth-attempts";
import { isDuplicate } from "@/lib/db/pool";
import { createUser, findUserByEmail, markLogin } from "@/lib/db/users";
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  verifyAgainstDummy,
  verifyPassword,
} from "@/lib/auth/password";
import { endSession, startSession } from "@/lib/auth/session";

export type AuthState = {
  email?: string;
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "confirmPassword", string>>;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SERVER_ERROR = "No pudimos conectar con el servidor. Inténtalo de nuevo en un momento.";

function readEmail(formData: FormData) {
  return String(formData.get("email") ?? "").trim().toLowerCase();
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || h.get("x-real-ip") || "").slice(0, 45);
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");

  const fieldErrors: AuthState["fieldErrors"] = {};
  if (!EMAIL_PATTERN.test(email) || email.length > 254) fieldErrors.email = "Escribe un correo válido.";
  if (!password) fieldErrors.password = "Escribe tu contraseña.";
  if (Object.keys(fieldErrors).length > 0) return { email, fieldErrors };

  const ip = await clientIp();
  let userId: string;
  try {
    if (await isThrottled(email, ip)) {
      return { email, error: "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo." };
    }
    const user = await findUserByEmail(email);
    const valid = user
      ? await verifyPassword(password.slice(0, MAX_PASSWORD_LENGTH), user.password_hash)
      : await verifyAgainstDummy(password.slice(0, MAX_PASSWORD_LENGTH));
    if (!user) {
      await recordFailure(email, ip);
      return { email, fieldErrors: { email: "No existe una cuenta asociada a este correo." } };
    }
    if (!valid) {
      await recordFailure(email, ip);
      return { email, fieldErrors: { password: "La contraseña es incorrecta." } };
    }
    await clearFailures(email);
    await markLogin(user.id);
    await startSession(user.id);
    userId = user.id;
  } catch (error) {
    console.error("signIn falló:", error);
    return { email, error: SERVER_ERROR };
  }
  void userId;
  redirect("/dashboard");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: AuthState["fieldErrors"] = {};
  if (!EMAIL_PATTERN.test(email) || email.length > 254) fieldErrors.email = "Escribe un correo válido.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    fieldErrors.password = `Usa máximo ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
  if (confirmPassword !== password) {
    fieldErrors.confirmPassword = "Las contraseñas no coinciden.";
  }
  if (Object.keys(fieldErrors).length > 0) return { email, fieldErrors };

  try {
    const userId = await createUser({ email, passwordHash: await hashPassword(password) });
    await startSession(userId);
  } catch (error) {
    if (isDuplicate(error)) {
      return { email, error: "Ya existe una cuenta con ese correo. Inicia sesión." };
    }
    console.error("signUp falló:", error);
    return { email, error: SERVER_ERROR };
  }
  redirect("/dashboard");
}

export async function signOut() {
  try {
    await endSession();
  } catch {
    // Aunque falle la base, el usuario sale de la sesión en este navegador.
  }
  redirect("/login");
}
