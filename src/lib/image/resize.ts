// Reduce una fotografía en el navegador antes de enviarla: lado máximo y calidad JPEG ajustados
// para que pese poco (las fotos de celular suelen pesar varios MB). Solo se ejecuta en el cliente.
export async function resizeImageToJpeg(
  file: File,
  { maxSide = 640, maxBytes = 400 * 1024 }: { maxSide?: number; maxBytes?: number } = {},
): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("not_image");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no_canvas");
  // Fondo blanco: los PNG con transparencia no se vuelven negros al pasar a JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const toBlob = (quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

  let blob: Blob | null = null;
  for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46, 0.36]) {
    blob = await toBlob(quality);
    if (blob && blob.size <= maxBytes) break;
  }
  if (!blob || blob.size > maxBytes) throw new Error("too_big");
  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}
