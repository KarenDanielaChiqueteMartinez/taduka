import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";

type Props = {
  title: string;
  cancelHref: string;
  submitLabel: string;
  pendingLabel: string;
};

// Cabecera fija de los formularios de captura. Debe renderizarse DENTRO del <form>: el botón de
// la derecha lo envía. En pantallas angostas "Cancelar" es una X para que el título quepa; tres
// columnas con los lados de igual ancho mantienen el título centrado.
export function FormHeader({ title, cancelHref, submitLabel, pendingLabel }: Props) {
  return (
    <header className="sticky top-0 z-30 -mx-4 -mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-background px-4 py-3 sm:-mx-6 sm:px-6 md:-mt-8">
      <div className="flex justify-start">
        <Link
          href={cancelHref}
          aria-label="Cancelar"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-secondary shadow-card transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary sm:w-auto sm:gap-1 sm:pr-4 sm:pl-2.5 sm:text-base sm:font-semibold"
        >
          <Icon name="x" className="size-5 sm:hidden" strokeWidth={2.4} />
          <Icon name="chevron-left" className="hidden size-5 sm:block" strokeWidth={2.4} />
          <span className="hidden sm:inline">Cancelar</span>
        </Link>
      </div>
      <h1 className="min-w-0 truncate text-center text-lg font-bold tracking-tight sm:text-xl">{title}</h1>
      <div className="flex justify-end">
        <SubmitButton
          pendingLabel={pendingLabel}
          variant="soft"
          className="min-h-11 shrink-0 rounded-full px-5 text-base"
        >
          {submitLabel}
        </SubmitButton>
      </div>
    </header>
  );
}
