"use server";

import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  email?: string;
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "confirmPassword", string>>;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function readEmail(formData: FormData) {
  return String(formData.get("email") ?? "").trim().toLowerCase();
}

function authErrorMessage(error: AuthError) {
  if (error.status === 0 || error.name === "AuthRetryableFetchError") {
    return "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
  }
  switch (error.code) {
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Confirma tu correo antes de iniciar sesión.";
    case "user_already_exists":
    case "email_exists":
      return "Ya existe una cuenta con ese correo. Inicia sesión.";
    case "weak_password":
      return "La contraseña es demasiado débil. Usa al menos 8 caracteres.";
    case "email_address_invalid":
    case "validation_failed":
      return "Revisa que el correo sea válido.";
    case "signup_disabled":
      return "El registro no está disponible por ahora.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
    default:
      return "Ocurrió un error inesperado. Inténtalo de nuevo.";
  }
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");

  const fieldErrors: AuthState["fieldErrors"] = {};
  if (!EMAIL_PATTERN.test(email)) fieldErrors.email = "Escribe un correo válido.";
  if (!password) fieldErrors.password = "Escribe tu contraseña.";
  if (Object.keys(fieldErrors).length > 0) return { email, fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { email, error: authErrorMessage(error) };

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
  if (!EMAIL_PATTERN.test(email)) fieldErrors.email = "Escribe un correo válido.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (confirmPassword !== password) {
    fieldErrors.confirmPassword = "Las contraseñas no coinciden.";
  }
  if (Object.keys(fieldErrors).length > 0) return { email, fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { email, error: authErrorMessage(error) };

  // Sin confirmación de correo (configuración local), signUp devuelve sesión.
  if (data.session) redirect("/dashboard");

  return {
    email,
    message:
      "Revisa tu correo para confirmar tu cuenta. Después podrás iniciar sesión.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
