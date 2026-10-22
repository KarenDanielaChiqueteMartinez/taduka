"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/products", label: "Productos" },
  { href: "/lots", label: "Lotes" },
  { href: "/categories", label: "Categorías" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className="-mx-1 flex gap-1 overflow-x-auto">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
              active
                ? "bg-primary-soft text-primary"
                : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
