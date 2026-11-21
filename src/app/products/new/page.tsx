import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { listCategories } from "@/lib/db/catalog";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { ScreenHeader } from "@/components/app/screen-header";
import { ProductForm } from "@/components/catalog/product-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Nuevo producto · TADUKA" };

export default function NewProductPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <NewProduct />
      </Suspense>
    </AppShell>
  );
}

async function NewProduct() {
  await connection();
  const { membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership) return <StoreRequired />;

  const categories = await listCategories(membership.store.id).catch(() => []);

  return (
    <>
      <ScreenHeader title="Nuevo producto" storeName={membership.store.name} backHref="/products" />
      <Card className="tadu-rise p-5">
        <ProductForm categories={categories} />
      </Card>
    </>
  );
}
