import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { unitLabel } from "@/lib/catalog/units";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { ProductForm } from "@/components/catalog/product-form";

export const metadata: Metadata = { title: "Productos · TADUKA" };

type ProductRow = {
  id: string;
  name: string;
  unit: string;
  is_active: boolean;
  categories: { name: string } | null;
  lots: { count: number }[];
};

export default function ProductsPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <Products />
      </Suspense>
    </AppShell>
  );
}

async function Products() {
  await connection();
  const { supabase, membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership?.stores) return <StoreRequired />;

  const storeId = membership.stores.id;
  const [categoriesResult, productsResult] = await Promise.all([
    supabase.from("categories").select("id, name").eq("store_id", storeId).order("name"),
    supabase
      .from("products")
      .select("id, name, unit, is_active, categories(name), lots(count)")
      .eq("store_id", storeId)
      .order("name"),
  ]);

  const categories = categoriesResult.data ?? [];
  const products = (productsResult.data ?? []) as unknown as ProductRow[];

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Catálogo de {membership.stores.name}. Cada producto podrá tener varios
          lotes, cada uno con su propia fecha de caducidad.
        </p>
      </div>

      {!categoriesResult.error && categories.length === 0 && (
        <p className="rounded-card bg-warning-soft px-4 py-3 text-sm text-warning">
          Aún no tienes categorías.{" "}
          <Link href="/categories" className="font-medium underline underline-offset-4">
            Crea una categoría
          </Link>{" "}
          para organizar tus productos.
        </p>
      )}

      <section className="rounded-card border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-4 text-base font-semibold">Nuevo producto</h2>
        <ProductForm categories={categories} />
      </section>

      <section aria-labelledby="products-list">
        <h2 id="products-list" className="mb-3 text-base font-semibold">
          Tus productos
        </h2>
        {productsResult.error ? (
          <LoadError message="No pudimos cargar los productos." />
        ) : products.length === 0 ? (
          <p className="rounded-card border border-dashed border-border bg-surface px-4 py-6 text-sm text-text-secondary">
            Aún no tienes productos. Agrega el primero con el formulario de arriba.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {products.map((p) => {
              const lotCount = p.lots[0]?.count ?? 0;
              return (
                <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{p.name}</p>
                    <p className="text-sm text-text-secondary">
                      {p.categories?.name ?? "Sin categoría"} · {unitLabel(p.unit)}
                    </p>
                  </div>
                  <div className="shrink-0 space-y-1 text-right text-sm">
                    <p className={lotCount === 0 ? "text-warning" : "text-text-secondary"}>
                      {lotCount === 0
                        ? "Sin lotes"
                        : `${lotCount} ${lotCount === 1 ? "lote" : "lotes"}`}
                    </p>
                    <Link
                      href={`/lots?product=${p.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {lotCount === 0 ? "Registrar lote" : "Ver lotes"}
                    </Link>
                    {!p.is_active && (
                      <p className="text-text-secondary">Inactivo</p>
                    )}
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
