import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { formatDate, formatQty } from "@/lib/format";
import { listProducts, type ProductRow } from "@/lib/db/catalog";
import { listLots, type LotView } from "@/lib/db/lots";
import { countByStatus, expiryText } from "@/lib/inventory/summary";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { EmptyState, LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { ScreenHeader } from "@/components/app/screen-header";
import { buttonClass, LinkButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { SelectField } from "@/components/ui/select-field";
import { STATUS_UI, StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Lotes · TADUKA" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function LotsPage({ searchParams }: PageProps<"/lots">) {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <Lots searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Lots({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { product } = await searchParams;
  const productParam = typeof product === "string" && UUID.test(product) ? product : "";

  const { membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership) return <StoreRequired />;
  const store = membership.store;

  const [productsResult, lotsResult] = await Promise.all([
    listProducts(store.id).then(
      (data) => ({ data, error: false }),
      () => ({ data: [] as ProductRow[], error: true }),
    ),
    listLots(store.id, { productId: productParam || undefined, limit: 200 }).then(
      (lots) => ({ lots, error: false }),
      () => ({ lots: [] as LotView[], error: true }),
    ),
  ]);

  const products = productsResult.data;
  const lots = lotsResult.lots;
  const selectedProduct = products.find((p) => p.id === productParam);
  const counts = countByStatus(lots);

  return (
    <>
      <ScreenHeader
        title={selectedProduct ? selectedProduct.name : "Lotes"}
        storeName={store.name}
        backHref={selectedProduct ? `/products/${selectedProduct.id}` : "/products"}
      />

      <p className="tadu-rise mb-4 text-sm text-text-secondary">
        Cada lote tiene su propia caducidad y existencia. Se muestran primero los que vencen antes.
      </p>

      {/* Resumen de alertas (lotes con existencia) */}
      {!lotsResult.error && (counts.vencido > 0 || counts.por_vencer > 0) && (
        <div className="tadu-rise mb-4 flex flex-wrap gap-2" role="status">
          {counts.vencido > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full bg-danger-soft px-3.5 py-2 text-sm font-bold text-danger">
              <Icon name="x-circle" className="size-4" />
              {counts.vencido} {counts.vencido === 1 ? "vencido con existencia" : "vencidos con existencia"}
            </span>
          )}
          {counts.por_vencer > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full bg-orange-soft px-3.5 py-2 text-sm font-bold text-orange">
              <Icon name="alert-triangle" className="size-4" />
              {counts.por_vencer} por vencer (en {store.expiry_alert_days} {store.expiry_alert_days === 1 ? "día" : "días"} o menos)
            </span>
          )}
        </div>
      )}

      {/* Filtro por producto */}
      <form method="get" className="tadu-rise mb-5 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <SelectField id="product" label="Filtrar por producto" defaultValue={productParam}>
            <option value="">Todos los productos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        </div>
        <button type="submit" className={buttonClass("soft", "md", "h-12")}>
          Filtrar
        </button>
      </form>

      {lotsResult.error ? (
        <LoadError message="No pudimos cargar los lotes." />
      ) : lots.length === 0 ? (
        <EmptyState
          icon="package-plus"
          title={productParam ? "Este producto aún no tiene lotes" : "Aún no tienes lotes"}
          description="Registra una entrada para empezar a vigilar sus caducidades."
          action={
            <LinkButton href={productParam ? `/lots/new?product=${productParam}` : "/lots/new"}>
              <Icon name="package-plus" className="size-4" />
              Registrar lote
            </LinkButton>
          }
        />
      ) : (
        <ul className="space-y-3">
          {lots.map((l) => {
            const empty = Number(l.current_quantity) <= 0;
            return (
              <li
                key={l.id}
                className={`tadu-rise overflow-hidden rounded-card border border-border/70 bg-surface shadow-card ${empty ? "opacity-70" : ""}`}
              >
                <Link
                  href={`/products/${l.product_id}`}
                  className="flex focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span aria-hidden="true" className={`w-1.5 shrink-0 ${empty ? "bg-border" : STATUS_UI[l.status].solid}`} />
                  <span className="min-w-0 flex-1 space-y-1.5 p-3.5">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 truncate text-[15px] font-bold">{l.product_name}</span>
                      {empty ? (
                        <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-secondary">
                          Agotado
                        </span>
                      ) : (
                        <StatusBadge status={l.status} className="shrink-0" />
                      )}
                    </span>
                    <span className="block text-sm font-semibold">
                      {formatDate(l.expiration_date)}
                      <span className="font-normal text-text-secondary"> · {expiryText(l.days_to_expiry)}</span>
                    </span>
                    <span className="block text-sm text-text-secondary">
                      {empty
                        ? `Inició con ${formatQty(l.initial_quantity, l.unit)}`
                        : `Quedan ${formatQty(l.current_quantity, l.unit)} de ${formatQty(l.initial_quantity, l.unit)}`}
                    </span>
                    <span className="block text-xs text-text-secondary">
                      Entrada {formatDate(l.entry_date)}
                      {l.supplier_lot_code && (
                        <>
                          {" · Lote "}
                          <span className="font-mono">{l.supplier_lot_code}</span>
                        </>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-28 z-20 flex justify-center md:bottom-8 md:left-64">
        <Link
          href={productParam ? `/lots/new?product=${productParam}` : "/lots/new"}
          className={`pointer-events-auto ${buttonClass("primary", "lg", "shadow-float")}`}
        >
          <Icon name="package-plus" className="size-5" />
          Registrar lote nuevo
        </Link>
      </div>
    </>
  );
}
