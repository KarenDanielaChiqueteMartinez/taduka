import { MAX_PHOTO_BYTES, sniffImageType } from "@/lib/catalog/photos";
import { isCheckViolation } from "@/lib/db/pool";
import { savePhoto as savePhotoRow } from "@/lib/db/photos";

export type PhotoResult = { ok: true } | { ok: false; error: string };

// Valida (tamaño y formato real por su firma) y guarda la foto de un producto DE LA TIENDA
// indicada. La capa de datos impide tocar productos o fotos de otra tienda.
export async function savePhoto(
  storeId: string,
  productId: string,
  file: File,
): Promise<PhotoResult> {
  if (file.size === 0) return { ok: false, error: "Elige una imagen." };
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: "La imagen es demasiado grande. Prueba con otra foto." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) {
    return { ok: false, error: "El archivo no es una imagen válida (JPG, PNG o WebP)." };
  }

  try {
    const saved = await savePhotoRow(storeId, productId, type, bytes);
    if (!saved) return { ok: false, error: "El producto no existe en tu tienda." };
    return { ok: true };
  } catch (error) {
    if (isCheckViolation(error)) return { ok: false, error: "La imagen no cumple los límites permitidos." };
    return { ok: false, error: "No pudimos guardar la foto. Inténtalo de nuevo." };
  }
}
