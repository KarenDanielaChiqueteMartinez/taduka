"use client";

import { useActionState, useEffect } from "react";
import { createCategory, type CatalogFormState } from "@/lib/catalog/actions";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";

type Props = {
  // Se llama con la categoría recién creada (p. ej. para seleccionarla en otro formulario).
  onCreated?: (category: { id: string; name: string }) => void;
  // Evita ids repetidos cuando el formulario está dentro de otro formulario de la página.
  inputId?: string;
  autoFocus?: boolean;
};

export function CategoryForm({ onCreated, inputId = "name", autoFocus }: Props) {
  const [state, action] = useActionState<CatalogFormState, FormData>(
    createCategory,
    {},
  );

  useEffect(() => {
    if (state.category) onCreated?.(state.category);
    // Solo reacciona a un nuevo resultado de la acción.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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
        id={inputId}
        name="name"
        autoFocus={autoFocus}
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
