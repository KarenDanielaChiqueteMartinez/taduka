"use server";

import { revalidatePath } from "next/cache";
import { savePhoto, type PhotoResult } from "@/lib/catalog/photos-server";
import { deletePhoto } from "@/lib/db/photos";
import { isUuid } from "@/lib/db/pool";
import { getCurrentContext } from "@/lib/stores/context";

function refresh(productId: string) {
  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath("/dashboard");
}

export async function uploadProductPhoto(formData: FormData): Promise<PhotoResult> {
  const productId = String(formData.get("productId") ?? "");
  const file = formData.get("photo");
  if (!isUuid(productId)) return { ok: false, error: "Producto no válido." };
  if (!(file instanceof File)) return { ok: false, error: "Elige una imagen." };

  const { membership } = await getCurrentContext();
  if (!membership) return { ok: false, error: "Primero crea tu tienda desde el inicio." };

  const result = await savePhoto(membership.store.id, productId, file);
  if (result.ok) refresh(productId);
  return result;
}

export async function removeProductPhoto(productId: string): Promise<PhotoResult> {
  if (!isUuid(productId)) return { ok: false, error: "Producto no válido." };
  const { membership } = await getCurrentContext();
  if (!membership) return { ok: false, error: "Primero crea tu tienda desde el inicio." };

  try {
    // Solo borra la foto si el producto pertenece a la tienda del usuario.
    await deletePhoto(membership.store.id, productId);
  } catch {
    return { ok: false, error: "No pudimos quitar la foto. Inténtalo de nuevo." };
  }
  refresh(productId);
  return { ok: true };
}
