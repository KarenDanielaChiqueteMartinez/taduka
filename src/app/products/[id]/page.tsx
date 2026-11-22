import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { unitLabel } from "@/lib/catalog/units";
import { formatDate, formatQty, formatQuantity } from "@/lib/format";
import { photoUrl } from "@/lib/catalog/photos";
import { getProduct } from "@/lib/db/catalog";
import { isUuid } from "@/lib/db/pool";
import { listLots, type LotView } from "@/lib/db/lots";
import { getPhotoVersions } from "@/lib/db/photos";
import { countByStatus, expiryText, summarizeByProduct, withStock } from "@/lib/inventory/summary";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { EmptyState, LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { ScreenHeader } from "@/components/app/screen-header";
import { ProductPhotoEditor } from "@/components/catalog/product-photo-editor";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { STATUS_UI, StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Detalle de producto · TADUKA" };


export default function ProductDetailPage({ params }: PageProps<"/products/[id]">) {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <ProductDetail params={params} />
      </Suspense>
    </AppShell>
  );
}

async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const { membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership) return <StoreRequired />;
  const store = membership.store;

  const notFound = (
    <>
      <ScreenHeader title="Detalle de producto" storeName={store.name} backHref="/products" />
      <EmptyState
        icon="search"
        title="Producto no encontrado"
        description="No existe o no pertenece a tu tienda."
        action={<LinkButton href="/products">Volver a productos</LinkButton>}
      />
    </>
  );
  if (!isUuid(id)) return notFound;

  const [product, lotsResult, photos] = await Promise.all([
    getProduct(store.id, id).catch(() => null),
    listLots(store.id, { productId: id }).then(
      (rows) => ({ lots: rows, error: false }),
      () => ({ lots: [] as LotView[], error: true }),
    ),
    getPhotoVersions(store.id).catch(() => new Map<string, number>()),
  ]);
  if (!product) return notFound;

  const lots = lotsResult.lots;
  const summary = summarizeByProduct(lots).get(id);
  const counts = countByStatus(lots);
  const countLot = withStock(lots)[0]; // el que vence primero
  const worst = summary?.worst ?? null;
  const next = summary?.nextLot ?? null;
  const details: [string, string][] = [];
  if (product.barcode) details.push(["Código de barras", product.barcode]);
  if (product.brand) details.push(["Marca o fabricante", product.brand]);
  if (product.supplier) details.push(["Proveedor", product.supplier]);
  if (product.location) details.push(["Ubicación", product.location]);

  return (
    <>
      <ScreenHeader
        title="Detalle de producto"
        storeName={store.name}
        backHref="/products"
        right={
          <Link
            href={`/products/${id}/edit`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-action-soft px-4 text-sm font-semibold text-action transition-colors hover:bg-[#d3eddc] focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="pencil" className="size-4" />
            Editar
          </Link>
        }
      />

      {/* Ficha */}
      <Card className="tadu-rise mb-4 p-4">
        <div className="flex items-center gap-4">
          <ProductPhotoEditor
            productId={product.id}
            name={product.name}
            status={worst}
            photoUrl={photos.has(id) ? photoUrl(id, photos.get(id)!) : null}
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl leading-tight font-bold break-words">{product.name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-text-secondary">
              <Icon name="tag" className="size-3.5" />
              {product.category_name ?? "Sin categoría"} · {unitLabel(product.unit)}
            </p>
            {!product.is_active && (
              <span className="mt-1.5 inline-block rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-text-secondary">
                Inactivo
              </span>
            )}
          </div>
        </div>
        {product.description && (
          <p className="mt-4 text-sm leading-relaxed break-words text-text-secondary">{product.description}</p>
        )}
        {details.length > 0 && (
          <dl className="mt-4 divide-y divide-border rounded-control border border-border">
            {details.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5 text-sm">
                <dt className="shrink-0 font-semibold">{label}</dt>
                <dd className="min-w-0 text-right break-words text-text-secondary">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {worst && next ? (
          <div className={`mt-4 flex items-center gap-3 rounded-control px-3.5 py-3 ${STATUS_UI[worst].tone}`}>
            <Icon name={STATUS_UI[worst].icon} className="size-5" strokeWidth={2.4} />
            <span className="flex-1 text-sm font-bold uppercase">{expiryText(next.days_to_expiry)}</span>
            <span className="text-sm font-semibold">{formatDate(next.expiration_date)}</span>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3 rounded-control bg-surface-muted px-3.5 py-3 text-text-secondary">
            <Icon name="info" className="size-5" />
            <span className="text-sm font-semibold">
              {lots.length === 0 ? "Sin lotes registrados" : "Sin existencia en sus lotes"}
            </span>
          </div>
        )}
      </Card>

      {/* Existencias */}
      <Card className="tadu-rise mb-4 p-4">
        <p className="text-xs font-semibold tracking-wider text-text-secondary uppercase">Existencia total</p>
        <p className="mt-1 text-4xl leading-none font-bold tracking-tight">
          {formatQuantity(summary?.totalQuantity ?? 0)}
          <span className="ml-2 text-base font-semibold text-text-secondary">
            {unitLabel(product.unit)}
          </span>
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(["vigente", "por_vencer", "vencido"] as const).map((s) => (
            <div key={s} className={`rounded-control px-3 py-2.5 ${STATUS_UI[s].tone}`}>
              <span className="block text-xl leading-none font-bold">{counts[s]}</span>
              <span className="mt-1 block text-xs font-semibold">
                {s === "vigente" ? "Vigentes" : s === "por_vencer" ? "Por vencer" : "Vencidos"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-text-secondary">Lotes con existencia por estado.</p>
      </Card>

      {/* Acciones */}
      <div className="mb-6 space-y-2.5">
        {countLot ? (
          <LinkButton href={`/products/${id}/count?lot=${countLot.id}`} size="lg" className="w-full">
            <Icon name="clipboard-check" className="size-5" />
            Contar unidades
          </LinkButton>
        ) : (
          <span className={buttonClass("secondary", "lg", "w-full opacity-60")} aria-disabled="true">
            <Icon name="clipboard-check" className="size-5" />
            Contar unidades
          </span>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Link href={`/lots/new?product=${id}`} className={buttonClass("secondary")}>
            <Icon name="package-plus" className="size-4" />
            Otro lote
          </Link>
          <Link href="/activity" className={buttonClass("soft")}>
            <Icon name="history" className="size-4" />
            Movimientos
          </Link>
        </div>
      </div>

      {/* Lotes */}
      <section aria-labelledby="lots-title">
        <SectionTitle
          aside={<span className="text-xs font-semibold text-text-secondary">Primero los que vencen antes</span>}
        >
          <span id="lots-title">Lotes</span>
        </SectionTitle>
        {lotsResult.error ? (
          <LoadError message="No pudimos cargar los lotes." />
        ) : lots.length === 0 ? (
          <EmptyState
            icon="package-plus"
            title="Aún no hay lotes"
            description="Registra el primer lote para controlar su caducidad."
            action={<LinkButton href={`/lots/new?product=${id}`}>Registrar lote</LinkButton>}
          />
        ) : (
          <ul className="space-y-3">
            {lots.map((lot) => {
              const empty = Number(lot.current_quantity) <= 0;
              return (
                <li
                  key={lot.id}
                  className={`tadu-rise overflow-hidden rounded-card border border-border/70 bg-surface shadow-card ${empty ? "opacity-70" : ""}`}
                >
                  <div className="flex">
                    <span aria-hidden="true" className={`w-1.5 shrink-0 ${empty ? "bg-border" : STATUS_UI[lot.status].solid}`} />
                    <div className="min-w-0 flex-1 space-y-2 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg leading-tight font-bold">{formatDate(lot.expiration_date)}</p>
                          <p className="text-sm text-text-secondary">{expiryText(lot.days_to_expiry)}</p>
                        </div>
                        {empty ? (
                          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-secondary">
                            Agotado
                          </span>
                        ) : (
                          <StatusBadge status={lot.status} />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-semibold">
                          {empty
                            ? `Inició con ${formatQty(lot.initial_quantity, lot.unit)}`
                            : `Quedan ${formatQty(lot.current_quantity, lot.unit)} de ${formatQty(lot.initial_quantity, lot.unit)}`}
                        </span>
                        {!empty && (
                          <Link
                            href={`/products/${id}/count?lot=${lot.id}`}
                            className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary-soft px-3 text-xs font-bold text-primary focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            <Icon name="clipboard-check" className="size-3.5" />
                            Contar
                          </Link>
                        )}
                      </div>
                      <p className="text-xs text-text-secondary">
                        Entrada {formatDate(lot.entry_date)}
                        {lot.supplier_lot_code && (
                          <>
                            {" · "}Lote <span className="font-mono">{lot.supplier_lot_code}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
