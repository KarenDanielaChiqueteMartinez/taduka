"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createProduct, updateProduct, type CatalogFormState } from "@/lib/catalog/actions";
import { UNITS } from "@/lib/catalog/units";
import type { ProductRow } from "@/lib/db/catalog";
import { FormHeader } from "@/components/app/form-header";
import { BarcodeSheet } from "@/components/catalog/barcode-sheet";
import { CategoryDialog } from "@/components/catalog/category-dialog";
import { PhotoPicker } from "@/components/catalog/photo-picker";
import { inputClass } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

type Props = {
  categories: { id: string; name: string }[];
  // Con producto, el formulario edita; sin él, crea.
  product?: ProductRow;
  // Foto actual del producto (solo al editar).
  photoUrl?: string | null;
};

// Valor especial de la última opción del selector de categoría; nunca se envía al servidor.
const NEW_CATEGORY = "__new__";

const rowControl =
  "min-w-0 flex-1 bg-transparent text-right text-base font-semibold text-action outline-none placeholder:font-semibold placeholder:text-action/70 aria-[invalid=true]:text-danger";

// Fila tocable: título a la izquierda y el valor a la derecha, con el control real (input o select)
// ocupando toda la fila para que el toque nunca falle.
function Row({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="px-4">
      <label
        htmlFor={id}
        className="flex min-h-16 cursor-pointer items-center justify-between gap-4 focus-within:text-primary"
      >
        <span className="shrink-0 text-base font-bold text-text-primary">{label}</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
          {children}
          <Icon name="chevron-right" className="size-5 shrink-0 text-text-secondary" />
        </span>
      </label>
      {error && (
        <p id={`${id}-error`} className="-mt-1 pb-3 text-right text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function RowInput({ id, error, ...input }: { id: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      id={id}
      name={id}
      type="text"
      className={rowControl}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...input}
    />
  );
}

function RowSelect({
  id,
  error,
  children,
  ...select
}: { id: string; error?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      id={id}
      name={id}
      dir="rtl"
      className={`${rowControl} cursor-pointer appearance-none`}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...select}
    >
      {children}
    </select>
  );
}

