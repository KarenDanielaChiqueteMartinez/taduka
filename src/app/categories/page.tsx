import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { listCategories, type CategoryRow } from "@/lib/db/catalog";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { EmptyState, LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { ScreenHeader } from "@/components/app/screen-header";
import { CategoryForm } from "@/components/catalog/category-form";
import { Card, SectionTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

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
  const { membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership) return <StoreRequired />;

  let categories: CategoryRow[] = [];
  let error = false;
  try {
    categories = await listCategories(membership.store.id);
  } catch {
    error = true;
  }

  return (
    <>
      <ScreenHeader title="Categorías" storeName={membership.store.name} backHref="/more" />

      <Card className="tadu-rise mb-6 p-5">
        <SectionTitle>Nueva categoría</SectionTitle>
        <CategoryForm />
      </Card>

      <section aria-labelledby="categories-list">
        <SectionTitle>
          <span id="categories-list">Tus categorías</span>
        </SectionTitle>
        {error ? (
          <LoadError message="No pudimos cargar las categorías." />
        ) : categories.length === 0 ? (
          <EmptyState
            icon="tag"
            title="Aún no tienes categorías"
            description="Crea la primera con el formulario de arriba para organizar tus productos."
          />
        ) : (
          <ul className="space-y-2.5">
            {categories.map((c) => (
              <li
                key={c.id}
                className="tadu-rise flex items-center gap-3 rounded-card border border-border/70 bg-surface p-3.5 shadow-card"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon name="tag" className="size-5" />
                </span>
                <span className="font-semibold">{c.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
