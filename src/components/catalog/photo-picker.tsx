"use client";

import { useEffect, useRef, useState } from "react";
import { resizeImageToJpeg } from "@/lib/image/resize";
import { Icon } from "@/components/ui/icons";

// Tiempo mínimo que se ve la animación de carga, para que no parpadee con fotos rápidas.
const MIN_BUSY_MS = 450;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Campo de foto para el formulario de producto: toma o elige una imagen, la recorta en cuadrado,
// la reduce en el navegador y la deja en el mismo campo de archivo del formulario (name="photo").
// El input vive siempre en el mismo lugar del árbol para no perder el archivo al cambiar de estado.
export function PhotoPicker({
  name = "photo",
  initialUrl = null,
}: {
  name?: string;
  // Foto que el producto ya tiene (al editar). Se muestra hasta que se cambie o se quite.
  initialUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sizeKb, setSizeKb] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La foto actual se quitó (el servidor la borra al guardar).
  const [removed, setRemoved] = useState(false);
  const shown = preview ?? (removed ? null : initialUrl);

  const clearPreview = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPreview(null);
    setSizeKb(null);
  };

  useEffect(() => {
    const form = inputRef.current?.form;
    const onReset = () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setPreview(null);
      setSizeKb(null);
      setError(null);
      setRemoved(false);
    };
    form?.addEventListener("reset", onReset);
    return () => {
      form?.removeEventListener("reset", onReset);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const [resized] = await Promise.all([resizeImageToJpeg(file), sleep(MIN_BUSY_MS)]);
      const transfer = new DataTransfer();
      transfer.items.add(resized);
      input.files = transfer.files;
      clearPreview();
      urlRef.current = URL.createObjectURL(resized);
      setPreview(urlRef.current);
      setSizeKb(Math.max(1, Math.round(resized.size / 1024)));
    } catch {
      input.value = "";
      clearPreview();
      setError("No pudimos leer esa imagen. Prueba con otra foto.");
    } finally {
      setBusy(false);
    }
  }

  // La X quita lo que se ve: primero la foto nueva (y reaparece la actual); si ya no hay nueva,
  // quita la actual.
  function remove() {
    if (inputRef.current) inputRef.current.value = "";
    setError(null);
    if (preview) clearPreview();
    else setRemoved(true);
  }

  const choose = () => inputRef.current?.click();

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/*"
        onChange={onChange}
        tabIndex={-1}
        aria-label="Fotografía del producto"
        className="sr-only"
      />
      <input type="hidden" name="removePhoto" value={removed && !preview ? "1" : ""} />

      {busy ? (
        <div
          role="status"
          aria-live="polite"
          className="tadu-pop tadu-shimmer relative mx-auto flex aspect-square w-full max-w-[16rem] flex-col items-center justify-center gap-3 overflow-hidden rounded-card border border-border bg-action-soft/70 text-action"
        >
          <span
            aria-hidden="true"
            className="size-8 animate-spin rounded-full border-[3px] border-current border-t-transparent motion-reduce:animate-none"
          />
          <span className="text-sm font-semibold">Procesando foto…</span>
        </div>
      ) : shown ? (
        <div className="space-y-3">
          <div className="tadu-pop relative mx-auto aspect-square w-full max-w-[16rem]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shown}
              alt="Vista previa de la foto del producto"
              className="size-full rounded-card border border-border object-cover shadow-card"
            />
            <button
              type="button"
              onClick={remove}
              aria-label="Quitar foto"
              className="absolute -top-2.5 -right-2.5 flex size-9 items-center justify-center rounded-full border-2 border-surface bg-action text-white shadow-card transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Icon name="x" className="size-4" strokeWidth={2.6} />
            </button>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={choose}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action-soft px-4 text-sm font-semibold text-action transition-colors hover:bg-[#d3eddc] focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="camera" className="size-4" />
              Cambiar fotografía
            </button>
            {preview && sizeKb !== null && <span className="text-xs text-text-secondary">Cuadrada · {sizeKb} KB</span>}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={choose}
          className="flex min-h-28 w-full items-center justify-center gap-2 rounded-control border-2 border-dashed border-action/50 bg-action-soft/60 px-4 py-5 text-center text-base font-semibold text-action transition-colors hover:bg-action-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Icon name="camera" className="size-5" />
          Agregar o tomar fotografía
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
