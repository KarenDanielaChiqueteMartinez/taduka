import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import { NavLinks } from "@/components/app/nav-links";
import { SubmitButton } from "@/components/ui/submit-button";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xl font-semibold tracking-tight text-primary">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-accent" />
            TADUKA
          </p>
          <form action={signOut}>
            <SubmitButton variant="secondary" pendingLabel="Cerrando sesión…">
              Cerrar sesión
            </SubmitButton>
          </form>
        </div>
        <NavLinks />
      </header>
      <main className="mt-6 space-y-6">{children}</main>
    </div>
  );
}
