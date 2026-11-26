// Lector de texto (OCR) para notas de remisión. Corre ENTERAMENTE en el navegador con
// Tesseract.js: es gratis y la foto no sale del dispositivo. La primera vez descarga el motor y
// el idioma español (unos MB) y los guarda en caché. Solo se ejecuta en el cliente.

export type OcrProgress = { percent: number; label: string };

const STATUS_LABELS: Record<string, string> = {
  "loading tesseract core": "Preparando el lector…",
  "initializing tesseract": "Preparando el lector…",
  "initialized tesseract": "Preparando el lector…",
  "loading language traineddata": "Descargando el idioma (solo la primera vez)…",
  "loaded language traineddata": "Preparando el lector…",
  "initializing api": "Preparando el lector…",
  "initialized api": "Preparando el lector…",
  "recognizing text": "Leyendo la nota…",
};

const MAX_SIDE = 2000;

// Foto en escala de grises con el contraste estirado: ayuda a leer notas con poca luz o papel
// grisáceo. Se reduce a un máximo de 2000 px para que el celular no se quede sin memoria.
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no_canvas");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const image = context.getImageData(0, 0, width, height);
  const { data } = image;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = gray;
    histogram[gray] += 1;
  }
  // Recorta el 1 % más oscuro y el 1 % más claro y estira el resto a 0-255.
  const total = width * height;
  let low = 0;
  let high = 255;
  for (let sum = 0; low < 255 && sum + histogram[low] < total * 0.01; low++) sum += histogram[low];
  for (let sum = 0; high > 0 && sum + histogram[high] < total * 0.01; high--) sum += histogram[high];
  const range = Math.max(1, high - low);
  for (let i = 0; i < data.length; i += 4) {
    const stretched = Math.max(0, Math.min(255, Math.round(((data[i] - low) * 255) / range)));
    data[i] = data[i + 1] = data[i + 2] = stretched;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

// Devuelve el texto reconocido de la foto de una nota.
export async function readNoteText(
  file: File,
  onProgress?: (progress: OcrProgress) => void,
): Promise<string> {
  const canvas = await prepare(file);
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("spa", 1, {
    logger: (message) => {
      onProgress?.({
        percent: Math.round(message.progress * 100),
        label: STATUS_LABELS[message.status] ?? "Leyendo la nota…",
      });
    },
  });
  try {
    // Una sola columna de texto con columnas separadas por espacios: lo más parecido a una nota.
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1",
    });
    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
