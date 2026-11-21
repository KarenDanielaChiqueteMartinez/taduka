import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { signOut } from "@/lib/auth/actions";
import { ROLE_LABELS, getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { LoadError, LoadingState } from "@/components/app/page-states";
import { ScreenHeader } from "@/components/app/screen-header";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata: Metadata = { title: "Más · TADUKA" };

export default function MorePage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <More />
      </Suspense>
    </AppShell>
  );
}

const LINKS: { href: string; label: string; hint: string; icon: IconName }[] = [
  { href: "/categories", label: "Categorías", hint: "Organiza tus productos", icon: "tag" },
  { href: "/lots", label: "Lotes", hint: "Caducidades y existencias por lote", icon: "calendar" },
  { href: "/products/new", label: "Nuevo producto", hint: "Agrega un artículo al catálogo", icon: "plus" },
];

async function More() {
  await connection();
  const { user, membership, storeError } = await getCurrentContext();
  const initial = (user.email ?? "?").slice(0, 1).toUpperCase();

  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;

  return (
    <>
      <ScreenHeader title="Más" storeName={membership?.store.name} />

      <Card className="tadu-rise mb-5 flex items-center gap-4 p-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-deep text-xl font-bold text-accent">
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{user.email}</p>
          <p className="truncate text-sm text-text-secondary">
            {membership
              ?`${ROLE_LABELS[membership.role]} · ${membership.store.name}`
              : "Aún sin tienda"}
          </p>
        </div>
      </Card>

      <ul className="mb-5 space-y-2.5">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="tadu-rise flex items-center gap-3 rounded-card border border-border/70 bg-surface p-3.5 shadow-card transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Icon name={l.icon} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">{l.label}</span>
                <span className="block text-sm text-text-secondary">{l.hint}</span>
              </span>
              <Icon name="chevron-right" className="size-5 text-text-secondary" />
            </Link>
          </li>
        ))}
      </ul>

      <form action={signOut}>
        <SubmitButton variant="danger" size="lg" pendingLabel="Cerrando sesión…" className="w-full">
          <Icon name="log-out" className="size-5" />
          Cerrar sesión
        </SubmitButton>
      </form>
    </>
  );
}
