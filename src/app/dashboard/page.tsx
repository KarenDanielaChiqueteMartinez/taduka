import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ROLE_LABELS, getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { LoadingState } from "@/components/app/page-states";
import { CreateStoreForm } from "@/components/stores/create-store-form";

export const metadata: Metadata = { title: "Inicio · TADUKA" };

export default function DashboardPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <CurrentUser />
      </Suspense>
    </AppShell>
  );
}

const SECTIONS = [
  {
    href: "/products",
    title: "Productos",
    description: "Tu catálogo: nombre, categoría y unidad de medida.",
  },
  {
    href: "/categories",
    title: "Categorías",
    description: "Agrupa tus productos para encontrarlos más rápido.",
  },
];

async function CurrentUser() {
  // Supabase Auth usa Date.now() (vigencia del token); debe ejecutarse en la petición.
  await connection();
  const { user, membership, storeError } = await getCurrentContext();

  return (
    <>
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
                <dd className="break-all font-medium">{user.email}</dd>
              </div>
            </dl>
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

      {membership?.stores && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="block h-full rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="font-semibold">{s.title}</span>
                <span className="mt-1 block text-sm text-text-secondary">
                  {s.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
