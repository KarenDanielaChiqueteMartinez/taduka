import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { unitLabel } from "@/lib/catalog/units";
import { formatDate, formatQty } from "@/lib/format";
import { photoUrl } from "@/lib/catalog/photos";
import { listProducts, type ProductRow } from "@/lib/db/catalog";
import { listLots, type LotView } from "@/lib/db/lots";
import { getPhotoVersions } from "@/lib/db/photos";
import {
  expiryText,
  summarizeByProduct,
  type LotStatus,
  type ProductSummary,
} from "@/lib/inventory/summary";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { EmptyState, LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { ScreenHeader } from "@/components/app/screen-header";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { ProductThumb } from "@/components/ui/product-thumb";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Productos · TADUKA" };

const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default function ProductsPage({ searchParams }: PageProps<"/products">) {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <Products searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

const RANK: Record<LotStatus, number> = { vencido: 0, por_vencer: 1, vigente: 2 };

async function Products({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const raw = await searchParams;
  const filters = { q: first(raw.q).trim().slice(0, 80) };

  const { membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership) return <StoreRequired />;

  const store = membership.store;
  const [productsResult, lotsResult, photos] = await Promise.all([
    listProducts(store.id).then(
      (data) => ({ data, error: false }),
      () => ({ data: [] as ProductRow[], error: true }),
    ),
    listLots(store.id).then(
      (lots) => ({ lots, error: false }),
      () => ({ lots: [] as LotView[], error: true }),
    ),
    getPhotoVersions(store.id).catch(() => new Map<string, number>()),
  ]);

  const products = productsResult.data;
  const summaries = summarizeByProduct(lotsResult.lots);

  const enriched = products.map((p) => ({ p, s: summaries.get(p.id) as ProductSummary | undefined }));

  const q = filters.q.toLowerCase();
  const visible = enriched
    .filter(({ p, s }) => {
      if (q) {
        const hay = [p.name, p.category_name ?? "", p.barcode ?? "", ...(s?.codes ?? [])]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    // Primero lo que requiere atención y vence antes; luego vigentes; al final productos sin existencia.
    .sort((a, b) => {
      const ra = a.s?.worst ? RANK[a.s.worst] : 3;
      const rb = b.s?.worst ? RANK[b.s.worst] : 3;
      if (ra !== rb) return ra - rb;
      const ea = a.s?.nextLot?.expiration_date ?? "9999";
      const eb = b.s?.nextLot?.expiration_date ?? "9999";
      return ea.localeCompare(eb) || a.p.name.localeCompare(b.p.name);
    });

  return (
    <>
      <ScreenHeader
        title="Inventario"
        storeName={store.name}
        right={
          <Link
            href="/products/new"
            aria-label="Nuevo producto"
            className="flex size-11 items-center justify-center rounded-full bg-action-soft text-action transition-colors hover:bg-[#d3eddc] focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="plus" className="size-5" strokeWidth={2.6} />
          </Link>
        }
      />

      {/* Búsqueda */}
      <form action="/products" method="get" role="search" className="tadu-rise mb-3">
        <label htmlFor="q" className="sr-only">
          Buscar producto
        </label>
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-surface pr-1.5 pl-4 shadow-card focus-within:border-action focus-within:outline-2 focus-within:outline-action/30">
          <Icon name="search" className="size-5 text-text-secondary" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Buscar producto"
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-text-secondary/80"
          />
          <button
            type="submit"
            className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary transition-colors hover:bg-[#cfe7dc] focus-visible:outline-2 focus-visible:outline-primary"
            aria-label="Buscar"
          >
            <Icon name="arrow-right" className="size-4" strokeWidth={2.4} />
          </button>
        </div>
      </form>

      <div className="mb-3 flex items-center justify-end gap-3 text-xs text-text-secondary">
        <span className="font-semibold">
          {visible.length} {visible.length === 1 ? "artículo" : "artículos"}
        </span>
      </div>

      {productsResult.error ? (
        <LoadError message="No pudimos cargar los productos." />
      ) : products.length === 0 ? (
        <EmptyState
          icon="archive"
          title="Aún no tienes productos"
          description="Agrega tu primer producto y después registra sus lotes con su caducidad."
          action={
            <LinkButton href="/products/new">
              <Icon name="plus" className="size-4" strokeWidth={2.6} />
              Nuevo producto
            </LinkButton>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="search"
          title="Sin resultados"
          description="Ningún producto coincide con la búsqueda."
          action={
            <Link href="/products" className={buttonClass("soft")}>
              Quitar búsqueda
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map(({ p, s }) => (
            <li key={p.id}>
              <Link
                href={`/products/${p.id}`}
                className={`tadu-rise flex items-center gap-3 rounded-card border border-border/70 bg-surface p-3.5 shadow-card transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary ${p.is_active ? "" : "opacity-70"}`}
              >
                <ProductThumb
                  name={p.name}
                  status={s?.worst ?? null}
                  photoUrl={photos.has(p.id) ? photoUrl(p.id, photos.get(p.id)!) : null}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{p.name}</span>
                  <span className="block truncate text-xs text-text-secondary">
                    {p.category_name ?? "Sin categoría"} · {unitLabel(p.unit)}
                    {!p.is_active && " · Inactivo"}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {s?.worst && s.nextLot ? (
                      <>
                        <StatusBadge status={s.worst} label={expiryText(s.nextLot.days_to_expiry)} />
                        <span className="text-xs text-text-secondary">
                          {formatDate(s.nextLot.expiration_date)}
                          {s.lotCount > 1 ? ` · ${s.lotCount} lotes` : ""}
                        </span>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-secondary">
                        <Icon name="info" className="size-3.5" />
                        {p.lot_count === 0 ? "Sin lotes" : "Sin existencia"}
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`text-sm font-bold ${s?.worst === "vencido" ? "text-danger" : ""}`}>
                    {s ? formatQty(s.totalQuantity, p.unit) : "—"}
                  </span>
                  <Icon name="chevron-right" className="size-5 text-text-secondary" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
