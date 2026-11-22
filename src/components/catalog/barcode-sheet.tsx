"use client";

import { useEffect, useRef, useState } from "react";
import { BarcodeScanner } from "@/components/catalog/barcode-scanner";
import { Icon } from "@/components/ui/icons";

type Props = {
  open: boolean;
  value: string;
  onClose: () => void;
  onConfirm: (code: string) => void;
};

// EAN-13 de uso interno: empieza con 2 (rango reservado para tiendas) y lleva dígito verificador.
function generateCode(): string {
  const digits = Array.from(crypto.getRandomValues(new Uint8Array(11)), (n) => n % 10);
  const body = [2, ...digits];
  const sum = body.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return [...body, (10 - (sum % 10)) % 10].join("");
}

// Pantalla (hoja inferior) para escribir, generar o escanear el código de barras o QR. Debe
// renderizarse fuera de cualquier <form>.
export function BarcodeSheet({ open, value, onClose, onConfirm }: Props) {
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
      aria-labelledby="barcode-sheet-title"
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl border border-border bg-surface text-text-primary shadow-float backdrop:bg-black/40 sm:m-auto sm:max-w-md sm:rounded-card"
    >
      {open && <SheetBody initial={value} onClose={onClose} onConfirm={onConfirm} />}
    </dialog>
  );
}

function SheetBody({
  initial,
  onClose,
  onConfirm,
}: {
  initial: string;
  onClose: () => void;
  onConfirm: (code: string) => void;
}) {
  const [code, setCode] = useState(initial);
  const [scanning, setScanning] = useState(false);

  return (
    <div className="space-y-5 p-5 pb-8">
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 shrink-0 rounded-full px-2 text-base font-semibold whitespace-nowrap text-text-secondary focus-visible:outline-2 focus-visible:outline-primary"
        >
          Cancelar
        </button>
        <h2 id="barcode-sheet-title" className="text-center text-base leading-tight font-bold">
          Código QR / Código de barras
        </h2>
        <button
          type="button"
          onClick={() => onConfirm(code.trim())}
          className="min-h-11 shrink-0 rounded-full px-2 text-base font-bold whitespace-nowrap text-action focus-visible:outline-2 focus-visible:outline-primary"
        >
          Hecho
        </button>
      </header>

      {scanning ? (
        <BarcodeScanner
          onDetect={(detected) => {
            setCode(detected.slice(0, 64));
            setScanning(false);
          }}
          onCancel={() => setScanning(false)}
        />
      ) : (
        <>
          <div className="relative">
            <label
              htmlFor="barcodeInput"
              className="absolute -top-2.5 left-3 bg-surface px-1.5 text-sm font-medium text-action"
            >
              Código de entrada
            </label>
            <input
              id="barcodeInput"
              type="text"
              value={code}
              maxLength={64}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => {
                // Los lectores USB terminan con Enter: confirma sin enviar el formulario.
                if (event.key === "Enter") {
                  event.preventDefault();
                  onConfirm(code.trim());
                }
              }}
              className="h-16 w-full rounded-control border-2 border-action bg-surface px-4 text-lg font-semibold tracking-wide text-text-primary outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCode(generateCode())}
              className="min-h-12 rounded-control px-3 text-base font-bold text-action transition-colors hover:bg-action-soft focus-visible:outline-2 focus-visible:outline-primary"
            >
              Generar código
            </button>
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-action px-3 text-base font-bold text-white transition-colors hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Icon name="camera" className="size-5" />
              Escanear código
            </button>
          </div>
        </>
      )}
    </div>
  );
}
