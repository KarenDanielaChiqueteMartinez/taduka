import Link from "next/link";
import { Icon } from "@/components/ui/icons";

// Selector visual entre fotografía de nota y captura manual (dos rutas).
export function MethodSwitch({ active }: { active: "photo" | "manual" }) {
  const base =
    "flex min-h-12 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary";
  return (
    <div className="tadu-rise mb-4">
      <p className="mb-2 text-xs font-bold tracking-wider text-action uppercase">Inventario inteligente</p>
      <h2 className="mb-3 text-lg font-bold">Selecciona el método</h2>
      <div role="tablist" aria-label="Método de registro" className="grid grid-cols-2 gap-1 rounded-full bg-surface-muted p-1">
        <Link
          href="/lots/new/photo"
          role="tab"
          aria-selected={active === "photo"}
          className={`${base} ${active === "photo" ? "bg-surface shadow-card" : "text-text-secondary"}`}
        >
          <Icon name="camera" className="size-4" />
          Fotografiar nota
        </Link>
        <Link
          href="/lots/new"
          role="tab"
          aria-selected={active === "manual"}
          className={`${base} ${active === "manual" ? "bg-surface shadow-card" : "text-text-secondary"}`}
        >
          <Icon name="pencil" className="size-4" />
          Captura manual
        </Link>
      </div>
    </div>
  );
}
