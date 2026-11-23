"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// Pregunta de confirmación antes de una acción que cambia datos. Debe renderizarse fuera de
// cualquier <form> si sus botones necesitan enviar ese formulario desde afuera.
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Revisar",
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      aria-labelledby="confirm-dialog-title"
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl border border-border bg-surface text-text-primary shadow-float backdrop:bg-black/40 sm:m-auto sm:max-w-md sm:rounded-card"
    >
      {open && (
        <div className="space-y-4 p-5 pb-8">
          <h2 id="confirm-dialog-title" className="text-lg font-bold tracking-tight">
            {title}
          </h2>
          <div className="space-y-3">{children}</div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button type="button" onClick={onCancel} className={buttonClass("secondary", "lg")}>
              {cancelLabel}
            </button>
            <button type="button" onClick={onConfirm} className={buttonClass("primary", "lg")}>
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
