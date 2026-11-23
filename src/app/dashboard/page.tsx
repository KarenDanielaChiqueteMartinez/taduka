import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ROLE_LABELS, getCurrentContext } from "@/lib/stores/context";
import { formatQty, greeting, longDate } from "@/lib/format";
import { photoUrl } from "@/lib/catalog/photos";
import { listLots, type LotView } from "@/lib/db/lots";
import { getPhotoVersions } from "@/lib/db/photos";
import {
  countByStatus,
  expiryText,
  priorityLots,
} from "@/lib/inventory/summary";
import { AppShell } from "@/components/app/app-shell";
import { HomeScan } from "@/components/app/home-scan";
import { LoadError, LoadingState } from "@/components/app/page-states";
import { ScreenHeader } from "@/components/app/screen-header";
import { CreateStoreForm } from "@/components/stores/create-store-form";
import { Card, SectionTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { ProductThumb } from "@/components/ui/product-thumb";
import { StatusBadge, STATUS_UI } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Inicio · TADUKA" };

export default function DashboardPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <Dashboard />
      </Suspense>
    </AppShell>
  );
}

function displayName(user: { email: string; display_name: string | null }) {
  const raw = user.display_name?.trim() ? user.display_name : user.email.split("@")[0];
  const first = raw.trim().split(/[\s._-]+/)[0] ?? "";
  return first ? first[0].toUpperCase() + first.slice(1) : "";
}

