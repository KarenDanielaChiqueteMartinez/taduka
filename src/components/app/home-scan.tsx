"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { findProductByBarcode } from "@/lib/catalog/actions";
import { BarcodeScanner } from "@/components/catalog/barcode-scanner";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

type Status = { kind: "scanning" } | { kind: "searching" } | { kind: "error"; message: string };

// Botón de escaneo de la barra de búsqueda de Inicio: abre la cámara, lee el código de barras y
// abre la ficha del producto de la tienda que lo tenga. Si no existe, lo avisa y deja reintentar.
export function HomeScan() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // Cambia en cada intento para reiniciar la cámara.
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: "scanning" });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function start() {
    setStatus({ kind: "scanning" });
    setAttempt((n) => n + 1);
    setOpen(true);
  }

  async function onDetect(code: string) {
    setStatus({ kind: "searching" });
    const result = await findProductByBarcode(code);
    if (result.id) {
      setOpen(false);
      router.push(`/products/${result.id}`);
    } else {
      setStatus({ kind: "error", message: result.error ?? "No pudimos buscar el producto." });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label="Escanear código de barras para buscar un producto"
        className="flex size-11 items-center justify-center rounded-2xl text-[#6b7587] transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Icon name="scan" className="size-6" />
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        aria-labelledby="home-scan-title"
        className="m-0 mt-auto w-full max-w-none rounded-t-3xl border border-border bg-surface text-text-primary shadow-float backdrop:bg-black/40 sm:m-auto sm:max-w-md sm:rounded-card"
      >
        {open && (
          <div className="space-y-4 p-5 pb-8">
            <div className="flex items-center justify-between gap-3">
              <h2 id="home-scan-title" className="text-lg font-bold tracking-tight">
                Escanear producto
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="flex size-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Icon name="x" className="size-5" />
              </button>
            </div>

            {status.kind === "scanning" && (
              <BarcodeScanner
                key={attempt}
                onDetect={onDetect}
                onCancel={() => setOpen(false)}
                cancelLabel="Cancelar"
              />
            )}

            {status.kind === "searching" && (
              <div role="status" className="flex flex-col items-center gap-3 py-10 text-action">
                <span
                  aria-hidden="true"
                  className="size-8 animate-spin rounded-full border-[3px] border-current border-t-transparent motion-reduce:animate-none"
                />
                <span className="text-sm font-semibold">Buscando producto…</span>
              </div>
            )}

            {status.kind === "error" && (
              <div className="space-y-4">
                <p role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger">
                  <Icon name="alert-triangle" className="mt-0.5 size-4" />
                  {status.message}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary", "lg")}>
                    Cerrar
                  </button>
                  <button type="button" onClick={start} className={buttonClass("primary", "lg")}>
                    Escanear de nuevo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
