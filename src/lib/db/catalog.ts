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
  category_id: string | null;
  category_name: string | null;
  description: string | null;
  barcode: string | null;
  brand: string | null;
  supplier: string | null;
  location: string | null;
  lot_count: number;
};

type RawProduct = Omit<ProductRow, "is_active"> & { is_active: number };

const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.unit, p.is_active, p.category_id, c.name AS category_name,
         p.description, p.barcode, p.brand, p.supplier, p.location,
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

export type ProductInput = {
  categoryId: string | null;
  name: string;
  unit: string;
  description?: string | null;
  barcode?: string | null;
  brand?: string | null;
  supplier?: string | null;
  location?: string | null;
};

// La FK compuesta (category_id, store_id) impide usar una categoría de otra tienda.
export async function createProduct(storeId: string, input: ProductInput): Promise<string> {
  const id = newId();
  await db.exec(
    `INSERT INTO products (id, store_id, category_id, name, unit, description, barcode, brand, supplier, location)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      input.categoryId,
      input.name,
      input.unit,
      input.description ?? null,
      input.barcode ?? null,
      input.brand ?? null,
      input.supplier ?? null,
      input.location ?? null,
    ],
  );
  return id;
}

// Devuelve false si el producto no existe en esa tienda.
export async function updateProduct(
  storeId: string,
  productId: string,
  input: ProductInput,
): Promise<boolean> {
  const result = await db.exec(
    `UPDATE products
        SET category_id = ?, name = ?, unit = ?, description = ?, barcode = ?, brand = ?, supplier = ?, location = ?
      WHERE id = ? AND store_id = ?`,
    [
      input.categoryId,
      input.name,
      input.unit,
      input.description ?? null,
      input.barcode ?? null,
      input.brand ?? null,
      input.supplier ?? null,
      input.location ?? null,
      productId,
      storeId,
    ],
  );
  return result.affectedRows > 0;
}

// Busca un producto de la tienda por su código de barras. Un UPC-A (12 dígitos) es un EAN-13 con
// un 0 al inicio: se prueban ambas formas para no fallar según cómo se haya guardado o leído.
export async function findProductIdByBarcode(storeId: string, code: string): Promise<string | null> {
  const variants = new Set([code]);
  if (/^\d{12}$/.test(code)) variants.add(`0${code}`);
  if (/^0\d{12}$/.test(code)) variants.add(code.slice(1));
  const list = [...variants];
  const row = await db.queryOne<{ id: string }>(
    `SELECT id FROM products WHERE store_id = ? AND barcode IN (${list.map(() => "?").join(", ")}) LIMIT 1`,
    [storeId, ...list],
  );
  return row?.id ?? null;
}
