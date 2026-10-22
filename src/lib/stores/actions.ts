"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();

  // Regla de producto: una tienda activa por ahora; no crear otra si ya pertenece a una.
  const { data: existing, error: lookupError } = await supabase
    .from("store_members")
    .select("store_id")
    .limit(1);
  if (lookupError) {
    return { name, error: "No pudimos verificar tu cuenta. Inténtalo de nuevo." };
  }
  if (existing && existing.length > 0) redirect("/dashboard");

  // La función crea la tienda y la membresía de propietario en una transacción.
  const { error } = await supabase.rpc("create_store", { p_name: name });
  if (error) {
    switch (error.code) {
      case "28000":
        return { name, error: "Tu sesión expiró. Inicia sesión de nuevo." };
      case "22023":
        return {
          name,
          fieldErrors: { name: "Escribe un nombre válido de hasta 80 caracteres." },
        };
      default:
        return { name, error: "No pudimos crear tu tienda. Inténtalo de nuevo." };
    }
  }

  redirect("/dashboard");
}
