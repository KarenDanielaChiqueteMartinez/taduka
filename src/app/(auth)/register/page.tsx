import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Crear cuenta · TADUKA" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Crear cuenta</h1>
      <p className="mt-1 mb-6 text-sm text-text-secondary">
        Usa tu correo y una contraseña de al menos 8 caracteres.
      </p>
      <AuthForm mode="register" />
      <p className="mt-6 text-sm text-text-secondary">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </>
  );
}
