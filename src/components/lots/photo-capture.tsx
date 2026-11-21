"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass, LinkButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

// Interfaz del flujo "fotografiar nota". La imagen solo se muestra en este dispositivo:
// no se sube, no se procesa y no hay OCR todavía.
export function PhotoCapture() {
  const [preview, setPreview] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    setPreview(urlRef.current);
    e.target.value = "";
  }

  const corner = "absolute size-9 border-accent";
  return (
    <div className="space-y-4">
      {/* Cámara / vista previa */}
      <section
        aria-label="Vista previa de la nota"
        className="tadu-rise relative overflow-hidden rounded-panel bg-primary-deep shadow-card"
      >
        <div className="relative aspect-[4/5] w-full sm:aspect-[4/3]">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Fotografía de la nota de compra" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-white/80">
              <span className="flex size-16 items-center justify-center rounded-full bg-white/10">
                <Icon name="camera" className="size-8" strokeWidth={1.8} />
              </span>
              <p className="text-sm">Encuadra la nota de entrega del proveedor dentro del marco.</p>
            </div>
          )}
          {/* Marco de captura */}
          <span aria-hidden="true" className={`${corner} top-4 left-4 rounded-tl-2xl border-t-4 border-l-4`} />
          <span aria-hidden="true" className={`${corner} top-4 right-4 rounded-tr-2xl border-t-4 border-r-4`} />
          <span aria-hidden="true" className={`${corner} bottom-4 left-4 rounded-bl-2xl border-b-4 border-l-4`} />
          <span aria-hidden="true" className={`${corner} right-4 bottom-4 rounded-br-2xl border-r-4 border-b-4`} />
          <span className="absolute inset-x-0 bottom-5 mx-auto w-fit rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white">
            {preview ? "Fotografía lista" : "Guía de nota de remisión"}
          </span>
        </div>
      </section>

      <div className="flex gap-3">
        <label
          className={`${buttonClass("primary", "lg", "flex-1 cursor-pointer")} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary`}
        >
          <Icon name={preview ? "refresh" : "camera"} className="size-5" />
          {preview ? "Repetir fotografía" : "Tomar fotografía"}
          <input type="file" accept="image/*" capture="environment" onChange={onPick} className="sr-only" />
        </label>
      </div>
      <p className="flex items-start gap-2 text-xs text-text-secondary">
        <Icon name="info" className="mt-0.5 size-3.5" />
        La fotografía solo se muestra en tu dispositivo: no se guarda ni se envía a ningún servicio.
      </p>

      {/* Datos reconocidos (ejemplo ilustrativo) */}
      <section className="tadu-rise rounded-card border border-border/70 bg-surface p-4 shadow-card" aria-labelledby="recognized-title">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="recognized-title" className="text-base font-bold">
            Datos reconocidos
          </h2>
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning">Ejemplo</span>
        </div>
        <ul className="space-y-2" aria-label="Ejemplo ilustrativo de datos reconocidos">
          {[
            ["Yogur de fresa 145 g", "12 pzas"],
            ["Leche entera 1 L", "10 pzas"],
          ].map(([name, qty]) => (
            <li
              key={name}
              className="flex items-center justify-between gap-3 rounded-control bg-surface-muted/70 px-3.5 py-3 text-text-secondary"
            >
              <span className="text-sm font-medium">{name}</span>
              <span className="text-sm font-bold">{qty}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-start gap-2 rounded-control bg-primary-soft/60 px-3.5 py-3 text-sm text-primary">
          <Icon name="info" className="mt-0.5 size-4" />
          <span>
            Estos datos son un <strong>ejemplo visual</strong>. El reconocimiento automático de notas aún no
            está disponible: captura el lote manualmente.
          </span>
        </p>
      </section>

      <div className="space-y-2">
        <LinkButton href="/lots/new" size="lg" className="w-full">
          <Icon name="pencil" className="size-5" />
          Revisar y capturar datos
        </LinkButton>
      </div>
    </div>
  );
}
