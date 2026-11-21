// Utilidades puras de fotografías de producto (sin dependencias del proyecto, probables con node:test).

// El navegador reduce la imagen antes de enviarla; el servidor la revalida con estos límites.
// La base de datos impone además un máximo de 512 KB (CHECK en product_photos.data).
export const MAX_PHOTO_BYTES = 450 * 1024;

export type PhotoType = "image/jpeg" | "image/png" | "image/webp";

// Identifica el formato por su firma (no se confía en el nombre ni en el tipo declarado).
export function sniffImageType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

// bytea en formato hexadecimal de PostgreSQL ("\x89504e...") para enviarlo por PostgREST.
export function toBytea(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

export function fromBytea(value: string): Uint8Array {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// El parámetro v (fecha de actualización) permite cachear la imagen sin servir una versión vieja.
export function photoUrl(productId: string, version: number | string) {
  return `/products/${productId}/photo?v=${version}`;
}
