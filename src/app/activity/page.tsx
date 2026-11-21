import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { dayKey, dayLabel, formatQty, formatTime, todayInStoreTimezone } from "@/lib/format";
import { listEntries, listMovements } from "@/lib/db/lots";
import { toDate } from "@/lib/db/pool";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { EmptyState, LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { ScreenHeader } from "@/components/app/screen-header";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Actividad · TADUKA" };

type Kind = "entrada" | "conteo" | "ajuste" | "baja";

type Event = {
  id: string;
  kind: Kind;
  at: string;
  product: string;
  unit: string;
  lotCode: string | null;
  delta: number;
  reason: string | null;
};

const KIND_UI: Record<Kind, { title: string; icon: IconName; chip: string; tone: string }> = {
  entrada: { title: "Entrada de lote", icon: "package-plus", chip: "Entradas", tone: "bg-action-soft text-action" },
  conteo: { title: "Conteo físico", icon: "clipboard-check", chip: "Conteos", tone: "bg-primary-soft text-primary" },
  ajuste: { title: "Ajuste de inventario", icon: "sliders", chip: "Ajustes", tone: "bg-warning-soft text-warning" },
  baja: { title: "Baja declarada", icon: "trending-down", chip: "Bajas", tone: "bg-danger-soft text-danger" },
};
const TYPE_TO_KIND = { count: "conteo", adjustment: "ajuste", write_off: "baja" } as const;
const FILTERS: Kind[] = ["conteo", "entrada", "ajuste", "baja"];

export default function ActivityPage({ searchParams }: PageProps<"/activity">) {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <Activity searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Activity({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const raw = await searchParams;
  const tipo = FILTERS.find((k) => k === raw.tipo) ?? "";

  const { user, membership, storeError } = await getCurrentContext();
  const initial = (user.email ?? "?").slice(0, 1).toUpperCase();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership) return <StoreRequired />;
  const store = membership.store;

  const [movements, entries, loadError] = await Promise.all([listMovements(store.id), listEntries(store.id)]).then(
    ([m, e]) => [m, e, false] as const,
    () => [[], [], true] as const,
  );
  const events: Event[] = [
    ...movements.map((m): Event => ({
      id: `m-${m.id}`,
      kind: TYPE_TO_KIND[m.type],
      at: toDate(m.created_at).toISOString(),
      product: m.product_name,
      unit: m.unit,
      lotCode: m.supplier_lot_code,
      delta: Number(m.difference),
      reason: m.reason,
    })),
    ...entries.map((e): Event => ({
      id: `e-${e.id}`,
      kind: "entrada",
      at: toDate(e.created_at).toISOString(),
      product: e.product_name,
      unit: e.unit,
      lotCode: e.supplier_lot_code,
      delta: Number(e.initial_quantity),
      reason: null,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const visible = tipo ? events.filter((e) => e.kind === tipo) : events;
  const today = todayInStoreTimezone();
  const weekAgo = new Date(`${today}T00:00:00Z`);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);
  const weekCount = events.filter((e) => dayKey(e.at) >= weekAgo.toISOString().slice(0, 10)).length;

  const groups = new Map<string, Event[]>();
  for (const e of visible) {
    const k = dayKey(e.at);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }

  const chip = (active: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
      active
        ? "border-action bg-action text-white shadow-card"
        : "border-border bg-surface text-text-secondary hover:bg-surface-muted"
    }`;

  return (
    <>
      <ScreenHeader title="Actividad" storeName={store.name} initial={initial} />

      <Card className="tadu-rise mb-4 flex items-center gap-3 p-4">
        <span className="flex size-12 items-center justify-center rounded-full bg-action-soft text-action">
          <Icon name="history" className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold">Historial de actividad</p>
          <p className="text-sm text-text-secondary">
            {weekCount === 0
              ? "Sin eventos esta semana"
              : `${weekCount} ${weekCount === 1 ? "evento" : "eventos"} en los últimos 7 días`}
          </p>
        </div>
      </Card>

      <nav aria-label="Filtrar por tipo" className="tadu-scroll-x -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href="/activity" className={chip(!tipo)} aria-current={!tipo ? "true" : undefined}>
          Todas
        </Link>
        {FILTERS.map((k) => (
          <Link
            key={k}
            href={`/activity?tipo=${k}`}
            className={chip(tipo === k)}
            aria-current={tipo === k ? "true" : undefined}
          >
            <Icon name={KIND_UI[k].icon} className="size-4" />
            {KIND_UI[k].chip}
          </Link>
        ))}
      </nav>

      {loadError ? (
        <LoadError message="No pudimos cargar la actividad." />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="history"
          title={tipo ? "Sin movimientos de este tipo" : "Aún no hay actividad"}
          description={
            tipo
              ? "Prueba con otro filtro para ver más movimientos."
              : "Aquí verás las entradas de lotes y los movimientos de existencias a medida que ocurran."
          }
          action={
            tipo ? (
              <Link href="/activity" className={buttonClass("soft")}>
                Ver todas
              </Link>
            ) : (
              <Link href="/lots/new" className={buttonClass("primary")}>
                <Icon name="package-plus" className="size-4" />
                Registrar entrada
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([key, items]) => (
            <section key={key} aria-label={dayLabel(key, today)}>
              <h2 className="mb-2.5 flex items-center gap-2 text-xs font-bold tracking-wider text-text-secondary uppercase">
                <span className="size-1.5 rounded-full bg-action" />
                {dayLabel(key, today)}
              </h2>
              <ul className="space-y-2.5">
                {items.map((e) => {
                  const ui = KIND_UI[e.kind];
                  const positive = e.delta > 0;
                  return (
                    <li
                      key={e.id}
                      className="tadu-rise rounded-card border border-border/70 bg-surface p-3.5 shadow-card"
                    >
                      <div className="flex items-start gap-3">
                        <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${ui.tone}`}>
                          <Icon name={ui.icon} className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[15px] font-bold">{ui.title}</p>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                                e.delta === 0
                                  ? "bg-surface-muted text-text-secondary"
                                  : positive
                                    ? "bg-action-soft text-action"
                                    : "bg-danger-soft text-danger"
                              }`}
                            >
                              {e.delta === 0 ? "Sin cambio" : `${positive ? "+" : "−"}${formatQty(Math.abs(e.delta), e.unit)}`}
                            </span>
                          </div>
                          <p className="truncate text-sm text-text-secondary">
                            {e.product}
                            {e.lotCode && (
                              <>
                                {" · Lote "}
                                <span className="font-mono">{e.lotCode}</span>
                              </>
                            )}
                          </p>
                          {e.reason && <p className="mt-1 text-sm text-text-primary">“{e.reason}”</p>}
                          <p className="mt-1.5 flex items-center gap-1 text-xs text-text-secondary">
                            <Icon name="clock" className="size-3.5" />
                            {formatTime(e.at)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
