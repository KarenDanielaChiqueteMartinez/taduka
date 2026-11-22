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
    <div>
      <label className="relative flex min-h-28 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-control border-2 border-dashed border-action/50 bg-action-soft/60 px-4 py-5 text-center text-base font-semibold text-action transition-colors hover:bg-action-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Vista previa de la foto" className="absolute inset-0 size-full object-cover" />
        )}
        <span
          className={`relative inline-flex items-center gap-2 ${preview ? "rounded-full bg-surface/90 px-4 py-2 shadow-card" : ""}`}
        >
          <Icon name="camera" className="size-5" />
          {busy ? "Procesando…" : preview ? "Cambiar fotografía" : "Agregar o tomar fotografía"}
        </span>
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
          className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="x" className="size-4" />
          Quitar foto
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
