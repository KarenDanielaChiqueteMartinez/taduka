import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Iniciar sesión · TADUKA" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Iniciar sesión</h1>
      <p className="mt-1 mb-6 text-sm text-text-secondary">
        Entra para ver los productos y lotes de tu tienda.
      </p>
      <AuthForm mode="login" />
      <p className="mt-6 text-sm text-text-secondary">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="font-semibold text-action underline-offset-4 hover:underline">
          Regístrate
        </Link>
      </p>
    </>
  );
}
