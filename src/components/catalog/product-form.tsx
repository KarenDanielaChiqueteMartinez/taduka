"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createProduct, type CatalogFormState } from "@/lib/catalog/actions";
import { UNITS } from "@/lib/catalog/units";
import { PhotoPicker } from "@/components/catalog/photo-picker";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";

type Props = { categories: { id: string; name: string }[] };

export function ProductForm({ categories }: Props) {
  const [state, action] = useActionState<CatalogFormState, FormData>(
    createProduct,
    {},
  );

  return (
    <form action={action} noValidate className="space-y-5">
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
      <Field
        id="name"
        label="Nombre del producto"
        type="text"
        placeholder="Ej. Leche entera 1 L"
        maxLength={120}
        required
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="categoryId"
          label="Categoría (opcional)"
          defaultValue={state.values?.categoryId ?? ""}
          error={state.fieldErrors?.categoryId}
        >
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="unit"
          label="Unidad de medida"
          required
          defaultValue={state.values?.unit ?? ""}
          error={state.fieldErrors?.unit}
        >
          <option value="" disabled>
            Elige una unidad
          </option>
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </SelectField>
      </div>
      <PhotoPicker />
      <p className="flex items-start gap-2 rounded-control bg-primary-soft/60 px-3.5 py-3 text-sm text-primary">
        <Icon name="info" className="mt-0.5 size-4" />
        La fecha de caducidad no va en el producto: se registra en cada lote.
      </p>
      <SubmitButton pendingLabel="Guardando…" size="lg" className="w-full">
        <Icon name="plus" className="size-5" strokeWidth={2.6} />
        Agregar producto
      </SubmitButton>
    </form>
  );
}
