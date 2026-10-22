import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { CategoryForm } from "@/components/catalog/category-form";

export const metadata: Metadata = { title: "Categorías · TADUKA" };

export default function CategoriesPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <Categories />
      </Suspense>
    </AppShell>
  );
}

async function Categories() {
  await connection();
  const { supabase, membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership?.stores) return <StoreRequired />;

  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("store_id", membership.stores.id)
    .order("name");

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Agrupa los productos de {membership.stores.name}.
        </p>
      </div>

      <section className="rounded-card border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-4 text-base font-semibold">Nueva categoría</h2>
        <CategoryForm />
      </section>

      <section aria-labelledby="categories-list">
        <h2 id="categories-list" className="mb-3 text-base font-semibold">
          Tus categorías
        </h2>
        {error ? (
          <LoadError message="No pudimos cargar las categorías." />
        ) : categories.length === 0 ? (
          <p className="rounded-card border border-dashed border-border bg-surface px-4 py-6 text-sm text-text-secondary">
            Aún no tienes categorías. Agrega la primera con el formulario de arriba.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {categories.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm font-medium">
                {c.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
