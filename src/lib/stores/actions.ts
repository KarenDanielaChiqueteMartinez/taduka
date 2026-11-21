"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { countMemberships, createStore } from "@/lib/db/stores";

export type StoreFormState = {
  name?: string;
  error?: string;
  fieldErrors?: { name?: string };
};

const MAX_NAME_LENGTH = 80;

export async function createFirstStore(
  _prev: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { name, fieldErrors: { name: "Escribe el nombre de tu tienda." } };
  if (name.length > MAX_NAME_LENGTH) {
    return {
      name,
      fieldErrors: { name: `Usa máximo ${MAX_NAME_LENGTH} caracteres.` },
    };
  }

  const user = await getSessionUser().catch(() => null);
  if (!user) redirect("/login");

  try {
    // Regla de producto: una tienda activa por ahora; no crear otra si ya pertenece a una.
    if ((await countMemberships(user.id)) > 0) redirect("/dashboard");
    // La tienda y la membresía de propietario se crean en una sola transacción.
    await createStore(user.id, name);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { name, error: "No pudimos crear tu tienda. Inténtalo de nuevo." };
  }

  redirect("/dashboard");
}

// redirect() lanza una excepción especial que no debe tratarse como un error.
function isRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}
