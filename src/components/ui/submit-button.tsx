"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

type Props = {
  children: ReactNode;
  pendingLabel: ReactNode;
  // Nombre accesible cuando el botón solo muestra un ícono.
  ariaLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  // Para formularios con varios botones de envío (el servidor lee name=value).
  name?: string;
  value?: string;
};

export function SubmitButton({
  children,
  pendingLabel,
  ariaLabel,
  variant = "primary",
  size = "md",
  className = "",
  name,
  value,
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name={name}
      value={value}
      aria-label={ariaLabel}
      disabled={pending}
      aria-disabled={pending}
      className={buttonClass(variant, size, className)}
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
