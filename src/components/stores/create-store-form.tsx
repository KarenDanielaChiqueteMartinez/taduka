"use client";

import { useActionState } from "react";
import { createFirstStore, type StoreFormState } from "@/lib/stores/actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function CreateStoreForm() {
  const [state, action] = useActionState<StoreFormState, FormData>(
    createFirstStore,
    {},
  );

  return (
    <form action={action} noValidate className="space-y-4">
      {state.error && (
        <p
          role="alert"
          className="rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          {state.error}
        </p>
      )}
      <Field
        id="name"
        label="Nombre de tu tienda"
        type="text"
        autoComplete="organization"
        placeholder="Ej. Abarrotes Doña Lupe"
        maxLength={80}
        required
        defaultValue={state.name}
        error={state.fieldErrors?.name}
      />
      <SubmitButton pendingLabel="Creando tienda…" className="w-full sm:w-auto">
        Crear tienda
      </SubmitButton>
    </form>
  );
}
