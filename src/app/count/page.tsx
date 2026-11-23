import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { photoUrl } from "@/lib/catalog/photos";
import { formatDate, formatQty } from "@/lib/format";
import { listLots } from "@/lib/db/lots";
import { getPhotoVersions } from "@/lib/db/photos";
import { expiryText, withStock } from "@/lib/inventory/summary";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { EmptyState, LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { ScreenHeader } from "@/components/app/screen-header";
import { Icon } from "@/components/ui/icons";
import { ProductThumb } from "@/components/ui/product-thumb";
import { STATUS_UI, StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Contar unidades · TADUKA" };

export default function CountListPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <CountList />
      </Suspense>
    </AppShell>
  );
}

// Menú de todos los lotes con existencia: al elegir uno se abre su conteo físico.
async function CountList() {
  await connection();
  const { membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership) return <StoreRequired />;
  const store = membership.store;

  let lots: Awaited<ReturnType<typeof listLots>>;
  let photos: Map<string, number>;
  try {
    [lots, photos] = await Promise.all([
      listLots(store.id, { limit: 200 }),
      getPhotoVersions(store.id).catch(() => new Map<string, number>()),
    ]);
  } catch {
    return (
      <>
        <ScreenHeader title="Contar unidades" storeName={store.name} backHref="/dashboard" />
        <LoadError message="No pudimos cargar los lotes." />
      </>
    );
  }
  const candidates = withStock(lots);

  return (
    <>
      <ScreenHeader title="Contar unidades" storeName={store.name} backHref="/dashboard" />

      {candidates.length === 0 ? (
        <EmptyState
          icon="clipboard-check"
          title="No hay lotes para contar"
          description="Cuando tengas lotes con existencia, aparecerán aquí para contarlos."
        />
      ) : (
        <ul className="space-y-3">
          {candidates.map((l) => (
            <li key={l.id} className="tadu-rise overflow-hidden rounded-card border border-border/70 bg-surface shadow-card">
              <Link
                href={`/products/${l.product_id}/count?lot=${l.id}&from=list`}
                className="flex focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span aria-hidden="true" className={`w-1.5 shrink-0 ${STATUS_UI[l.status].solid}`} />
                <span className="flex min-w-0 flex-1 items-center gap-3 p-3.5">
                  <ProductThumb
                    name={l.product_name}
                    status={l.status}
                    size="md"
                    photoUrl={photos.has(l.product_id) ? photoUrl(l.product_id, photos.get(l.product_id)!) : null}
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-[15px] font-bold">{l.product_name}</span>
                      <StatusBadge status={l.status} className="shrink-0" />
                    </span>
                    <span className="block text-sm text-text-secondary">
                      {formatDate(l.expiration_date)} · {expiryText(l.days_to_expiry)}
                    </span>
                    <span className="block text-sm font-semibold">
                      Existencia: {formatQty(l.current_quantity, l.unit)}
                    </span>
                    {l.supplier_lot_code && (
                      <span className="block text-xs text-text-secondary">
                        Lote <span className="font-mono">{l.supplier_lot_code}</span>
                      </span>
                    )}
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
