"use server";

import { revalidatePath } from "next/cache";
import { getCurrentContext } from "@/lib/stores/context";

export type LotFormState = {
  values?: {
    productId?: string;
    supplierLotCode?: string;
    entryDate?: string;
    expirationDate?: string;
    quantity?: string;
  };
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    Record<"productId" | "supplierLotCode" | "entryDate" | "expirationDate" | "quantity", string>
  >;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
// numeric(12,3): hasta 9 enteros y 3 decimales.
const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/;
const MAX_SUPPLIER_CODE = 60;

function isRealDate(value: string) {
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
  );
}

export async function createLot(
  _prev: LotFormState,
  formData: FormData,
): Promise<LotFormState> {
  const productId = String(formData.get("productId") ?? "");
  const supplierLotCode = String(formData.get("supplierLotCode") ?? "").trim();
  const entryDate = String(formData.get("entryDate") ?? "");
  const expirationDate = String(formData.get("expirationDate") ?? "");
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const quantity = quantityRaw.replace(",", ".");
  const values = { productId, supplierLotCode, entryDate, expirationDate, quantity: quantityRaw };

  const fieldErrors: LotFormState["fieldErrors"] = {};
  if (!UUID_PATTERN.test(productId)) fieldErrors.productId = "Elige un producto.";
  if (supplierLotCode.length > MAX_SUPPLIER_CODE) {
    fieldErrors.supplierLotCode = `Usa máximo ${MAX_SUPPLIER_CODE} caracteres.`;
  }
  if (!isRealDate(entryDate)) fieldErrors.entryDate = "Escribe una fecha de entrada válida.";
  if (!isRealDate(expirationDate)) {
    fieldErrors.expirationDate = "Escribe la fecha de caducidad del lote.";
  } else if (!fieldErrors.entryDate && expirationDate < entryDate) {
    fieldErrors.expirationDate = "La caducidad no puede ser anterior a la fecha de entrada.";
  }
  if (!QUANTITY_PATTERN.test(quantity) || Number(quantity) <= 0) {
    fieldErrors.quantity = "Escribe una cantidad mayor que 0 (hasta 3 decimales).";
  }
  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };

  const { supabase, membership } = await getCurrentContext();
  if (!membership?.stores) {
    return { values, error: "Primero crea tu tienda desde el inicio." };
  }

  // current_quantity la fija un trigger; la FK compuesta liga el producto a la tienda.
  const { error } = await supabase.from("lots").insert({
    store_id: membership.stores.id,
    product_id: productId,
    supplier_lot_code: supplierLotCode || null,
    entry_date: entryDate,
    expiration_date: expirationDate,
    initial_quantity: quantity,
  });

  if (error) {
    switch (error.code) {
      case "23503":
        return { values, fieldErrors: { productId: "El producto seleccionado no es válido." } };
      case "23514":
        return { values, error: "Revisa las fechas y la cantidad del lote." };
      case "22007":
      case "22008":
        return { values, error: "Alguna de las fechas no es válida." };
      case "42501":
        return { values, error: "No tienes permiso para registrar lotes." };
      default:
        return { values, error: "No pudimos guardar el lote. Inténtalo de nuevo." };
    }
  }

  revalidatePath("/lots");
  revalidatePath("/products");
  return {
    values: { productId, entryDate, supplierLotCode: "", expirationDate: "", quantity: "" },
    success: "Lote registrado.",
  };
}
