import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { unitLabel } from "@/lib/catalog/units";
import { formatDate, formatQty } from "@/lib/format";
import { photoUrl } from "@/lib/catalog/photos";
import { isUuid } from "@/lib/db/pool";
import { listLots } from "@/lib/db/lots";
import { getPhotoVersions } from "@/lib/db/photos";
import { expiryText, withStock } from "@/lib/inventory/summary";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { EmptyState, LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { ScreenHeader } from "@/components/app/screen-header";
import { CountPanel } from "@/components/inventory/count-panel";
import { LinkButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { ProductThumb } from "@/components/ui/product-thumb";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Conteo físico · TADUKA" };

export default function CountPage({ params, searchParams }: PageProps<"/products/[id]/count">) {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <Count params={params} searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Count({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { id } = await params;
  const raw = await searchParams;
  const lotParam = typeof raw.lot === "string" ? raw.lot : "";

  const { membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership) return <StoreRequired />;
  const store = membership.store;
  const backHref = isUuid(id) ? `/products/${id}` : "/products";

  const missing = (
    <>
      <ScreenHeader title="Conteo físico" storeName={store.name} backHref={backHref} />
      <EmptyState
        icon="clipboard-check"
        title="No hay un lote para contar"
        description="El producto no existe, no pertenece a tu tienda o no tiene lotes con existencia."
        action={<LinkButton href="/products">Volver a productos</LinkButton>}
      />
    </>
  );
  if (!isUuid(id)) return missing;

  let lots: Awaited<ReturnType<typeof listLots>>;
  let photos: Map<string, number>;
  try {
    [lots, photos] = await Promise.all([
      listLots(store.id, { productId: id }),
      getPhotoVersions(store.id).catch(() => new Map<string, number>()),
    ]);
  } catch {
    return <LoadError message="No pudimos cargar el lote." />;
  }
  const candidates = withStock(lots);
  const lot = candidates.find((l) => l.id === lotParam) ?? candidates[0];
  if (!lot) return missing;

  return (
    <>
      <ScreenHeader title="Conteo físico" storeName={store.name} backHref={backHref} />

      {/* Producto y lote */}
      <section className="tadu-rise mb-4 flex items-center gap-3 rounded-card bg-surface-muted p-3.5">
        <ProductThumb
          name={lot.product_name}
          status={lot.status}
          size="lg"
          photoUrl={photos.has(id) ? photoUrl(id, photos.get(id)!) : null}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg leading-tight font-bold">{lot.product_name}</p>
          <p className="truncate text-sm text-text-secondary">
            Lote:{" "}
            <span className="font-mono font-semibold text-text-primary">
              {lot.supplier_lot_code ?? "sin código"}
            </span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={lot.status} label={expiryText(lot.days_to_expiry)} />
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-text-secondary">
              <Icon name="history" className="size-3.5" />
              Anterior: {formatQty(lot.current_quantity, lot.unit)}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">Caduca el {formatDate(lot.expiration_date)}</p>
        </div>
      </section>

      <CountPanel
        key={lot.id}
        unitLabel={unitLabel(lot.unit)}
        previous={Number(lot.current_quantity)}
        backHref={backHref}
      />
    </>
  );
}
