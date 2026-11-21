"use client";

import { useActionState, useRef, useState } from "react";
import { createLot, type LotFormState } from "@/lib/lots/actions";
import { formatDate } from "@/lib/format";
import { buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { ProductThumb } from "@/components/ui/product-thumb";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";

type Product = { id: string; name: string; unitLabel: string };

type Props = {
  products: Product[];
  today: string;
  alertDays: number;
  defaultProductId?: string;
};

type View = { productId: string; quantity: string; entryDate: string; expirationDate: string };

const QUICK_DATES = [
  { label: "Hoy", days: 0 },
  { label: "Mañana", days: 1 },
  { label: "3 días", days: 3 },
  { label: "7 días", days: 7 },
  { label: "15 días", days: 15 },
  { label: "30 días", days: 30 },
];

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const card = "tadu-rise rounded-card border border-border/70 bg-surface p-4 shadow-card";
const cardTitle = "mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-text-secondary uppercase";

// Captura guiada del lote. Los nombres de campo (productId, quantity, supplierLotCode,
// entryDate, expirationDate) y la acción createLot no cambian; los controles solo escriben
// en los mismos campos del formulario.
export function LotForm({ products, today, alertDays, defaultProductId }: Props) {
  const [state, action] = useActionState<LotFormState, FormData>(createLot, {});
  const formRef = useRef<HTMLFormElement>(null);
  const v = state.values;

  const read = (form: HTMLFormElement): View => {
    const data = new FormData(form);
    return {
      productId: String(data.get("productId") ?? ""),
      quantity: String(data.get("quantity") ?? ""),
      entryDate: String(data.get("entryDate") ?? ""),
      expirationDate: String(data.get("expirationDate") ?? ""),
    };
  };

  const [view, setView] = useState<View>({
    productId: v?.productId ?? defaultProductId ?? "",
    quantity: v?.quantity ?? "",
    entryDate: v?.entryDate ?? today,
    expirationDate: v?.expirationDate ?? "",
  });

  const setField = (name: keyof View, value: string) => {
    const input = formRef.current?.elements.namedItem(name) as HTMLInputElement | null;
    if (!input) return;
    input.value = value;
    setView((current) => ({ ...current, [name]: value }));
  };

  const step = (delta: number) => {
    const current = Number(view.quantity.replace(",", "."));
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.max(0, Math.round((base + delta) * 1000) / 1000);
    setField("quantity", next === 0 ? "" : String(next));
  };

  const product = products.find((p) => p.id === view.productId);
  const qty = Number(view.quantity.replace(",", "."));
  const hasExp = /^\d{4}-\d{2}-\d{2}$/.test(view.expirationDate);
  const daysLeft = hasExp ? daysBetween(today, view.expirationDate) : null;
  const short = daysLeft !== null && daysLeft <= alertDays;

  return (
    <form
      ref={formRef}
      action={action}
      noValidate
      onChange={(e) => setView(read(e.currentTarget))}
      onReset={(e) => {
        const form = e.currentTarget;
        setTimeout(() => setView(read(form)), 0);
      }}
      className="space-y-4"
    >
      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger">
          <Icon name="alert-triangle" className="mt-0.5 size-4" />
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-action-soft px-3.5 py-3 text-sm font-semibold text-action">
          <span className="inline-flex items-center gap-2">
            <Icon name="check-circle" className="size-4" />
            {state.success}
          </span>
          <Link href="/lots" className="underline underline-offset-4">
            Ver lotes
          </Link>
        </p>
      )}

      {/* Producto */}
      <section className={card} aria-labelledby="sec-product">
        <h2 id="sec-product" className={cardTitle}>
          <Icon name="archive" className="size-4" /> Producto identificado
        </h2>
        {product && (
          <div className="mb-3 flex items-center gap-3 rounded-control bg-surface-muted px-3 py-2.5">
            <ProductThumb name={product.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold">{product.name}</p>
              <p className="text-xs text-text-secondary">Unidad: {product.unitLabel}</p>
            </div>
          </div>
        )}
        <SelectField
          id="productId"
          label="Producto"
          required
          defaultValue={v?.productId ?? defaultProductId ?? ""}
          error={state.fieldErrors?.productId}
        >
          <option value="" disabled>
            Elige un producto
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.unitLabel}
            </option>
          ))}
        </SelectField>
      </section>

      {/* Cantidad */}
      <section className={card} aria-labelledby="sec-qty">
        <h2 id="sec-qty" className={cardTitle}>
          <Icon name="package-plus" className="size-4" /> Cantidad ingresada
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Restar una unidad"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface-muted transition active:scale-95 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="minus" className="size-6" strokeWidth={2.6} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <label htmlFor="quantity" className="sr-only">
              Cantidad inicial
            </label>
            <input
              id="quantity"
              name="quantity"
              type="text"
              inputMode="decimal"
              placeholder="0"
              required
              defaultValue={v?.quantity}
              aria-invalid={state.fieldErrors?.quantity ? true : undefined}
              aria-describedby={state.fieldErrors?.quantity ? "quantity-error" : undefined}
              className="w-full bg-transparent text-center text-5xl leading-none font-bold outline-none placeholder:text-border focus-visible:rounded-2xl focus-visible:outline-2 focus-visible:outline-action/40"
            />
            <p className="mt-1 text-sm text-text-secondary">{product?.unitLabel ?? "unidades"}</p>
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Sumar una unidad"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-action text-white shadow-[0_6px_16px_rgb(10_138_71/0.35)] transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Icon name="plus" className="size-6" strokeWidth={2.6} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[5, 10, 24].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => step(n)}
              className="min-h-11 rounded-control bg-surface-muted text-sm font-bold transition-colors hover:bg-[#e6eae4] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary"
            >
              +{n}
            </button>
          ))}
        </div>
        {state.fieldErrors?.quantity && (
          <p id="quantity-error" className="mt-2 text-sm font-medium text-danger">
            {state.fieldErrors.quantity}
          </p>
        )}
      </section>

      {/* Código de lote */}
      <section className={card} aria-labelledby="sec-code">
        <h2 id="sec-code" className={cardTitle}>
          <Icon name="barcode" className="size-4" /> Código de lote
        </h2>
        <Field
          id="supplierLotCode"
          label="Código del proveedor (opcional)"
          type="text"
          maxLength={60}
          placeholder="Ej. L-2410"
          defaultValue={v?.supplierLotCode}
          error={state.fieldErrors?.supplierLotCode}
        />
      </section>

      {/* Fechas: primero la entrada, después la caducidad */}
      <section className={card} aria-labelledby="sec-dates">
        <h2 id="sec-dates" className={cardTitle}>
          <Icon name="calendar" className="size-4" /> Fechas
        </h2>
        <div className="space-y-4">
          <Field
            id="entryDate"
            label="Fecha de entrada"
            type="date"
            required
            defaultValue={v?.entryDate ?? today}
            error={state.fieldErrors?.entryDate}
          />
          <div className="space-y-2.5">
            <Field
              id="expirationDate"
              label="Fecha de caducidad"
              type="date"
              required
              defaultValue={v?.expirationDate}
              error={state.fieldErrors?.expirationDate}
            />
            <div className="tadu-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Caducidad rápida (desde hoy)">
              {QUICK_DATES.map((q) => {
                const target = addDays(today, q.days);
                const active = view.expirationDate === target;
                return (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setField("expirationDate", target)}
                    aria-pressed={active}
                    className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                      active ? "bg-orange text-white" : "bg-surface-muted text-text-primary hover:bg-[#e6eae4]"
                    }`}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>
            <p className="flex items-start gap-2 text-xs text-text-secondary">
              <Icon name="info" className="mt-0.5 size-3.5" />
              Confirma la fecha tal como aparece en el empaque. TADUKA no la calcula por ti.
            </p>
          </div>
        </div>
      </section>

      {/* Ubicación: aún no existe en el modelo de datos */}
      <section className={card} aria-labelledby="sec-loc">
        <h2 id="sec-loc" className={cardTitle}>
          <Icon name="map-pin" className="size-4" /> Ubicación en la tienda
        </h2>
        <div className="flex items-center justify-between gap-3 rounded-control border border-dashed border-border bg-surface-muted/60 px-3.5 py-3 text-sm text-text-secondary">
          <span>Refrigerador, anaquel, bodega…</span>
          <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold">Próximamente</span>
        </div>
      </section>

      {/* Resumen visual */}
      <section className="tadu-rise rounded-card bg-primary-deep p-4 text-white shadow-card" aria-label="Resumen de la entrada">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-white/70 uppercase">
          <Icon name="clipboard-check" className="size-4" /> Resumen de la entrada
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-white/70">Producto</dt>
            <dd className="font-bold">{product?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-white/70">Cantidad</dt>
            <dd className="font-bold">
              {Number.isFinite(qty) && qty > 0 ? `${qty.toLocaleString("es-MX")} ${product?.unitLabel ?? ""}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-white/70">Entrada</dt>
            <dd className="font-bold">{view.entryDate ? formatDate(view.entryDate) : "—"}</dd>
          </div>
          <div>
            <dt className="text-white/70">Caduca</dt>
            <dd className="font-bold">{hasExp ? formatDate(view.expirationDate) : "—"}</dd>
          </div>
        </dl>
        {daysLeft !== null && (
          <p
            className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              daysLeft < 0 ? "bg-danger-soft text-danger" : short ? "bg-orange-soft text-orange" : "bg-action-soft text-action"
            }`}
          >
            <Icon name={daysLeft < 0 ? "x-circle" : short ? "alert-triangle" : "check-circle"} className="size-3.5" strokeWidth={2.4} />
            {daysLeft < 0 ? "Ya vencido" : short ? "Corta vigencia" : "Vigencia suficiente"}
          </p>
        )}
        <p className="mt-2 text-xs text-white/60">Vista previa; el estado oficial lo calcula TADUKA al guardar.</p>
      </section>

      <SubmitButton pendingLabel="Guardando…" size="lg" className="w-full">
        <Icon name="check-circle" className="size-5" />
        Guardar entrada
      </SubmitButton>
      <button type="reset" className={buttonClass("ghost", "md", "w-full")}>
        Limpiar captura
      </button>
    </form>
  );
}
