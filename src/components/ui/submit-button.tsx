"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  children: ReactNode;
  pendingLabel: string;
  variant?: "primary" | "secondary";
  className?: string;
};

const variants = {
  primary:
    "bg-primary text-white hover:bg-primary-hover active:bg-primary-hover",
  secondary:
    "border border-border bg-surface text-text-primary hover:bg-surface-muted",
};

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70 ${variants[variant]} ${className}`}
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
