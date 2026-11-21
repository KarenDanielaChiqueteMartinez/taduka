"use client";

import { useActionState } from "react";
import { createFirstStore, type StoreFormState } from "@/lib/stores/actions";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
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
          className="flex items-start gap-2 rounded-control bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger"
        >
          <Icon name="alert-triangle" className="mt-0.5 size-4" />
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
      <SubmitButton pendingLabel="Creando tienda…" size="lg" className="w-full">
        <Icon name="store" className="size-5" />
        Crear mi tienda
      </SubmitButton>
    </form>
  );
}
