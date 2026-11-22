"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onDetect: (code: string) => void;
  onCancel: () => void;
};

const CAMERA_ERROR =
  "No pudimos usar la cámara. Revisa el permiso del navegador o escribe el código a mano.";

// Lee códigos de barras y QR con la cámara trasera. La librería se descarga solo al escanear
// (funciona también en iPhone, donde BarcodeDetector no existe). Requiere HTTPS.
export function BarcodeScanner({ onDetect, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  // Evita que un mismo código dispare onDetect más de una vez.
  const handledRef = useRef(false);
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  });

  useEffect(() => {
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
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          video,
          (result, _error, scanControls) => {
            if (!result || handledRef.current) return;
            handledRef.current = true;
            scanControls.stop();
            navigator.vibrate?.(60);
            onDetectRef.current(result.getText());
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
      stop?.();
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-black">
        <video ref={videoRef} playsInline muted autoPlay className="size-full object-cover" />
        {!error && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[38%] -translate-y-1/2 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
          />
        )}
        {starting && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">
            Abriendo cámara…
          </p>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : (
        <p className="text-center text-sm text-text-secondary">
          Apunta la cámara al código de barras o QR.
        </p>
      )}
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
