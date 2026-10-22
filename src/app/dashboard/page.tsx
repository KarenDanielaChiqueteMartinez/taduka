import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { signOut } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { CreateStoreForm } from "@/components/stores/create-store-form";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata: Metadata = { title: "Inicio · TADUKA" };

type Membership = {
  role: "owner" | "staff";
  stores: { id: string; name: string } | null;
};

const ROLE_LABELS: Record<Membership["role"], string> = {
  owner: "Propietario",
  staff: "Personal",
};

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

  // RLS limita el resultado a las tiendas del usuario autenticado.
  const { data: memberships, error: storeError } = await supabase
    .from("store_members")
    .select("role, stores(id, name)")
    .order("created_at", { ascending: true })
    .limit(1);
  const membership = (memberships?.[0] ?? null) as Membership | null;

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
        {storeError ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              No pudimos cargar tu tienda
            </h1>
            <p role="alert" className="mt-2 text-sm text-danger">
              Ocurrió un error al consultar tus datos. Recarga la página para
              intentarlo de nuevo.
            </p>
          </>
        ) : membership?.stores ? (
          <>
            <p className="text-sm text-text-secondary">Tu tienda</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {membership.stores.name}
            </h1>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-text-secondary">Tu rol</dt>
                <dd className="font-medium">{ROLE_LABELS[membership.role]}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Sesión de</dt>
                <dd className="break-all font-medium">{data.user.email}</dd>
              </div>
            </dl>
            <p className="mt-4 rounded-control bg-surface-muted px-3 py-2.5 text-sm text-text-secondary">
              Página provisional. Próximamente podrás registrar productos y lotes.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              Te damos la bienvenida
            </h1>
            <p className="mt-1 mb-6 text-sm text-text-secondary">
              Para empezar, crea tu tienda. Podrás cambiar los detalles más
              adelante.
            </p>
            <CreateStoreForm />
          </>
        )}
      </div>
    </section>
  );
}