export function ProductForm({ categories, product, photoUrl }: Props) {
  const isEdit = Boolean(product);
  const [state, action] = useActionState<CatalogFormState, FormData>(
    product ? updateProduct.bind(null, product.id) : createProduct,
    {},
  );
  const router = useRouter();
  const toast = useToast();

  // Guardado: avisa con una notificación y vuelve a la lista (al crear) o a la ficha (al editar);
  // el aviso sigue visible allí. Si la foto no se pudo guardar, un aviso extra explica cómo
  // agregarla después.
  const productId = product?.id;
  useEffect(() => {
    if (!state.success) return;
    toast.show(state.success);
    if (state.warning) toast.show(state.warning, "warning");
    router.push(productId ? `/products/${productId}` : "/products");
  }, [state, toast, router, productId]);

  const errors = state.fieldErrors;
  const initial = state.values ?? {
    name: product?.name,
    categoryId: product?.category_id ?? "",
    unit: product?.unit,
    description: product?.description ?? "",
    barcode: product?.barcode ?? "",
    brand: product?.brand ?? "",
    supplier: product?.supplier ?? "",
    location: product?.location ?? "",
  };
  const unitLocked = (product?.lot_count ?? 0) > 0;

  // La lista y la selección son locales: una categoría creada en la ventana aparece y queda
  // elegida sin recargar la página ni perder lo ya escrito.
  const [cats, setCats] = useState(categories);
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? "");
  // La categoría es obligatoria: sin ninguna creada, se abre la ventana para crear la primera.
  const [dialogOpen, setDialogOpen] = useState(categories.length === 0);

  // "Más detalles" arranca abierto al editar (para ver y completar los datos) o si el servidor
  // rechazó alguno de esos campos; al crear arranca plegado.
  const [moreOpen, setMoreOpen] = useState(isEdit);
  const detailsHaveError = Boolean(
    errors?.description || errors?.barcode || errors?.location || errors?.brand || errors?.supplier,
  );

  // El código se captura en una hoja aparte; el formulario lo envía en un campo oculto.
  const [barcode, setBarcode] = useState(initial.barcode ?? "");
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  // Cuando la acción responde, el servidor manda el valor vigente (vacío tras crear con éxito).
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    setBarcode(initial.barcode ?? "");
  }

  return (
    <>
    <form action={action} noValidate className="space-y-5">
      <FormHeader
        title={isEdit ? "Editar producto" : "Nuevo producto"}
        cancelHref={product ? `/products/${product.id}` : "/products"}
        submitLabel={isEdit ? "Guardar" : "Crear"}
        pendingLabel={isEdit ? "Guardando…" : "Creando…"}
      />

      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger">
          <Icon name="alert-triangle" className="mt-0.5 size-4" />
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="name" className="sr-only">
          Nombre del producto
        </label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="Ingresa el nombre del producto"
          maxLength={120}
          required
          autoComplete="off"
          defaultValue={initial.name}
          aria-invalid={errors?.name ? true : undefined}
          aria-describedby={errors?.name ? "name-error" : undefined}
          className="h-14 w-full border-b border-border bg-transparent px-1 text-xl font-semibold text-text-primary outline-none transition-colors placeholder:font-medium placeholder:text-text-secondary/70 focus-visible:border-action aria-[invalid=true]:border-danger"
        />
        {errors?.name && (
          <p id="name-error" className="mt-1.5 text-sm font-medium text-danger">
            {errors.name}
          </p>
        )}
      </div>

      <PhotoPicker initialUrl={photoUrl ?? null} />

      <div className="divide-y divide-border rounded-control border border-border bg-surface">
        <Row id="categoryId" label="Categoría" error={errors?.categoryId}>
          {cats.length === 0 ? (
            <button
              type="button"
              id="categoryId"
              onClick={() => setDialogOpen(true)}
              aria-describedby={errors?.categoryId ? "categoryId-error" : undefined}
              className={`${rowControl} cursor-pointer`}
            >
              Crear categoría
            </button>
          ) : (
            <RowSelect
              id="categoryId"
              error={errors?.categoryId}
              required
              value={categoryId}
              onChange={(event) => {
                // "Nueva categoría" no cambia la selección: abre la ventana y, si se crea, la elige.
                if (event.target.value === NEW_CATEGORY) setDialogOpen(true);
                else setCategoryId(event.target.value);
              }}
            >
              <option value="" disabled>
                Elige una categoría
              </option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>+ Nueva categoría…</option>
            </RowSelect>
          )}
        </Row>
        <Row id="unit" label="Unidad de medida" error={errors?.unit}>
          <RowSelect id="unit" error={errors?.unit} required disabled={unitLocked} defaultValue={initial.unit || "pieza"}>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </RowSelect>
        </Row>
      </div>

      {/* Lo que no es indispensable queda plegado; se abre solo si ya tiene datos o errores. */}
      <details
        open={moreOpen || detailsHaveError}
        onToggle={(event) => setMoreOpen(event.currentTarget.open)}
        className="group space-y-4"
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-control border border-border bg-surface px-4 text-base font-bold focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          <span>
            Más detalles <span className="text-sm font-medium text-text-secondary">(opcional)</span>
          </span>
          <Icon
            name="chevron-right"
            className="size-5 text-text-secondary transition-transform group-open:rotate-90"
          />
        </summary>

        <div className="space-y-1.5">
          <label htmlFor="description" className="text-base font-bold text-text-primary">
            Descripción
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={500}
            placeholder="Añade una descripción"
            defaultValue={initial.description}
            aria-invalid={errors?.description ? true : undefined}
            aria-describedby={errors?.description ? "description-error" : undefined}
            className={`${inputClass} h-auto min-h-24 resize-none py-3`}
          />
          {errors?.description && (
            <p id="description-error" className="text-sm font-medium text-danger">
              {errors.description}
            </p>
          )}
        </div>

        <div className="divide-y divide-border rounded-control border border-border bg-surface">
          <Row id="barcode" label="Código de barras" error={errors?.barcode}>
            <input type="hidden" name="barcode" value={barcode} />
            <button
              type="button"
              id="barcode"
              onClick={() => setBarcodeOpen(true)}
              aria-describedby={errors?.barcode ? "barcode-error" : undefined}
              className={`${rowControl} cursor-pointer truncate ${errors?.barcode ? "text-danger" : ""}`}
            >
              {barcode || "Asignar"}
            </button>
          </Row>
          <Row id="location" label="Ubicación" error={errors?.location}>
            <RowInput
              id="location"
              error={errors?.location}
              maxLength={80}
              placeholder="Asignar ubicación"
              defaultValue={initial.location}
            />
          </Row>
          <Row id="brand" label="Marca o fabricante" error={errors?.brand}>
            <RowInput
              id="brand"
              error={errors?.brand}
              maxLength={80}
              placeholder="Añadir"
              defaultValue={initial.brand}
            />
          </Row>
          <Row id="supplier" label="Proveedor" error={errors?.supplier}>
            <RowInput
              id="supplier"
              error={errors?.supplier}
              maxLength={80}
              placeholder="Añadir"
              defaultValue={initial.supplier}
            />
          </Row>
        </div>
      </details>

      {unitLocked && (
        <p className="flex items-start gap-2 rounded-control bg-surface-muted px-3.5 py-3 text-sm text-text-secondary">
          <Icon name="info" className="mt-0.5 size-4" />
          La unidad no se puede cambiar porque el producto ya tiene lotes registrados.
        </p>
      )}
    </form>
    <BarcodeSheet
      open={barcodeOpen}
      value={barcode}
      onClose={() => setBarcodeOpen(false)}
      onConfirm={(code) => {
        setBarcode(code);
        setBarcodeOpen(false);
      }}
    />
    <CategoryDialog
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
      onCreated={(category) => {
        setCats((list) => [...list, category].sort((a, b) => a.name.localeCompare(b.name)));
        setCategoryId(category.id);
        setDialogOpen(false);
      }}
    />
    </>
  );
}
