"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveNoteLots, type NoteFormState } from "@/lib/lots/note-actions";
import { readNoteText, type OcrProgress } from "@/lib/image/ocr";
import { AUTO_MATCH_SCORE, parseNoteText, rankProducts } from "@/lib/inventory/delivery-note";
import { FormHeader } from "@/components/app/form-header";
import { ScreenHeader } from "@/components/app/screen-header";
import { buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { SelectField } from "@/components/ui/select-field";
import { useToast } from "@/components/ui/toast";

type Product = { id: string; name: string; unitLabel: string };

type Props = {
  storeName: string;
  products: Product[];
  today: string;
};

type Line = {
  key: string;
  description: string;
  productId: string;
  quantity: string;
  expirationDate: string;
  included: boolean;
};

type Stage = "capture" | "reading" | "review";

// Tiempo mínimo que se ve la animación de lectura, para que no parpadee con fotos rápidas.
const MIN_READ_MS = 600;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function blankLine(): Line {
  return {
    key: crypto.randomUUID(),
    description: "",
    productId: "",
    quantity: "",
    expirationDate: "",
    included: true,
  };
}

// Notas de remisión: la foto se lee EN EL DISPOSITIVO (gratis, no se sube ni se guarda), se
// sugieren producto y cantidad por línea y la persona revisa todo antes de guardar. Las fechas
// de caducidad nunca se suponen: se capturan a mano.
export function NoteScanner({ storeName, products, today }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [state, action] = useActionState<NoteFormState, FormData>(saveNoteLots, {});

  const [stage, setStage] = useState<Stage>("capture");
  const [progress, setProgress] = useState<OcrProgress>({ percent: 0, label: "Preparando el lector…" });
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [bulkDate, setBulkDate] = useState("");
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  // Lotes guardados: avisa con una notificación y abre la lista de lotes.
  useEffect(() => {
    if (!state.created) return;
    toast.show(state.created === 1 ? "1 lote registrado." : `${state.created} lotes registrados.`);
    router.push("/lots");
  }, [state, toast, router]);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    setPreview(urlRef.current);
    setError(null);
    setProgress({ percent: 0, label: "Preparando el lector…" });
    setStage("reading");

    try {
      const [text] = await Promise.all([readNoteText(file, setProgress), sleep(MIN_READ_MS)]);
      setRawText(text);
      setLines(
        parseNoteText(text).map((parsed) => {
          const best = rankProducts(parsed.description, products, 1)[0];
          return {
            key: crypto.randomUUID(),
            description: parsed.description,
            productId: best && best.score >= AUTO_MATCH_SCORE ? best.productId : "",
            quantity: String(parsed.quantity),
            expirationDate: "",
            included: true,
          };
        }),
      );
      setStage("review");
    } catch {
      setError("No pudimos leer esa foto. Revisa la conexión (la primera vez descarga el lector) e inténtalo de nuevo.");
      setStage("capture");
    }
  }

  const update = (key: string, patch: Partial<Line>) =>
    setLines((list) => list.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const includedCount = lines.filter((l) => l.included).length;

  // --- Captura y lectura ----------------------------------------------------------------------
  if (stage !== "review") {
    const reading = stage === "reading";
    const corner = "absolute size-9 border-accent";
    return (
      <>
        <ScreenHeader title="Fotografiar nota" storeName={storeName} backHref="/dashboard" />
        <div className="space-y-4">
          <section
            aria-label="Vista previa de la nota"
            className="tadu-rise relative overflow-hidden rounded-panel bg-primary-deep shadow-card"
          >
            <div className="relative aspect-[4/5] w-full sm:aspect-[4/3]">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Fotografía de la nota de remisión" className="absolute inset-0 size-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-white/80">
                  <span className="flex size-16 items-center justify-center rounded-full bg-white/10">
                    <Icon name="camera" className="size-8" strokeWidth={1.8} />
                  </span>
                  <p className="text-sm">Encuadra la nota de remisión del proveedor dentro del marco.</p>
                </div>
              )}
              {reading && (
                <div
                  role="status"
                  aria-live="polite"
                  className="tadu-shimmer absolute inset-0 flex flex-col items-center justify-end gap-3 overflow-hidden bg-black/45 px-6 pb-8 text-white"
                >
                  <span
                    aria-hidden="true"
                    className="size-9 animate-spin rounded-full border-[3px] border-white border-t-transparent motion-reduce:animate-none"
                  />
                  <p className="text-sm font-semibold">{progress.label}</p>
                  <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/25">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-200"
                      style={{ width: `${Math.max(4, progress.percent)}%` }}
                    />
                  </div>
                </div>
              )}
              <span aria-hidden="true" className={`${corner} top-4 left-4 rounded-tl-2xl border-t-4 border-l-4`} />
              <span aria-hidden="true" className={`${corner} top-4 right-4 rounded-tr-2xl border-t-4 border-r-4`} />
              <span aria-hidden="true" className={`${corner} bottom-4 left-4 rounded-bl-2xl border-b-4 border-l-4`} />
              <span aria-hidden="true" className={`${corner} right-4 bottom-4 rounded-br-2xl border-r-4 border-b-4`} />
            </div>
          </section>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger">
              <Icon name="alert-triangle" className="mt-0.5 size-4" />
              {error}
            </p>
          )}

          {!reading && (
            <div className="space-y-2.5">
              <label
                className={`${buttonClass("primary", "lg", "w-full cursor-pointer")} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary`}
              >
                <Icon name="camera" className="size-5" />
                Tomar fotografía
                <input type="file" accept="image/*" capture="environment" onChange={onPick} className="sr-only" />
              </label>
              <label
                className={`${buttonClass("secondary", "md", "w-full cursor-pointer")} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary`}
              >
                Elegir de la galería
                <input type="file" accept="image/*" onChange={onPick} className="sr-only" />
              </label>
            </div>
          )}

          <ul className="space-y-1.5 text-xs text-text-secondary">
            <li className="flex items-start gap-2">
              <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
              La foto se lee en tu dispositivo: no se envía ni se guarda en ningún servicio.
            </li>
            <li className="flex items-start gap-2">
              <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
              Mejor resultado: nota plana, con buena luz, sin sombras y letra impresa. La primera lectura
              descarga el lector y tarda un poco más.
            </li>
          </ul>
        </div>
      </>
    );
  }

  // --- Revisión -------------------------------------------------------------------------------
  return (
    <form action={action} noValidate className="space-y-4">
      <FormHeader
        title="Revisar nota"
        cancelHref="/dashboard"
        submitLabel="Guardar lotes"
        submitIcon="check"
        pendingLabel="Guardando…"
      />

      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger">
          <Icon name="alert-triangle" className="mt-0.5 size-4" />
          {state.error}
        </p>
      )}

      <section className="tadu-rise flex items-center gap-3 rounded-card bg-surface-muted p-3.5">
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Foto de la nota" className="size-16 shrink-0 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            {lines.length === 0
              ? "No encontramos productos en la foto"
              : `${lines.length} ${lines.length === 1 ? "línea leída" : "líneas leídas"}`}
          </p>
          <p className="text-xs text-text-secondary">
            Es una lectura automática: revisa producto y cantidad. La caducidad la escribes tú.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStage("capture")}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-action-soft px-3.5 text-sm font-semibold text-action transition-colors hover:bg-[#d3eddc] focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="refresh" className="size-4" />
          Repetir
        </button>
      </section>

      <section className="tadu-rise space-y-3 rounded-card border border-border/70 bg-surface p-4 shadow-card">
        <Field id="entryDate" label="Fecha de entrada" type="date" required defaultValue={today} />
        <div className="space-y-1.5">
          <label htmlFor="bulk-date" className="text-sm font-semibold text-text-primary">
            Caducidad para todas las líneas incluidas
          </label>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <input
                id="bulk-date"
                type="date"
                value={bulkDate}
                onChange={(event) => setBulkDate(event.target.value)}
                className="h-12 w-full rounded-control border border-border bg-surface-muted/60 px-4 text-base text-text-primary focus-visible:border-action focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-action/40"
              />
            </div>
            <button
              type="button"
              disabled={!bulkDate}
              onClick={() =>
                setLines((list) => list.map((l) => (l.included ? { ...l, expirationDate: bulkDate } : l)))
              }
              className={buttonClass("soft", "md", "h-12 shrink-0")}
            >
              Aplicar
            </button>
          </div>
          <p className="text-xs text-text-secondary">Útil si todo lo de la nota caduca el mismo día. Puedes cambiar cada línea.</p>
        </div>
      </section>

      <ul className="space-y-3">
        {lines.map((line) => {
          const product = products.find((p) => p.id === line.productId);
          const lineError = state.lineErrors?.[line.key];
          const off = !line.included;
          return (
            <li
              key={line.key}
              className={`tadu-rise space-y-3 rounded-card border bg-surface p-4 shadow-card ${
                lineError ? "border-danger" : "border-border/70"
              } ${off ? "opacity-60" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={line.included}
                    onChange={(event) => update(line.key, { included: event.target.checked })}
                    className="size-5 accent-action"
                  />
                  Incluir
                </label>
                {line.description && (
                  <p className="min-w-0 truncate text-xs text-text-secondary">
                    Leído: <span className="font-mono">{line.description}</span>
                  </p>
                )}
              </div>

              <input type="hidden" name="lineId" value={line.key} disabled={off} />

              <SelectField
                id={`product-${line.key}`}
                name="productId"
                label="Producto"
                disabled={off}
                value={line.productId}
                onChange={(event) => update(line.key, { productId: event.target.value })}
              >
                <option value="" disabled>
                  Elige un producto…
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  id={`qty-${line.key}`}
                  name="quantity"
                  label={`Cantidad${product ? ` (${product.unitLabel.toLowerCase()})` : ""}`}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  disabled={off}
                  value={line.quantity}
                  onChange={(event) => update(line.key, { quantity: event.target.value })}
                />
                <Field
                  id={`exp-${line.key}`}
                  name="expirationDate"
                  label="Caducidad"
                  type="date"
                  required
                  disabled={off}
                  value={line.expirationDate}
                  onChange={(event) => update(line.key, { expirationDate: event.target.value })}
                />
              </div>

              {lineError && <p className="text-sm font-medium text-danger">{lineError}</p>}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => setLines((list) => [...list, blankLine()])}
        className={buttonClass("secondary", "md", "w-full")}
      >
        <Icon name="plus" className="size-4" strokeWidth={2.6} />
        Agregar línea
      </button>

      <p className="text-center text-xs text-text-secondary">
        {includedCount === 0
          ? "No hay líneas incluidas."
          : `Se guardará ${includedCount === 1 ? "1 lote" : `${includedCount} lotes`}.`}
      </p>

      {rawText.trim() && (
        <details className="rounded-control border border-border bg-surface px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">Ver el texto que leyó la cámara</summary>
          <pre className="mt-3 max-h-64 overflow-auto text-xs whitespace-pre-wrap text-text-secondary">{rawText}</pre>
        </details>
      )}
    </form>
  );
}
