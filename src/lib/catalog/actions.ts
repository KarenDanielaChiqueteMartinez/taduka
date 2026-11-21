"use server";

import { revalidatePath } from "next/cache";
import { savePhoto } from "@/lib/catalog/photos-server";
import { isUnit } from "@/lib/catalog/units";
import {
  createCategory as createCategory_,
  createProduct as createProduct_,
} from "@/lib/db/catalog";
import { isCheckViolation, isDuplicate, isForeignKey } from "@/lib/db/pool";
import { getCurrentContext } from "@/lib/stores/context";

export type CatalogFormState = {
  values?: { name?: string; categoryId?: string; unit?: string };
  error?: string;
  success?: string;
  // Aviso no bloqueante (p. ej. el producto se creó pero la foto no se pudo guardar).
  warning?: string;
  fieldErrors?: Partial<Record<"name" | "categoryId" | "unit", string>>;
};

const MAX_CATEGORY_NAME = 60;
const MAX_PRODUCT_NAME = 120;
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

  try {
    await createCategory_(membership.store.id, name);
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
  return { values: { name: "" }, success: `Categoría «${name}» creada.` };
}

export async function createProduct(
  _prev: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const unit = String(formData.get("unit") ?? "");
  const values = { name, categoryId, unit };

  const fieldErrors: CatalogFormState["fieldErrors"] = {};
  if (!name) fieldErrors.name = "Escribe el nombre del producto.";
  else if (name.length > MAX_PRODUCT_NAME) {
    fieldErrors.name = `Usa máximo ${MAX_PRODUCT_NAME} caracteres.`;
  }
  if (!isUnit(unit)) fieldErrors.unit = "Elige una unidad de medida.";
  if (categoryId && !UUID_PATTERN.test(categoryId)) {
    fieldErrors.categoryId = "La categoría seleccionada no es válida.";
  }
  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };

  const { membership } = await getCurrentContext();
  if (!membership) return { values, error: NO_STORE };

  // La FK compuesta (category_id, store_id) impide usar categorías de otra tienda.
  let createdId: string;
  try {
    createdId = await createProduct_(membership.store.id, {
      categoryId: categoryId || null,
      name,
      unit,
    });
  } catch (error) {
    if (isDuplicate(error)) {
      return { values, fieldErrors: { name: "Ya tienes un producto con ese nombre." } };
    }
    if (isForeignKey(error)) {
      return { values, fieldErrors: { categoryId: "La categoría seleccionada no es válida." } };
    }
    return { values, error: GENERIC };
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
  return {
    values: { name: "", categoryId, unit },
    success: `Producto «${name}» creado.`,
    warning,
  };
}
