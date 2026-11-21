"use client";

import { useEffect, useRef, useState } from "react";
import { resizeImageToJpeg } from "@/lib/image/resize";
import { Icon } from "@/components/ui/icons";

// Campo de foto para el formulario de producto: toma o elige una imagen, la reduce en el
// navegador y la deja en el mismo campo de archivo del formulario (name="photo").
export function PhotoPicker({ name = "photo" }: { name?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearPreview = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPreview(null);
  };

  useEffect(() => {
    const form = inputRef.current?.form;
    const onReset = () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setPreview(null);
      setError(null);
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
      const resized = await resizeImageToJpeg(file);
      const transfer = new DataTransfer();
      transfer.items.add(resized);
      input.files = transfer.files;
      clearPreview();
      urlRef.current = URL.createObjectURL(resized);
      setPreview(urlRef.current);
    } catch {
      input.value = "";
      clearPreview();
      setError("No pudimos leer esa imagen. Prueba con otra foto.");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (inputRef.current) inputRef.current.value = "";
    clearPreview();
    setError(null);
  }

  return (
    <div className="rounded-control border border-border bg-surface-muted/50 p-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="relative flex size-[4.5rem] shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="absolute inset-0 size-full rounded-2xl object-cover" />
          ) : (
            <Icon name="camera" className="size-7" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Foto del producto (opcional)</p>
          <p className="text-xs text-text-secondary">Se reduce automáticamente antes de guardarse.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-action-soft px-3.5 text-sm font-semibold text-action transition-colors hover:bg-[#d3eddc] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
              <Icon name="camera" className="size-4" />
              {busy ? "Procesando…" : preview ? "Cambiar foto" : "Tomar o elegir foto"}
              <input
                ref={inputRef}
                type="file"
                name={name}
                accept="image/*"
                onChange={onChange}
                disabled={busy}
                className="sr-only"
              />
            </label>
            {preview && (
              <button
                type="button"
                onClick={remove}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Icon name="x" className="size-4" />
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
