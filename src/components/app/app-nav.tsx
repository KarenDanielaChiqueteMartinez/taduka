"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icons";

// Secciones principales. "Productos" agrupa el catálogo y los lotes; "Más" agrupa categorías y cuenta.
const ITEMS: { href: string; label: string; icon: IconName; match: string[] }[] = [
  { href: "/dashboard", label: "Inicio", icon: "home", match: ["/dashboard"] },
  { href: "/products", label: "Productos", icon: "archive", match: ["/products", "/lots"] },
  { href: "/activity", label: "Actividad", icon: "history", match: ["/activity"] },
  { href: "/more", label: "Más", icon: "more", match: ["/more", "/categories"] },
];

function useActive() {
  const pathname = usePathname();
  return (match: string[]) =>
    match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

// Barra flotante tipo app: cápsula blanca muy redondeada; la sección activa se expande en una
// cápsula verde con icono y nombre, las demás quedan como iconos ligeros (con nombre accesible).
export function BottomNav() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Principal"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <ul className="pointer-events-auto mx-auto flex max-w-sm items-center justify-between rounded-full border border-border/60 bg-surface p-1.5 shadow-[0_10px_30px_rgb(16_40_30/0.18)]">
        {ITEMS.map((item) => {
          const active = isActive(item.match);
          return (
            <li key={item.href} className={active ? "" : "flex-1"}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={`flex h-12 items-center justify-center gap-2 rounded-full transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none ${
                  active
                    ? "bg-hero-to px-5 text-white shadow-[0_6px_14px_rgb(5_77_34/0.35)]"
                    : "w-full text-[#6b7587] hover:bg-surface-muted"
                }`}
              >
                <Icon
                  name={item.icon}
                  className={`size-6 ${active ? "text-accent" : ""}`}
                  strokeWidth={active ? 2.3 : 2}
                />
                {active && <span className="text-sm font-bold">{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav() {
  const isActive = useActive();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-border bg-surface px-4 py-6 md:flex">
      <p className="flex items-center gap-2.5 px-3 text-xl font-bold tracking-tight text-primary">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary-deep text-accent">
          <Icon name="store" className="size-5" />
        </span>
        TADUKA
      </p>
      <nav aria-label="Principal">
        <ul className="space-y-1">
          {ITEMS.map((item) => {
            const active = isActive(item.match);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-control px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                    active
                      ? "bg-action-soft font-bold text-action"
                      : "font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                  }`}
                >
                  <Icon name={item.icon} className="size-5" strokeWidth={active ? 2.4 : 2} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
