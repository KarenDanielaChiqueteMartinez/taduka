"use client";

import { useRef, useState, useTransition } from "react";
import { removeProductPhoto, uploadProductPhoto } from "@/lib/catalog/photo-actions";
import { resizeImageToJpeg } from "@/lib/image/resize";
import { Icon } from "@/components/ui/icons";
import { ProductThumb } from "@/components/ui/product-thumb";
import type { LotStatus } from "@/lib/inventory/summary";

type Props = {
  productId: string;
  name: string;
  status: LotStatus | null;
  photoUrl: string | null;
};

// Ficha del producto: muestra su foto y permite agregarla, cambiarla o quitarla.
export function ProductPhotoEditor({ productId, name, status, photoUrl }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const resized = await resizeImageToJpeg(file);
        const data = new FormData();
        data.set("productId", productId);
        data.set("photo", resized);
        const result = await uploadProductPhoto(data);
        if (!result.ok) setError(result.error);
      } catch {
        setError("No pudimos leer esa imagen. Prueba con otra foto.");
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeProductPhoto(productId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <div className="relative">
        <ProductThumb name={name} status={status} size="lg" photoUrl={photoUrl} />
        <label
          className="absolute -top-1.5 -right-1.5 flex size-9 cursor-pointer items-center justify-center rounded-full border-2 border-surface bg-action text-white shadow-card transition-transform active:scale-95 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
          title={photoUrl ? "Cambiar foto" : "Agregar foto"}
        >
          <Icon name="camera" className="size-4" />
          <span className="sr-only">{photoUrl ? "Cambiar foto del producto" : "Agregar foto del producto"}</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={onChange}
            disabled={pending}
            className="sr-only"
          />
        </label>
        {pending && (
          <span
            role="status"
            aria-label="Guardando foto"
            className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/35"
          >
            <span className="size-6 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none" />
          </span>
        )}
      </div>
      {photoUrl && !pending && (
        <button
          type="button"
          onClick={remove}
          className="text-xs font-semibold text-text-secondary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          Quitar foto
        </button>
      )}
      {error && (
        <p role="alert" className="max-w-32 text-center text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
