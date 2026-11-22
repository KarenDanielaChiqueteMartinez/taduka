"use client";

import { useEffect, useRef } from "react";
import { CategoryForm } from "@/components/catalog/category-form";
import { Icon } from "@/components/ui/icons";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (category: { id: string; name: string }) => void;
};

// Ventana para crear una categoría sin salir de la pantalla actual. Debe renderizarse fuera de
// cualquier <form>: el formulario interno no puede anidarse en otro.
export function CategoryDialog({ open, onClose, onCreated }: Props) {
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
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="category-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-border bg-surface text-text-primary shadow-float backdrop:bg-black/40"
    >
      {open && (
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="category-dialog-title" className="text-lg font-bold tracking-tight">
              Nueva categoría
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex size-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="x" className="size-5" />
            </button>
          </div>
          <p className="text-sm text-text-secondary">
            Las categorías te ayudan a organizar tus productos. Se usará en este producto.
          </p>
          <CategoryForm inputId="newCategoryName" autoFocus onCreated={onCreated} />
        </div>
      )}
    </dialog>
  );
}
