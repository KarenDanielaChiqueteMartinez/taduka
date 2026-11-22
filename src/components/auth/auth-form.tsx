"use client";

import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "@/lib/auth/actions";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { PasswordField } from "@/components/ui/password-field";
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
          className="flex items-start gap-2 rounded-control bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger"
        >
          <Icon name="alert-triangle" className="mt-0.5 size-4" />
          {state.error}
        </p>
      )}
      {state.message && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-control bg-action-soft px-3.5 py-3 text-sm font-semibold text-action"
        >
          <Icon name="check-circle" className="mt-0.5 size-4" />
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
      <PasswordField
        id="password"
        label="Contraseña"
        autoComplete={isRegister ? "new-password" : "current-password"}
        required
        minLength={isRegister ? 8 : undefined}
        error={state.fieldErrors?.password}
      />
      {isRegister && (
        <PasswordField
          id="confirmPassword"
          label="Confirmar contraseña"
          autoComplete="new-password"
          required
          error={state.fieldErrors?.confirmPassword}
        />
      )}

      <SubmitButton
        pendingLabel={isRegister ? "Creando cuenta…" : "Entrando…"}
        size="lg"
        className="w-full"
      >
        {isRegister ? "Crear cuenta" : "Iniciar sesión"}
      </SubmitButton>
    </form>
  );
}
