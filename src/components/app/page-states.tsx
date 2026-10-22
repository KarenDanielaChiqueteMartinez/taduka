import Link from "next/link";

export function LoadingState() {
  return (
    <p role="status" className="text-sm text-text-secondary">
      Cargando…
    </p>
  );
}

export function LoadError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
      {message} Recarga la página para intentarlo de nuevo.
    </p>
  );
}

export function StoreRequired() {
  return (
    <div className="rounded-card border border-border bg-surface p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Primero crea tu tienda</h1>
      <p className="mt-1 mb-4 text-sm text-text-secondary">
        Necesitas una tienda para administrar tu catálogo.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Ir al inicio
      </Link>
    </div>
  );
}
