"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onDetect: (code: string) => void;
  onCancel: () => void;
};

const CAMERA_ERROR =
  "No pudimos usar la cámara. Revisa el permiso del navegador o escribe el código a mano.";
const PHOTO_ERROR =
  "No encontramos un código en la foto. Acércate un poco, enfoca bien y evita reflejos.";

// La librería se descarga solo al escanear (funciona también en iPhone, donde BarcodeDetector no
// existe). Se limita a los formatos de productos y se activa la lectura exhaustiva.
async function createReader() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const hints = new Map<unknown, unknown>([
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
        BarcodeFormat.QR_CODE,
      ],
    ],
    [DecodeHintType.TRY_HARDER, true],
  ]) as Map<import("@zxing/library").DecodeHintType, unknown>;
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
}

// Lee códigos de barras y QR con la cámara trasera, en vivo o a partir de una foto.
// Requiere HTTPS.
export function BarcodeScanner({ onDetect, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(true);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detected, setDetected] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Evita que un mismo código dispare onDetect más de una vez.
  const handledRef = useRef(false);
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  });

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    let stop: (() => void) | undefined;

    async function start() {
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        setError(CAMERA_ERROR);
        setStarting(false);
        return;
      }
      try {
        const reader = await createReader();
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          video,
          (result, _error, scanControls) => {
            if (!result || handledRef.current) return;
            handledRef.current = true;
            setDetected(true);
            navigator.vibrate?.(60);
            // Deja ver el recuadro en verde un instante antes de cerrar la cámara.
            const code = result.getText();
            timerRef.current = setTimeout(() => {
              scanControls.stop();
              onDetectRef.current(code);
            }, 700);
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        stop = () => controls.stop();
        setStarting(false);
      } catch {
        if (!cancelled) {
          setError(CAMERA_ERROR);
          setStarting(false);
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
      stop?.();
    };
  }, [live]);

  function resumeLive() {
    setError(null);
    setStarting(true);
    setLive(true);
  }

  // La cámara del sistema enfoca y captura mejor que el video en vivo, sobre todo en iPhone.
  async function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      resumeLive();
      return;
    }
    setBusy(true);
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      const reader = await createReader();
      const result = await reader.decodeFromImageUrl(url);
      handledRef.current = true;
      onDetectRef.current(result.getText());
    } catch {
      setError(PHOTO_ERROR);
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {live ? (
        <>
          <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-black">
            <video ref={videoRef} playsInline muted autoPlay className="size-full object-cover" />
            {!error && (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-[12%] top-1/2 h-[38%] -translate-y-1/2 rounded-2xl border-4 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)] transition-colors duration-200 ${
                  detected ? "border-action" : starting ? "border-white/80" : "border-danger"
                }`}
              />
            )}
            {starting && !error && (
              <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">
                Abriendo cámara…
              </p>
            )}
          </div>
          {!error && (
            <p
              role="status"
              className={`text-center text-sm ${detected ? "font-bold text-action" : "text-text-secondary"}`}
            >
              {detected
                ? "¡Código detectado!"
                : "Centra el código en el recuadro y aléjate unos 15 cm hasta que enfoque."}
            </p>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={resumeLive}
          disabled={busy}
          className="min-h-12 w-full rounded-control bg-action-soft text-base font-bold text-action transition-colors hover:bg-[#d3eddc] focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
        >
          {busy ? "Leyendo la foto…" : "Escanear en vivo"}
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <label
        onClick={() => setLive(false)}
        className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control bg-action text-base font-bold text-white transition-colors hover:bg-action-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
      >
        Tomar foto del código
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPhoto}
          className="sr-only"
        />
      </label>
      <button
        type="button"
        onClick={onCancel}
        className="min-h-12 w-full rounded-control bg-surface-muted text-base font-semibold text-text-primary transition-colors hover:bg-border/60 focus-visible:outline-2 focus-visible:outline-primary"
      >
        Escribir el código a mano
      </button>
    </div>
  );
}
