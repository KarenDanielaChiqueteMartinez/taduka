import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";

type Props = {
  title: string;
  storeName?: string;
  // Con backHref aparece el botón de regreso en lugar del logotipo de la tienda.
  backHref?: string;
  // Inicial de la cuenta para el acceso al perfil (/more).
  initial?: string;
  // Punto de aviso sobre la campana cuando hay lotes que atender.
  alertDot?: boolean;
  right?: ReactNode;
};

// Encabezado compacto de cada pantalla: tienda + título, alertas y perfil.
export function ScreenHeader({ title, storeName, backHref, initial, alertDot, right }: Props) {
  return (
    <header className="tadu-rise mb-5 flex items-center gap-3">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Regresar"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-primary shadow-card transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="chevron-left" className="size-5" strokeWidth={2.4} />
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-deep text-accent"
        >
          <Icon name="store" className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {storeName && (
          <p className="truncate text-[11px] font-semibold tracking-wider text-text-secondary uppercase">
            {storeName}
          </p>
        )}
        <h1 className="truncate text-xl leading-tight font-bold tracking-tight">{title}</h1>
      </div>
      {right}
      {initial !== undefined && (
        <>
          <Link
            href="/lots"
            aria-label={alertDot ? "Alertas de caducidad: hay lotes por atender" : "Alertas de caducidad"}
            className="relative flex size-11 items-center justify-center rounded-full text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="bell" className="size-5" />
            {alertDot && (
              <span className="absolute top-2.5 right-3 size-2.5 rounded-full border-2 border-background bg-orange" />
            )}
          </Link>
          <Link
            href="/more"
            aria-label="Perfil y más opciones"
            className="flex size-11 items-center justify-center rounded-full bg-primary-deep text-sm font-bold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {initial || <Icon name="user" className="size-5" />}
          </Link>
        </>
      )}
    </header>
  );
}
