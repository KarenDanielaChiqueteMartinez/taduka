"use server";

import { revalidatePath } from "next/cache";
import { isUnit } from "@/lib/catalog/units";
import { getCurrentContext } from "@/lib/stores/context";

export type CatalogFormState = {
  values?: { name?: string; categoryId?: string; unit?: string };
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"name" | "categoryId" | "unit", string>>;
};

const MAX_CATEGORY_NAME = 60;
const MAX_PRODUCT_NAME = 120;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = "Primero crea tu tienda desde el inicio.";
const NO_PERMISSION = "No tienes permiso para realizar esta acción.";
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

  const { supabase, membership } = await getCurrentContext();
  if (!membership?.stores) return { values, error: NO_STORE };

  const { error } = await supabase
    .from("categories")
    .insert({ store_id: membership.stores.id, name });

  if (error) {
    if (error.code === "23505") {
      return { values, fieldErrors: { name: "Ya tienes una categoría con ese nombre." } };
    }
    return { values, error: error.code === "42501" ? NO_PERMISSION : GENERIC };
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

  const { supabase, membership } = await getCurrentContext();
  if (!membership?.stores) return { values, error: NO_STORE };

  // La FK compuesta (category_id, store_id) impide usar categorías de otra tienda.
  const { error } = await supabase.from("products").insert({
    store_id: membership.stores.id,
    category_id: categoryId || null,
    name,
    unit,
  });

  if (error) {
    switch (error.code) {
      case "23505":
        return { values, fieldErrors: { name: "Ya tienes un producto con ese nombre." } };
      case "23503":
        return {
          values,
          fieldErrors: { categoryId: "La categoría seleccionada no es válida." },
        };
      case "42501":
        return { values, error: NO_PERMISSION };
      default:
        return { values, error: GENERIC };
    }
  }

  revalidatePath("/products");
  return { values: { name: "", categoryId, unit }, success: `Producto «${name}» creado.` };
}
