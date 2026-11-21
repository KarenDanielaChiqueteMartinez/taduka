import type { ComponentProps } from "react";

// Superficie base: radio de tarjeta, borde tenue y sombra sutil.
export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={`rounded-card border border-border/70 bg-surface shadow-card ${className}`}
      {...props}
    />
  );
}

export function SectionTitle({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-bold tracking-tight">{children}</h2>
      {aside}
    </div>
  );
}
