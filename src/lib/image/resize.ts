// Prepara una fotografía en el navegador antes de enviarla: la recorta al centro en un cuadrado
// y la reduce (lado y calidad JPEG ajustados) para que pese poco; las fotos de celular suelen
// pesar varios MB y la base de datos limita cada foto a 512 KB. Solo se ejecuta en el cliente.
export async function resizeImageToJpeg(
  file: File,
  { size = 600, maxBytes = 250 * 1024 }: { size?: number; maxBytes?: number } = {},
): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("not_image");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  // Recorte cuadrado centrado: el lado es el menor de la imagen original.
  const side = Math.min(bitmap.width, bitmap.height);
  const sourceX = Math.round((bitmap.width - side) / 2);
  const sourceY = Math.round((bitmap.height - side) / 2);
  const target = Math.max(1, Math.min(size, side));

  const canvas = document.createElement("canvas");
  canvas.width = target;
  canvas.height = target;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no_canvas");
  // Fondo blanco: los PNG con transparencia no se vuelven negros al pasar a JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, target, target);
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, target, target);
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
