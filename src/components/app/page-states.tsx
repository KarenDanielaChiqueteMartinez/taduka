import type { ReactNode } from "react";
import { LinkButton } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";

export function LoadingState() {
  return (
    <div role="status" aria-label="Cargando" className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-11 animate-pulse rounded-2xl bg-border motion-reduce:animate-none" />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 w-24 animate-pulse rounded-full bg-border motion-reduce:animate-none" />
          <div className="h-4 w-40 animate-pulse rounded-full bg-border motion-reduce:animate-none" />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-card bg-surface shadow-card motion-reduce:animate-none"
        />
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

export function LoadError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-3 rounded-card bg-danger-soft px-4 py-3.5 text-sm font-medium text-danger"
    >
      <Icon name="alert-triangle" className="mt-0.5 size-5" />
      <span>{message} Recarga la página para intentarlo de nuevo.</span>
    </p>
  );
}

// Estado vacío diseñado: icono, mensaje y una acción siguiente cuando existe.
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="tadu-rise flex flex-col items-center rounded-card border border-dashed border-[#cfd8d1] bg-surface px-6 py-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon name={icon} className="size-8" strokeWidth={1.8} />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-text-secondary">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StoreRequired() {
  return (
    <EmptyState
      icon="store"
      title="Primero crea tu tienda"
      description="Necesitas una tienda para administrar tu catálogo y tus lotes."
      action={<LinkButton href="/dashboard">Ir al inicio</LinkButton>}
    />
  );
}
