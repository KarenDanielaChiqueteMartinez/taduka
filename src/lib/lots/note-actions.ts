"use server";

import { revalidatePath } from "next/cache";
import { createLots } from "@/lib/db/lots";
import { isForeignKey } from "@/lib/db/pool";
import { getCurrentContext } from "@/lib/stores/context";

export type NoteFormState = {
  error?: string;
  // Errores por línea, con la clave de la línea (lineId) para pintarlos donde corresponde.
  lineErrors?: Record<string, string>;
  created?: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
// numeric(12,3): hasta 9 enteros y 3 decimales.
const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/;
const MAX_LINES = 60;

function isRealDate(value: string) {
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

// Guarda los lotes de una nota de remisión YA REVISADA por la persona: producto, cantidad y
// caducidad de cada línea. Las fechas las confirma la persona; aquí nunca se calculan.
export async function saveNoteLots(
  _prev: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const entryDate = String(formData.get("entryDate") ?? "");
  const lineIds = formData.getAll("lineId").map(String);
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map((v) => String(v).trim().replace(",", "."));
  const expirations = formData.getAll("expirationDate").map(String);

  if (lineIds.length === 0) return { error: "Selecciona al menos una línea para guardar." };
  if (lineIds.length > MAX_LINES) return { error: `Guarda máximo ${MAX_LINES} líneas a la vez.` };
  if (
    productIds.length !== lineIds.length ||
    quantities.length !== lineIds.length ||
    expirations.length !== lineIds.length
  ) {
    return { error: "Los datos de la nota están incompletos. Revísalos e inténtalo de nuevo." };
  }
  if (!isRealDate(entryDate)) return { error: "Escribe una fecha de entrada válida." };

  const lineErrors: Record<string, string> = {};
  lineIds.forEach((id, i) => {
    if (!UUID_PATTERN.test(productIds[i])) lineErrors[id] = "Elige el producto.";
    else if (!QUANTITY_PATTERN.test(quantities[i]) || Number(quantities[i]) <= 0) {
      lineErrors[id] = "Escribe una cantidad mayor que 0 (hasta 3 decimales).";
    } else if (!isRealDate(expirations[i])) lineErrors[id] = "Escribe la fecha de caducidad.";
    else if (expirations[i] < entryDate) {
      lineErrors[id] = "La caducidad no puede ser anterior a la fecha de entrada.";
    }
  });
  if (Object.keys(lineErrors).length > 0) {
    return { error: "Revisa las líneas marcadas.", lineErrors };
  }

  const { membership } = await getCurrentContext();
  if (!membership) return { error: "Primero crea tu tienda desde el inicio." };

  try {
    const created = await createLots(
      membership.store.id,
      lineIds.map((_, i) => ({
        productId: productIds[i],
        entryDate,
        expirationDate: expirations[i],
        quantity: quantities[i],
      })),
    );
    revalidatePath("/lots");
    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath("/count");
    for (const id of new Set(productIds)) revalidatePath(`/products/${id}`);
    return { created };
  } catch (error) {
    if (isForeignKey(error)) return { error: "Alguno de los productos ya no es válido." };
    return { error: "No pudimos guardar los lotes. Inténtalo de nuevo." };
  }
}
