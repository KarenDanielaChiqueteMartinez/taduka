"use client";

import { useActionState } from "react";
import { createCategory, type CatalogFormState } from "@/lib/catalog/actions";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";

export function CategoryForm() {
  const [state, action] = useActionState<CatalogFormState, FormData>(
    createCategory,
    {},
  );

  return (
    <form action={action} noValidate className="space-y-4">
      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger">
          <Icon name="alert-triangle" className="mt-0.5 size-4" />
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="flex items-center gap-2 rounded-control bg-action-soft px-3.5 py-3 text-sm font-semibold text-action">
          <Icon name="check-circle" className="size-4" />
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
      <SubmitButton pendingLabel="Guardando…" size="lg" className="w-full">
        <Icon name="plus" className="size-5" strokeWidth={2.6} />
        Agregar categoría
      </SubmitButton>
    </form>
  );
}
