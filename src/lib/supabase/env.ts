// Las variables NEXT_PUBLIC_* deben leerse con acceso estático para que Next.js
// las incluya en el bundle del navegador.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url) {
  throw new Error(
    "Falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL. Defínela en .env.local.",
  );
}

if (!publishableKey) {
  throw new Error(
    "Falta la variable de entorno NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Defínela en .env.local.",
  );
}

export const supabaseUrl: string = url;
export const supabasePublishableKey: string = publishableKey;
