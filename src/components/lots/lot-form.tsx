"use client";

import { useActionState } from "react";
import { createLot, type LotFormState } from "@/lib/lots/actions";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";

type Props = {
  products: { id: string; label: string }[];
  today: string;
  defaultProductId?: string;
};

export function LotForm({ products, today, defaultProductId }: Props) {
  const [state, action] = useActionState<LotFormState, FormData>(createLot, {});
  const v = state.values;

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
      <SelectField
        id="productId"
        label="Producto"
        required
        defaultValue={v?.productId ?? defaultProductId ?? ""}
        error={state.fieldErrors?.productId}
      >
        <option value="" disabled>
          Elige un producto
        </option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="entryDate"
          label="Fecha de entrada"
          type="date"
          required
          defaultValue={v?.entryDate ?? today}
          error={state.fieldErrors?.entryDate}
        />
        <Field
          id="expirationDate"
          label="Fecha de caducidad"
          type="date"
          required
          defaultValue={v?.expirationDate}
          error={state.fieldErrors?.expirationDate}
        />
        <Field
          id="quantity"
          label="Cantidad inicial"
          type="text"
          inputMode="decimal"
          placeholder="Ej. 24"
          required
          defaultValue={v?.quantity}
          error={state.fieldErrors?.quantity}
        />
        <Field
          id="supplierLotCode"
          label="Código de lote del proveedor (opcional)"
          type="text"
          maxLength={60}
          defaultValue={v?.supplierLotCode}
          error={state.fieldErrors?.supplierLotCode}
        />
      </div>
      <p className="text-sm text-text-secondary">
        Confirma la fecha de caducidad tal como aparece en el empaque. TADUKA no la
        calcula por ti.
      </p>
      <SubmitButton pendingLabel="Guardando…" className="w-full sm:w-auto">
        Registrar lote
      </SubmitButton>
    </form>
  );
}
