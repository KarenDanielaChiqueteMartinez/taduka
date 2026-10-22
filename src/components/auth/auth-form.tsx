"use client";

import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "@/lib/auth/actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

type Props = { mode: "login" | "register" };

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
