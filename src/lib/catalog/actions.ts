"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { savePhoto } from "@/lib/catalog/photos-server";
import { isUnit } from "@/lib/catalog/units";
import {
  createCategory as createCategory_,
  createProduct as createProduct_,
  getProduct,
  updateProduct as updateProduct_,
  type ProductInput,
} from "@/lib/db/catalog";
import { isCheckViolation, isDuplicate, isForeignKey, isUuid } from "@/lib/db/pool";
import { getCurrentContext } from "@/lib/stores/context";

export type CatalogFormState = {
  values?: {
    name?: string;
    categoryId?: string;
    unit?: string;
    description?: string;
    barcode?: string;
    brand?: string;
    supplier?: string;
    location?: string;
  };
  error?: string;
  success?: string;
  // Categoría recién creada, para que el formulario de producto la seleccione.
  category?: { id: string; name: string };
  // Producto recién creado, para ofrecer registrar su primer lote.
  createdId?: string;
  // Aviso no bloqueante (p. ej. el producto se creó pero la foto no se pudo guardar).
  warning?: string;
  fieldErrors?: Partial<
    Record<"name" | "categoryId" | "unit" | "description" | "barcode" | "brand" | "supplier" | "location", string>
  >;
};

const MAX_CATEGORY_NAME = 60;
const MAX_PRODUCT_NAME = 120;
const MAX_DESCRIPTION = 500;
const MAX_BARCODE = 64;
const MAX_BRAND = 80;
const MAX_SUPPLIER = 80;
const MAX_LOCATION = 80;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = "Primero crea tu tienda desde el inicio.";
const GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";

export async function createCategory(
  _prev: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const values = { name };

  if (!name) return { values, fieldErrors: { name: "Escribe el nombre de la categoría." } };
  if (name.length > MAX_CATEGORY_NAME) {
    return {
      values,
      fieldErrors: { name: `Usa máximo ${MAX_CATEGORY_NAME} caracteres.` },
    };
  }

  const { membership } = await getCurrentContext();
  if (!membership) return { values, error: NO_STORE };

  let id: string;
  try {
    id = await createCategory_(membership.store.id, name);
  } catch (error) {
    if (isDuplicate(error)) {
      return { values, fieldErrors: { name: "Ya tienes una categoría con ese nombre." } };
    }
    if (isCheckViolation(error)) {
      return { values, fieldErrors: { name: "Escribe un nombre válido." } };
    }
    return { values, error: GENERIC };
  }

  revalidatePath("/categories");
  revalidatePath("/products");
  return { values: { name: "" }, success: `Categoría «${name}» creada.`, category: { id, name } };
}


type ParsedProduct = {
  values: NonNullable<CatalogFormState["values"]>;
  fieldErrors: NonNullable<CatalogFormState["fieldErrors"]>;
  input: ProductInput;
};

function parseProductForm(formData: FormData): ParsedProduct {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const name = text("name");
  const categoryId = text("categoryId");
  const unit = String(formData.get("unit") ?? "");
  const description = text("description");
  const barcode = text("barcode");
  const brand = text("brand");
  const supplier = text("supplier");
  const location = text("location");
  const values = { name, categoryId, unit, description, barcode, brand, supplier, location };

  const fieldErrors: ParsedProduct["fieldErrors"] = {};
  if (!name) fieldErrors.name = "Escribe el nombre del producto.";
  else if (name.length > MAX_PRODUCT_NAME) {
    fieldErrors.name = `Usa máximo ${MAX_PRODUCT_NAME} caracteres.`;
  }
  if (description.length > MAX_DESCRIPTION) {
    fieldErrors.description = `Usa máximo ${MAX_DESCRIPTION} caracteres.`;
  }
  if (barcode.length > MAX_BARCODE) fieldErrors.barcode = `Usa máximo ${MAX_BARCODE} caracteres.`;
  if (brand.length > MAX_BRAND) fieldErrors.brand = `Usa máximo ${MAX_BRAND} caracteres.`;
  if (supplier.length > MAX_SUPPLIER) fieldErrors.supplier = `Usa máximo ${MAX_SUPPLIER} caracteres.`;
  if (location.length > MAX_LOCATION) fieldErrors.location = `Usa máximo ${MAX_LOCATION} caracteres.`;
  if (!isUnit(unit)) fieldErrors.unit = "Elige una unidad de medida.";
  if (!categoryId) fieldErrors.categoryId = "Elige una categoría.";
  else if (!UUID_PATTERN.test(categoryId)) {
    fieldErrors.categoryId = "La categoría seleccionada no es válida.";
  }

  return {
    values,
    fieldErrors,
    input: {
      categoryId: categoryId || null,
      name,
      unit,
      description: description || null,
      barcode: barcode || null,
      brand: brand || null,
      supplier: supplier || null,
      location: location || null,
    },
  };
}

// Traduce un error de MariaDB al campo correspondiente del formulario de producto.
function productError(error: unknown, values: ParsedProduct["values"]): CatalogFormState {
  if (isDuplicate(error)) {
    // El mensaje de MariaDB nombra el índice que chocó.
    if (error instanceof Error && error.message.includes("products_store_barcode_key")) {
      return { values, fieldErrors: { barcode: "Ya tienes un producto con ese código de barras." } };
    }
    return { values, fieldErrors: { name: "Ya tienes un producto con ese nombre." } };
  }
  if (isForeignKey(error)) {
    return { values, fieldErrors: { categoryId: "La categoría seleccionada no es válida." } };
  }
  return { values, error: GENERIC };
}

export async function createProduct(
  _prev: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const { values, fieldErrors, input } = parseProductForm(formData);
  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };

  const { membership } = await getCurrentContext();
  if (!membership) return { values, error: NO_STORE };

  // La FK compuesta (category_id, store_id) impide usar categorías de otra tienda.
  let createdId: string;
  try {
    createdId = await createProduct_(membership.store.id, input);
  } catch (error) {
    return productError(error, values);
  }

  // Foto opcional: si falla, el producto ya existe y se avisa sin deshacerlo.
  let warning: string | undefined;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const saved = await savePhoto(membership.store.id, createdId, photo);
    if (!saved.ok) {
      warning = `El producto se creó, pero la foto no se guardó: ${saved.error} Puedes agregarla desde su ficha.`;
    }
  }

  revalidatePath("/products");
  // "Crear y registrar lote": sigue directo al formulario de lote con el producto elegido.
  // Si la foto falló se queda aquí para que el aviso no se pierda.
  if (formData.get("intent") === "lot" && !warning) {
    redirect(`/lots/new?product=${createdId}`);
  }
  return {
    createdId,
    values: { name: "", categoryId: values.categoryId, unit: values.unit, description: "", barcode: "", brand: "", supplier: "", location: "" },
    success: `Producto «${values.name}» creado.`,
    warning,
  };
}

export async function updateProduct(
  productId: string,
  _prev: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const { values, fieldErrors, input } = parseProductForm(formData);

  const { membership } = await getCurrentContext();
  if (!membership) return { values, error: NO_STORE };
  const storeId = membership.store.id;
  if (!isUuid(productId)) return { values, error: GENERIC };

  const current = await getProduct(storeId, productId).catch(() => null);
  if (!current) return { values, error: "El producto ya no existe." };

  // Con lotes registrados la unidad no cambia: las cantidades dejarían de tener sentido.
  if (current.lot_count > 0) {
    input.unit = current.unit;
    values.unit = current.unit;
    delete fieldErrors.unit;
  }
  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };

  try {
    await updateProduct_(storeId, productId, input);
  } catch (error) {
    return productError(error, values);
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}
