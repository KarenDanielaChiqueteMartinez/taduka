import { db, newId } from "./pool.ts";

// Todas las funciones reciben el storeId de la membresía del usuario y lo incluyen en cada
// consulta: ninguna fila de otra tienda se lee ni se modifica.

export type CategoryRow = { id: string; name: string };

export function listCategories(storeId: string) {
  return db.query<CategoryRow>(
    "SELECT id, name FROM categories WHERE store_id = ? ORDER BY name",
    [storeId],
  );
}

export async function createCategory(storeId: string, name: string): Promise<string> {
  const id = newId();
  await db.exec("INSERT INTO categories (id, store_id, name) VALUES (?, ?, ?)", [id, storeId, name]);
  return id;
}

export type ProductRow = {
  id: string;
  name: string;
  unit: string;
  is_active: boolean;
  category_name: string | null;
  lot_count: number;
};

type RawProduct = Omit<ProductRow, "is_active"> & { is_active: number };

const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.unit, p.is_active, c.name AS category_name,
         (SELECT COUNT(*) FROM lots l WHERE l.product_id = p.id AND l.store_id = p.store_id) AS lot_count
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id AND c.store_id = p.store_id`;

const toProduct = (r: RawProduct): ProductRow => ({
  ...r,
  is_active: r.is_active === 1,
  lot_count: Number(r.lot_count),
});

export async function listProducts(storeId: string): Promise<ProductRow[]> {
  const rows = await db.query<RawProduct>(`${PRODUCT_SELECT} WHERE p.store_id = ? ORDER BY p.name`, [storeId]);
  return rows.map(toProduct);
}

export async function getProduct(storeId: string, productId: string): Promise<ProductRow | null> {
  const row = await db.queryOne<RawProduct>(`${PRODUCT_SELECT} WHERE p.store_id = ? AND p.id = ?`, [
    storeId,
    productId,
  ]);
  return row ? toProduct(row) : null;
}

// La FK compuesta (category_id, store_id) impide usar una categoría de otra tienda.
export async function createProduct(
  storeId: string,
  input: { categoryId: string | null; name: string; unit: string },
): Promise<string> {
  const id = newId();
  await db.exec(
    "INSERT INTO products (id, store_id, category_id, name, unit) VALUES (?, ?, ?, ?, ?)",
    [id, storeId, input.categoryId, input.name, input.unit],
  );
  return id;
}
