import type { PaddleOcrService } from "ppu-paddle-ocr/web";
import type { OcrBox } from "@/lib/inventory/delivery-note";

// Lector de texto (OCR) para notas de remisión. Corre ENTERAMENTE en el navegador con PaddleOCR
// (modelos PP-OCRv6 sobre ONNX Runtime Web): es gratis y la foto no sale del dispositivo. La
// primera vez descarga el motor y los modelos (unos MB) y el navegador los guarda en caché.
// Solo se ejecuta en el cliente.

// percent es null cuando el lector no informa avance (la descarga y la lectura no lo reportan).
export type OcrProgress = { percent: number | null; label: string };

// Lado máximo de la foto que se le da al lector: las fotos de celular (12 MP) son innecesariamente
// grandes y harían la lectura lenta y con mucha memoria.
const MAX_SIDE = 1800;

// El servicio se crea una sola vez por página: cargar los modelos es lo más tardado.
let servicePromise: Promise<PaddleOcrService> | null = null;

function getService(): Promise<PaddleOcrService> {
  servicePromise ??= (async () => {
    const { PaddleOcrService } = await import("ppu-paddle-ocr/web");
    const service = new PaddleOcrService();
    await service.initialize();
    return service;
  })().catch((error) => {
    // Si falla (p. ej. sin conexión al descargar), el siguiente intento vuelve a probar.
    servicePromise = null;
    throw error;
  });
  return servicePromise;
}

async function toCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no_canvas");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas;
}

// El modelo no admite dos lecturas a la vez ("Session already started"): se hacen en fila.
let queue: Promise<unknown> = Promise.resolve();

// Texto reconocido de la foto de una nota y las palabras agrupadas por renglón con su posición.
export type OcrResult = { text: string; rows: OcrBox[][] };

export function readNote(
  file: File,
  onProgress?: (progress: OcrProgress) => void,
): Promise<OcrResult> {
  const run = async () => {
    onProgress?.({ percent: null, label: "Preparando el lector (la primera vez descarga unos MB)…" });
    const [canvas, service] = await Promise.all([toCanvas(file), getService()]);
    onProgress?.({ percent: null, label: "Leyendo la nota…" });
    const result = await service.recognize(canvas);
    return {
      text: result.text,
      rows: result.lines.map((row) =>
        row.map((b) => ({ text: b.text, x: b.box.x, y: b.box.y, width: b.box.width, height: b.box.height })),
      ),
    };
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}
