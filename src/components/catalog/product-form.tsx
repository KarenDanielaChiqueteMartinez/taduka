"use client";

import { useActionState } from "react";
import { createProduct, type CatalogFormState } from "@/lib/catalog/actions";
import { UNITS } from "@/lib/catalog/units";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";

type Props = { categories: { id: string; name: string }[] };

export function ProductForm({ categories }: Props) {
  const [state, action] = useActionState<CatalogFormState, FormData>(
    createProduct,
    {},
  );

  return (
    <form action={action} noValidate className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-control bg-primary-soft px-3 py-2.5 text-sm text-primary">
          {state.success}
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
      <p className="text-sm text-text-secondary">
        La fecha de caducidad no va en el producto: se registra en cada lote.
      </p>
      <SubmitButton pendingLabel="Guardando…" className="w-full sm:w-auto">
        Agregar producto
      </SubmitButton>
    </form>
  );
}
