import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { unitLabel } from "@/lib/catalog/units";
import { todayInStoreTimezone } from "@/lib/format";
import { listProducts, type ProductRow } from "@/lib/db/catalog";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { EmptyState, LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { ScreenHeader } from "@/components/app/screen-header";
import { NoteScanner } from "@/components/lots/note-scanner";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Fotografiar nota · TADUKA" };

export default function PhotoLotPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <PhotoLot />
      </Suspense>
    </AppShell>
  );
}

async function PhotoLot() {
  await connection();
  const { membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership) return <StoreRequired />;
  const store = membership.store;

  // Solo productos activos de la tienda actual.
  let active: ProductRow[] = [];
  let error = false;
  try {
    active = (await listProducts(store.id)).filter((p) => p.is_active);
  } catch {
    error = true;
  }

  if (error || active.length === 0) {
    return (
      <>
        <ScreenHeader title="Fotografiar nota" storeName={store.name} backHref="/dashboard" />
        {error ? (
          <LoadError message="No pudimos cargar tus productos." />
        ) : (
          <EmptyState
            icon="archive"
            title="Primero agrega un producto"
            description="Para registrar lotes desde una nota necesitas al menos un producto activo en tu catálogo."
            action={<LinkButton href="/products/new">Crear un producto</LinkButton>}
          />
        )}
      </>
    );
  }

  return (
    <NoteScanner
      storeName={store.name}
      products={active.map((p) => ({ id: p.id, name: p.name, unitLabel: unitLabel(p.unit) }))}
      today={todayInStoreTimezone()}
    />
  );
}
