import { Suspense, type ReactNode } from "react";
import { BottomNav, SideNav } from "@/components/app/app-nav";

// Móvil: contenido a ancho completo con navegación inferior. Escritorio: barra lateral.
// La navegación lee la ruta actual (dato de la petición), así que va dentro de <Suspense>
// con un marco del mismo tamaño para evitar saltos de diseño.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <Suspense fallback={<aside className="hidden border-r border-border bg-surface md:block" />}>
        <SideNav />
      </Suspense>
      <main className="mx-auto w-full max-w-2xl px-4 pt-4 pb-36 sm:px-6 md:max-w-3xl md:pt-8 md:pb-12">
        {children}
      </main>
      <Suspense
        fallback={
          <div className="fixed inset-x-4 bottom-4 z-30 mx-auto h-[4.5rem] max-w-sm rounded-full border border-border/60 bg-surface shadow-[0_10px_30px_rgb(16_40_30/0.18)] md:hidden" />
        }
      >
        <BottomNav />
      </Suspense>
    </div>
  );
}
