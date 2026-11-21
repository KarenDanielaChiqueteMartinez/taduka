import { db, isDuplicate, transaction } from "./pool.ts";

// Productos con foto y su versión (para la URL), sin descargar los bytes.
export async function getPhotoVersions(storeId: string): Promise<Map<string, number>> {
  const rows = await db.query<{ product_id: string; updated_at: string }>(
    "SELECT product_id, updated_at FROM product_photos WHERE store_id = ?",
    [storeId],
  );
  return new Map(rows.map((r) => [r.product_id, Date.parse(`${r.updated_at.replace(" ", "T")}Z`)]));
}

export function getPhoto(storeId: string, productId: string) {
  return db.queryOne<{ content_type: string; data: Buffer }>(
    "SELECT content_type, data FROM product_photos WHERE store_id = ? AND product_id = ?",
    [storeId, productId],
  );
}

// Crea o reemplaza la foto de un producto DE ESTA TIENDA. Se evita ON DUPLICATE KEY UPDATE a
// propósito: con él, el id de un producto ajeno que ya tuviera foto la sobrescribiría.
// Devuelve false si el producto no existe en la tienda.
export async function savePhoto(
  storeId: string,
  productId: string,
  contentType: string,
  data: Uint8Array,
): Promise<boolean> {
  const bytes = Buffer.from(data);
  return transaction(async (tx) => {
    const owned = await tx.queryOne(
      "SELECT 1 AS ok FROM products WHERE id = ? AND store_id = ?",
      [productId, storeId],
    );
    if (!owned) return false;
    const existing = await tx.queryOne(
      "SELECT 1 AS ok FROM product_photos WHERE product_id = ? AND store_id = ?",
      [productId, storeId],
    );
    if (existing) {
      await tx.exec(
        "UPDATE product_photos SET content_type = ?, data = ? WHERE product_id = ? AND store_id = ?",
        [contentType, bytes, productId, storeId],
      );
      return true;
    }
    try {
      await tx.exec(
        "INSERT INTO product_photos (product_id, store_id, content_type, data) VALUES (?, ?, ?, ?)",
        [productId, storeId, contentType, bytes],
      );
    } catch (error) {
      if (isDuplicate(error)) return false;
      throw error;
    }
    return true;
  });
}

export async function deletePhoto(storeId: string, productId: string): Promise<void> {
  await db.exec("DELETE FROM product_photos WHERE product_id = ? AND store_id = ?", [productId, storeId]);
}
