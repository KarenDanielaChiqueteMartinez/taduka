"use client";

import Link from "next/link";
import { useActionState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { createProduct, updateProduct, type CatalogFormState } from "@/lib/catalog/actions";
import { UNITS } from "@/lib/catalog/units";
import type { ProductRow } from "@/lib/db/catalog";
import { PhotoPicker } from "@/components/catalog/photo-picker";
import { inputClass } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";

type Props = {
  categories: { id: string; name: string }[];
  // Con producto, el formulario edita; sin él, crea. La foto se cambia desde la ficha.
  product?: ProductRow;
};

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

export function ProductForm({ categories, product }: Props) {
  const isEdit = Boolean(product);
  const [state, action] = useActionState<CatalogFormState, FormData>(
    product ? updateProduct.bind(null, product.id) : createProduct,
    {},
  );
  const errors = state.fieldErrors;
  const initial = state.values ?? {
    name: product?.name,
    categoryId: product?.category_id ?? "",
    unit: product?.unit,
    description: product?.description ?? "",
    barcode: product?.barcode ?? "",
    brand: product?.brand ?? "",
    location: product?.location ?? "",
  };
  const unitLocked = (product?.lot_count ?? 0) > 0;

  return (
    <form action={action} noValidate className="space-y-5">
      <header className="tadu-rise flex items-center justify-between gap-3">
        <Link
          href={product ? `/products/${product.id}` : "/products"}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-surface pr-4 pl-2.5 text-base font-semibold text-text-secondary shadow-card transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="chevron-left" className="size-5" strokeWidth={2.4} />
          Cancelar
        </Link>
        <h1 className="truncate text-lg font-bold tracking-tight">{isEdit ? "Editar producto" : "Nuevo producto"}</h1>
        <SubmitButton pendingLabel={isEdit ? "Guardando…" : "Creando…"} variant="soft" className="min-h-11 rounded-full px-5 text-base">
          {isEdit ? "Guardar" : "Crear"}
        </SubmitButton>
      </header>

      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger">
          <Icon name="alert-triangle" className="mt-0.5 size-4" />
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-action-soft px-3.5 py-3 text-sm font-semibold text-action">
          <span className="inline-flex items-center gap-2">
            <Icon name="check-circle" className="size-4" />
            {state.success}
          </span>
          <Link href="/products" className="underline underline-offset-4">
            Ver productos
          </Link>
        </p>
      )}
      {state.warning && (
        <p role="status" className="flex items-start gap-2 rounded-control bg-warning-soft px-3.5 py-3 text-sm font-medium text-warning">
          <Icon name="alert-triangle" className="mt-0.5 size-4" />
          {state.warning}
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

      {!isEdit && <PhotoPicker />}

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
        <Row id="categoryId" label="Categoría" error={errors?.categoryId}>
          <RowSelect id="categoryId" error={errors?.categoryId} defaultValue={initial.categoryId ?? ""}>
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </RowSelect>
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
        <Row id="barcode" label="Código de barras" error={errors?.barcode}>
          <RowInput
            id="barcode"
            error={errors?.barcode}
            inputMode="numeric"
            maxLength={64}
            autoComplete="off"
            placeholder="Asignar"
            defaultValue={initial.barcode}
          />
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
      </div>

      {unitLocked && (
        <p className="flex items-start gap-2 rounded-control bg-surface-muted px-3.5 py-3 text-sm text-text-secondary">
          <Icon name="info" className="mt-0.5 size-4" />
          La unidad no se puede cambiar porque el producto ya tiene lotes registrados.
        </p>
      )}
      <p className="flex items-start gap-2 rounded-control bg-primary-soft/60 px-3.5 py-3 text-sm text-primary">
        <Icon name="info" className="mt-0.5 size-4" />
        La fecha de caducidad no va en el producto: se registra en cada lote.
      </p>
    </form>
  );
}
