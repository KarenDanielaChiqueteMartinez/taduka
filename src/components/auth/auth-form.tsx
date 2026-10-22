"use client";

import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/ui/submit-button";

type Props = { mode: "login" | "register" };

const inputClass =
  "h-11 w-full rounded-control border border-border bg-surface px-3 text-base text-text-primary transition-colors placeholder:text-text-secondary focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary aria-[invalid=true]:border-danger";

function Field({
  id,
  label,
  error,
  ...input
}: {
  id: string;
  label: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function AuthForm({ mode }: Props) {
  const isRegister = mode === "register";
  const [state, action] = useActionState<AuthState, FormData>(
    isRegister ? signUp : signIn,
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
      {state.message && (
        <p
          role="status"
          className="rounded-control bg-primary-soft px-3 py-2.5 text-sm text-primary"
        >
          {state.message}
        </p>
      )}

      <Field
        id="email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.email}
        error={state.fieldErrors?.email}
      />
      <Field
        id="password"
        label="Contraseña"
        type="password"
        autoComplete={isRegister ? "new-password" : "current-password"}
        required
        minLength={isRegister ? 8 : undefined}
        error={state.fieldErrors?.password}
      />
      {isRegister && (
        <Field
          id="confirmPassword"
          label="Confirmar contraseña"
          type="password"
          autoComplete="new-password"
          required
          error={state.fieldErrors?.confirmPassword}
        />
      )}

      <SubmitButton
        pendingLabel={isRegister ? "Creando cuenta…" : "Entrando…"}
        className="w-full"
      >
        {isRegister ? "Crear cuenta" : "Iniciar sesión"}
      </SubmitButton>
    </form>
  );
}
