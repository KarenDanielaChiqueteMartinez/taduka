import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getProduct, listCategories } from "@/lib/db/catalog";
import { photoUrl } from "@/lib/catalog/photos";
import { getPhotoVersions } from "@/lib/db/photos";
import { isUuid } from "@/lib/db/pool";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { EmptyState, LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { ProductForm } from "@/components/catalog/product-form";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Editar producto · TADUKA" };

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <EditProduct params={params} />
      </Suspense>
    </AppShell>
  );
}

async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const { membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership) return <StoreRequired />;

  const [product, categories, photos] = await Promise.all([
    isUuid(id) ? getProduct(membership.store.id, id).catch(() => null) : null,
    listCategories(membership.store.id).catch(() => []),
    getPhotoVersions(membership.store.id).catch(() => new Map<string, number>()),
  ]);

  if (!product) {
    return (
      <EmptyState
        icon="search"
        title="Producto no encontrado"
        description="No existe o no pertenece a tu tienda."
        action={<LinkButton href="/products">Volver a productos</LinkButton>}
      />
    );
  }

  return (
    <div className="tadu-rise">
      <ProductForm
        categories={categories}
        product={product}
        photoUrl={photos.has(id) ? photoUrl(id, photos.get(id)!) : null}
      />
    </div>
  );
}
