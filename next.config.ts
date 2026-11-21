import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Solo desarrollo: permite abrir el servidor desde el teléfono por la IP de la red local
  // (sin esto Next bloquea los recursos de desarrollo y los componentes de cliente no se activan).
  // 192.168.137.1 = IP de la computadora cuando ella comparte su propio "Punto de acceso móvil" de Windows.
  // *.trycloudflare.com: túneles temporales de Cloudflare para probar desde el teléfono.
  allowedDevOrigins: [
    "192.168.142.109",
    "192.168.1.69",
    "172.20.10.2",
    "192.168.137.1",
    "127.0.0.1",
    "*.trycloudflare.com",
  ],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
