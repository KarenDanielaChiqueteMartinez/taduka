import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { unitLabel } from "@/lib/catalog/units";
import { formatDate, formatQuantity, todayInStoreTimezone } from "@/lib/format";
import { getCurrentContext } from "@/lib/stores/context";
import { AppShell } from "@/components/app/app-shell";
import { LoadError, LoadingState, StoreRequired } from "@/components/app/page-states";
import { LotForm } from "@/components/lots/lot-form";
import { SelectField } from "@/components/ui/select-field";

export const metadata: Metadata = { title: "Lotes · TADUKA" };

type LotRow = {
  id: string;
  product_id: string;
  product_name: string;
  unit: string;
  supplier_lot_code: string | null;
  entry_date: string;
  expiration_date: string;
  initial_quantity: number;
  current_quantity: number;
  days_to_expiry: number;
  status: "vencido" | "por_vencer" | "vigente";
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_STYLES: Record<LotRow["status"], { label: string; className: string }> = {
  vencido: { label: "Vencido", className: "bg-danger-soft text-danger" },
  por_vencer: { label: "Por vencer", className: "bg-warning-soft text-warning" },
  vigente: { label: "Vigente", className: "bg-primary-soft text-primary" },
};

function expiryText(days: number) {
  if (days < 0) return `Venció hace ${-days} ${days === -1 ? "día" : "días"}`;
  if (days === 0) return "Caduca hoy";
  return `Caduca en ${days} ${days === 1 ? "día" : "días"}`;
}

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
  const productParam = typeof product === "string" && UUID_PATTERN.test(product) ? product : "";

  const { supabase, membership, storeError } = await getCurrentContext();
  if (storeError) return <LoadError message="No pudimos cargar tu tienda." />;
  if (!membership?.stores) return <StoreRequired />;

  const store = membership.stores;
  let lotsQuery = supabase
    .from("lots_with_status")
    .select(
      "id, product_id, product_name, unit, supplier_lot_code, entry_date, expiration_date, initial_quantity, current_quantity, days_to_expiry, status",
    )
    .eq("store_id", store.id)
    .order("expiration_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);
  if (productParam) lotsQuery = lotsQuery.eq("product_id", productParam);

  const [productsResult, lotsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit, is_active")
      .eq("store_id", store.id)
      .order("name"),
    lotsQuery,
  ]);

  const products = productsResult.data ?? [];
  const activeProducts = products.filter((p) => p.is_active);
  const lots = (lotsResult.data ?? []) as unknown as LotRow[];
  const selectedProduct = products.find((p) => p.id === productParam);

  // Alertas sobre lotes con existencia (los agotados no generan pérdida).
  const withStock = lots.filter((l) => l.current_quantity > 0);
  const expired = withStock.filter((l) => l.status === "vencido").length;
  const expiring = withStock.filter((l) => l.status === "por_vencer").length;

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lotes</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Cada lote tiene su propia caducidad y existencia. Se muestran primero los
          que vencen antes.
        </p>
      </div>

      <section className="rounded-card border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-4 text-base font-semibold">Registrar lote</h2>
        {productsResult.error ? (
          <LoadError message="No pudimos cargar tus productos." />
        ) : activeProducts.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Para registrar un lote necesitas al menos un producto activo.{" "}
            <Link href="/products" className="font-medium text-primary underline underline-offset-4">
              Crear un producto
            </Link>
          </p>
        ) : (
          <LotForm
            products={activeProducts.map((p) => ({
              id: p.id,
              label: `${p.name} · ${unitLabel(p.unit)}`,
            }))}
            today={todayInStoreTimezone()}
            defaultProductId={productParam || undefined}
          />
        )}
      </section>

      <section aria-labelledby="lots-list" className="space-y-3">
        <h2 id="lots-list" className="text-base font-semibold">
          {selectedProduct ? `Lotes de ${selectedProduct.name}` : "Lotes de tu tienda"}
        </h2>

        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <SelectField id="product" label="Filtrar por producto" defaultValue={productParam}>
              <option value="">Todos los productos</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Filtrar
          </button>
          {productParam && (
            <Link
              href="/lots"
              className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Quitar filtro
            </Link>
          )}
        </form>

        {!lotsResult.error && (expired > 0 || expiring > 0) && (
          <div className="flex flex-wrap gap-2 text-sm" role="status">
            {expired > 0 && (
              <p className="rounded-control bg-danger-soft px-3 py-2 font-medium text-danger">
                {expired} {expired === 1 ? "lote vencido con existencia" : "lotes vencidos con existencia"}
              </p>
            )}
            {expiring > 0 && (
              <p className="rounded-control bg-warning-soft px-3 py-2 font-medium text-warning">
                {expiring} {expiring === 1 ? "lote por vencer" : "lotes por vencer"} (en{" "}
                {store.expiry_alert_days} {store.expiry_alert_days === 1 ? "día" : "días"} o menos)
              </p>
            )}
          </div>
        )}

        {lotsResult.error ? (
          <LoadError message="No pudimos cargar los lotes." />
        ) : lots.length === 0 ? (
          <p className="rounded-card border border-dashed border-border bg-surface px-4 py-6 text-sm text-text-secondary">
            {productParam
              ? "Este producto aún no tiene lotes."
              : "Aún no tienes lotes. Registra el primero con el formulario de arriba."}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {lots.map((l) => {
              const status = STATUS_STYLES[l.status];
              return (
                <li key={l.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-medium break-words">{l.product_name}</p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <p className="text-sm font-medium">
                    {formatDate(l.expiration_date)}
                    <span className="font-normal text-text-secondary">
                      {" "}
                      · {expiryText(l.days_to_expiry)}
                    </span>
                  </p>
                  <p className="text-sm text-text-secondary">
                    {l.current_quantity > 0
                      ? `Quedan ${formatQuantity(l.current_quantity)} de ${formatQuantity(l.initial_quantity)} ${unitLabel(l.unit)}`
                      : `Agotado (inició con ${formatQuantity(l.initial_quantity)} ${unitLabel(l.unit)})`}
                  </p>
                  <p className="text-sm text-text-secondary">
                    Entrada {formatDate(l.entry_date)}
                    {l.supplier_lot_code && (
                      <>
                        {" "}
                        · Lote proveedor <span className="font-mono">{l.supplier_lot_code}</span>
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