async function Dashboard() {
  // La sesión se valida contra la base de datos en cada petición (dato dinámico).
  await connection();
  const { user, membership, storeError } = await getCurrentContext();
  const initial = (user.email ?? "?").slice(0, 1).toUpperCase();

  if (storeError) {
    return (
      <>
        <ScreenHeader title="Inicio" initial={initial} />
        <LoadError message="No pudimos cargar tu tienda." />
      </>
    );
  }

  // Sin tienda: bienvenida y alta de la primera tienda.
  if (!membership) {
    return (
      <>
        <ScreenHeader title="Bienvenida" initial={initial} />
        <section className="tadu-rise overflow-hidden rounded-panel bg-primary-deep text-white shadow-card">
          <div className="space-y-2 px-5 pt-6 pb-5">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary-deep">
              <Icon name="store" className="size-6" />
            </span>
            <h2 className="pt-2 text-2xl leading-tight font-bold">Te damos la bienvenida a TADUKA</h2>
            <p className="text-sm text-white/80">
              Crea tu tienda para registrar tus productos y recibir avisos antes de que
              caduquen. Podrás cambiar los detalles más adelante.
            </p>
          </div>
          <div className="rounded-t-panel bg-surface p-5 text-text-primary">
            <CreateStoreForm />
          </div>
        </section>
      </>
    );
  }

  const store = membership.store;
  const [{ lots, error }, photos] = await Promise.all([
    listLots(store.id).then(
      (rows) => ({ lots: rows, error: false }),
      () => ({ lots: [] as LotView[], error: true }),
    ),
    getPhotoVersions(store.id).catch(() => new Map<string, number>()),
  ]);
  const counts = countByStatus(lots);
  const priority = priorityLots(lots);
  const attention = counts.vencido + counts.por_vencer;
  const now = new Date();
  const name = displayName(user);

  const shortcuts = [
    { href: "/lots/new", label: "Registrar entrada", icon: "package-plus", primary: true },
    { href: "/count", label: "Contar unidades", icon: "clipboard-check", primary: false },
    { href: "/lots/new/photo", label: "Fotografiar nota", icon: "camera", primary: false },
    { href: "/lots", label: "Ver lotes", icon: "calendar", primary: false },
  ] as const;

  return (
    <>
      {/* Encabezado: saludo, tienda, perfil y búsqueda sobre el fondo verde */}
      <header className="tadu-rise -mx-4 -mt-4 mb-5 rounded-b-[2rem] bg-linear-to-br from-hero-from to-hero-to px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-6 text-white shadow-float sm:-mx-6 sm:px-7 md:mx-0 md:mt-0 md:rounded-panel">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] leading-tight font-bold tracking-tight">
              ¡{greeting(now)}{name ? `, ${name}` : ""}!
            </h1>
            <p className="truncate text-lg font-semibold text-accent">{store.name}</p>
            <p className="mt-1 text-xs text-white/75">
              <span className="first-letter:uppercase">{longDate(now)}</span> · {ROLE_LABELS[membership.role]}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/lots"
              aria-label={attention > 0 ? "Alertas de caducidad: hay lotes por atender" : "Alertas de caducidad"}
              className="relative flex size-11 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
            >
              <Icon name="bell" className="size-5" />
              {attention > 0 && (
                <span className="absolute top-2.5 right-3 size-2.5 rounded-full border-2 border-hero-from bg-accent" />
              )}
            </Link>
            <Link
              href="/more"
              aria-label="Perfil y más opciones"
              className="flex size-12 items-center justify-center rounded-full bg-white text-lg font-bold text-hero-to shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {initial}
            </Link>
          </div>
        </div>

        <form action="/products" method="get" role="search" className="mt-5">
          <label htmlFor="home-q" className="sr-only">
            Buscar producto o lote
          </label>
          <div className="flex items-center gap-2 rounded-[1.25rem] bg-white py-1.5 pr-1.5 pl-4 shadow-[0_6px_18px_rgb(0_0_0/0.18)] focus-within:outline-2 focus-within:outline-accent">
            <Icon name="search" className="size-5 text-[#6b7587]" />
            <input
              id="home-q"
              name="q"
              type="search"
              placeholder="Buscar producto o lote…"
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-[#6b7587]"
            />
            <HomeScan />
          </div>
        </form>
      </header>

      {error ? (
        <LoadError message="No pudimos cargar tus lotes." />
      ) : (
        <>
          {/* Accesos rápidos: iconos redondos, sin bloques pesados */}
          <nav aria-label="Accesos rápidos" className="tadu-rise mb-6 grid grid-cols-4 gap-2">
            {shortcuts.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="group flex flex-col items-center gap-1.5 rounded-2xl py-1 text-center focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span
                  className={`flex size-14 items-center justify-center rounded-full transition-transform group-active:scale-95 ${
                    s.primary
                      ? "bg-action text-white shadow-[0_6px_16px_rgb(10_138_71/0.3)]"
                      : "border border-border/70 bg-surface text-primary shadow-card"
                  }`}
                >
                  <Icon name={s.icon} className="size-6" />
                </span>
                <span className="text-[11px] leading-tight font-semibold text-text-primary">{s.label}</span>
              </Link>
            ))}
          </nav>

          {/* Indicadores */}
          <div className="mb-6 grid grid-cols-3 gap-3">
            {(
              [
                ["vigente", counts.vigente, "/products"],
                ["por_vencer", counts.por_vencer, "/products?estado=por_vencer"],
                ["vencido", counts.vencido, "/products?estado=vencido"],
              ] as const
            ).map(([status, value, href]) => (
              <Link
                key={status}
                href={href}
                className="tadu-rise rounded-card border border-border/70 bg-surface p-3.5 shadow-card transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className={`flex size-8 items-center justify-center rounded-full ${STATUS_UI[status].tone}`}>
                  <Icon name={STATUS_UI[status].icon} className="size-4" strokeWidth={2.4} />
                </span>
                <span className="mt-2 block text-2xl leading-none font-bold">{value}</span>
                <span className="mt-1 block text-xs font-medium text-text-secondary">
                  {status === "vigente" ? "Vigentes" : status === "por_vencer" ? "Por vencer" : "Vencidos"}
                </span>
              </Link>
            ))}
          </div>
          {/* Atención prioritaria */}
          <section aria-labelledby="priority-title">
            <SectionTitle
              aside={
                priority.length > 0 && (
                  <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-secondary">
                    {priority.length} {priority.length === 1 ? "lote" : "lotes"}
                  </span>
                )
              }
            >
              <span id="priority-title">
                <span className="text-orange">Atención</span> prioritaria
              </span>
            </SectionTitle>

            {priority.length === 0 ? (
              <Card className="p-5 text-center text-sm text-text-secondary">
                Cuando un lote esté por vencer o vencido, aparecerá aquí.
              </Card>
            ) : (
              <ul className="space-y-3">
                {priority.slice(0, 5).map((lot) => (
                  <li key={lot.id}>
                    <Link
                      href={`/products/${lot.product_id}`}
                      className="tadu-rise flex items-center gap-3 rounded-card border border-border/70 bg-surface p-3.5 shadow-card transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <ProductThumb
                        name={lot.product_name}
                        status={lot.status}
                        photoUrl={photos.has(lot.product_id) ? photoUrl(lot.product_id, photos.get(lot.product_id)!) : null}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold">{lot.product_name}</span>
                        <StatusBadge
                          status={lot.status}
                          label={expiryText(lot.days_to_expiry)}
                          className="mt-1"
                        />
                        <span
                          className={`mt-1 block text-sm ${
                            lot.status === "vencido" ? "font-semibold text-danger" : "text-text-secondary"
                          }`}
                        >
                          {formatQty(lot.current_quantity, lot.unit)}
                          {lot.status === "vencido" ? " por retirar" : ""}
                        </span>
                      </span>
                      <Icon name="chevron-right" className="size-5 text-text-secondary" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
