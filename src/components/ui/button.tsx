import Link from "next/link";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-action text-white shadow-[0_6px_16px_rgb(10_138_71/0.28)] hover:bg-action-hover active:bg-action-hover active:translate-y-px",
  secondary:
    "border border-border bg-surface text-text-primary hover:bg-surface-muted active:translate-y-px",
  soft: "bg-primary-soft text-primary hover:bg-[#cfe7dc] active:translate-y-px",
  ghost: "text-text-secondary hover:bg-surface-muted active:translate-y-px",
  danger: "bg-danger-soft text-danger hover:bg-[#fbd9d7] active:translate-y-px",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm rounded-control",
  lg: "min-h-14 px-5 text-base rounded-card",
};

// Clases compartidas por <button>, <Link> y el botón de envío de formularios.
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
) {
  return `inline-flex items-center justify-center gap-2 font-semibold transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:active:translate-y-0 ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
