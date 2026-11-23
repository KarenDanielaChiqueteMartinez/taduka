"use server";

import { revalidatePath } from "next/cache";
import { DomainError, getMovement, registerMovement } from "@/lib/db/lots";
import { isUuid } from "@/lib/db/pool";
import { getCurrentContext } from "@/lib/stores/context";

export type CountFormState = {
  error?: string;
  // Cantidades reales que quedaron guardadas (antes, después y diferencia).
  result?: { before: number; after: number; difference: number };
};

// numeric(12,3): hasta 9 enteros y 3 decimales.
const MAX_QUANTITY = 999_999_999.999;

// Guarda un conteo físico de UN lote de la tienda de la sesión. Un conteo es un ajuste de
// inventario: no es una venta. La existencia solo cambia por este movimiento.
export async function saveCount(
  lotId: string,
  productId: string,
  _prev: CountFormState,
  formData: FormData,
): Promise<CountFormState> {
  const raw = String(formData.get("quantity") ?? "").trim().replace(",", ".");
  const quantity = Number(raw);
  if (!isUuid(lotId) || !isUuid(productId)) return { error: "El lote no es válido." };
  if (raw === "" || !Number.isFinite(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
    return { error: "Escribe una cantidad válida (0 o más)." };
  }

  const { user, membership } = await getCurrentContext();
  if (!membership) return { error: "Primero crea tu tienda desde el inicio." };
  const storeId = membership.store.id;

  try {
    const id = await registerMovement(storeId, user.id, {
      lotId,
      type: "count",
      quantityAfter: quantity,
    });
    const movement = await getMovement(storeId, id);
    if (!movement) return { error: "El conteo se guardó, pero no pudimos leer el resultado." };

    revalidatePath("/dashboard");
    revalidatePath("/products");
    revalidatePath(`/products/${productId}`);
    revalidatePath("/lots");
    revalidatePath("/count");
    revalidatePath("/activity");
    return {
      result: {
        before: Number(movement.quantity_before),
        after: Number(movement.quantity_after),
        difference: Number(movement.difference),
      },
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        error: error.code === "not_found" ? "El lote ya no existe." : "No pudimos guardar el conteo.",
      };
    }
    return { error: "No pudimos guardar el conteo. Inténtalo de nuevo." };
  }
}
