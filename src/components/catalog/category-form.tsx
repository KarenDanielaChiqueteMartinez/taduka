"use client";

import { useActionState } from "react";
import { createCategory, type CatalogFormState } from "@/lib/catalog/actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function CategoryForm() {
  const [state, action] = useActionState<CatalogFormState, FormData>(
    createCategory,
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
        label="Nombre de la categoría"
        type="text"
        placeholder="Ej. Lácteos"
        maxLength={60}
        required
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
      <SubmitButton pendingLabel="Guardando…" className="w-full sm:w-auto">
        Agregar categoría
      </SubmitButton>
    </form>
  );
}
