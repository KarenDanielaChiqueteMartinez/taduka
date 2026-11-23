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
import { LotForm } from "@/components/lots/lot-form";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Registrar lote · TADUKA" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function NewLotPage({ searchParams }: PageProps<"/lots/new">) {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <NewLot searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function NewLot({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const raw = await searchParams;
  const productParam = typeof raw.product === "string" && UUID.test(raw.product) ? raw.product : "";

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

  // El formulario trae su propia cabecera fija; las demás pantallas usan la de siempre.
  if (error || active.length === 0) {
    return (
      <>
        <ScreenHeader title="Registrar lote" storeName={store.name} backHref="/lots" />
        {error ? (
          <LoadError message="No pudimos cargar tus productos." />
        ) : (
          <EmptyState
            icon="archive"
            title="Primero agrega un producto"
            description="Para registrar un lote necesitas al menos un producto activo en tu catálogo."
            action={<LinkButton href="/products/new">Crear un producto</LinkButton>}
          />
        )}
      </>
    );
  }

  return (
    <LotForm
      products={active.map((p) => ({ id: p.id, name: p.name, unitLabel: unitLabel(p.unit) }))}
      today={todayInStoreTimezone()}
      defaultProductId={productParam || undefined}
    />
  );
}
