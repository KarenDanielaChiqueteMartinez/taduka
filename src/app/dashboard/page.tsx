import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { signOut } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata: Metadata = { title: "Inicio · TADUKA" };

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      <Suspense
        fallback={
          <p role="status" className="text-sm text-text-secondary">
            Cargando tu sesión…
          </p>
        }
      >
        <CurrentUser />
      </Suspense>
    </main>
  );
}

async function CurrentUser() {
  // Supabase Auth usa Date.now() (vigencia del token); debe ejecutarse en la petición.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xl font-semibold tracking-tight text-primary">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-accent" />
          TADUKA
        </p>
        <form action={signOut}>
          <SubmitButton variant="secondary" pendingLabel="Cerrando sesión…">
            Cerrar sesión
          </SubmitButton>
        </form>
      </header>

      <div className="rounded-card border border-border bg-surface p-4 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sesión iniciada</h1>
        <p className="mt-1 text-sm text-text-secondary">Sesión de</p>
        <p className="break-all font-medium">{data.user.email}</p>
        <p className="mt-4 rounded-control bg-surface-muted px-3 py-2.5 text-sm text-text-secondary">
          Página provisional. Todavía no hay una tienda asociada a esta cuenta.
        </p>
      </div>
    </section>
  );
}
