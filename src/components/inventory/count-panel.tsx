"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

type Props = {
  unitLabel: string;
  previous: number;
  backHref: string;
};

const clamp = (n: number) => Math.max(0, Math.round(n * 1000) / 1000);

// Vista previa del flujo de conteo: la cantidad es el elemento principal. No guarda nada.
export function CountPanel({ unitLabel, previous, backHref }: Props) {
  const [qty, setQty] = useState(previous);
  const diff = Math.round((qty - previous) * 1000) / 1000;
  const fmt = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

  const diffTone =
    diff === 0
      ? { box: "bg-surface-muted", icon: "bg-border text-text-secondary", text: "text-text-primary" }
      : diff < 0
        ? { box: "bg-orange-soft", icon: "bg-orange text-white", text: "text-orange" }
        : { box: "bg-action-soft", icon: "bg-action text-white", text: "text-action" };

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="counted-label"
        className="tadu-rise rounded-panel border border-border/70 bg-surface p-5 shadow-card"
      >
        <p id="counted-label" className="text-center text-xs font-semibold tracking-widest text-text-secondary uppercase">
          Unidades contadas
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setQty((q) => clamp(q - 1))}
            disabled={qty <= 0}
            aria-label="Restar una unidad"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-surface-muted text-text-primary transition active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="minus" className="size-7" strokeWidth={2.6} />
          </button>
          <div className="min-w-0 text-center">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={Number.isFinite(qty) ? qty : 0}
              onChange={(e) => setQty(clamp(Number(e.target.value)))}
              aria-label={`Unidades contadas (${unitLabel})`}
              className="w-full min-w-0 bg-transparent text-center text-7xl leading-none font-bold tracking-tight outline-none focus-visible:rounded-2xl focus-visible:outline-2 focus-visible:outline-action/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <p className="mt-1 text-sm font-medium text-text-secondary">{unitLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setQty((q) => clamp(q + 1))}
            aria-label="Sumar una unidad"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-action text-white shadow-[0_6px_16px_rgb(10_138_71/0.35)] transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Icon name="plus" className="size-7" strokeWidth={2.6} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[1, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQty((q) => clamp(q + n))}
              className="min-h-12 rounded-control bg-surface-muted text-sm font-bold transition-colors hover:bg-[#e6eae4] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary"
            >
              +{n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setQty(previous)}
            className="min-h-12 rounded-control bg-primary-soft text-sm font-bold text-primary transition-colors hover:bg-[#cfe7dc] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary"
          >
            Exacto ({fmt(previous)})
          </button>
        </div>
      </section>

      <section
        aria-live="polite"
        className={`tadu-rise rounded-card p-4 ${diffTone.box}`}
      >
        <div className="flex items-center gap-3">
          <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${diffTone.icon}`}>
            <Icon name={diff < 0 ? "trending-down" : diff > 0 ? "plus" : "check-circle"} className="size-5" strokeWidth={2.4} />
          </span>
          <div>
            <p className={`text-base font-bold ${diffTone.text}`}>
              {diff === 0
                ? "Sin diferencia"
                : `Diferencia: ${fmt(Math.abs(diff))} ${diff < 0 ? "menos" : "más"}`}
            </p>
            <p className="text-sm text-text-secondary">
              Conteo anterior {fmt(previous)} → Conteo actual {fmt(qty)}
            </p>
          </div>
        </div>
        {diff !== 0 && (
          <p className="mt-3 text-xs text-text-secondary">
            Una diferencia de conteo es un ajuste de inventario, no una venta.
          </p>
        )}
      </section>

      <p className="flex items-start gap-2.5 rounded-control bg-primary-soft/60 px-3.5 py-3 text-sm text-primary">
        <Icon name="info" className="mt-0.5 size-4" />
        <span>
          <strong>Vista previa del flujo.</strong> Guardar conteos aún no está disponible: lo que
          captures aquí no se guarda ni cambia tu inventario.
        </span>
      </p>

      <div className="space-y-2">
        <button type="button" disabled className={buttonClass("primary", "lg", "w-full")}>
          <Icon name="check-circle" className="size-5" />
          Confirmar y guardar conteo
        </button>
        <Link href={backHref} className={buttonClass("ghost", "md", "w-full")}>
          Descartar conteo
        </Link>
      </div>
    </div>
  );
}
