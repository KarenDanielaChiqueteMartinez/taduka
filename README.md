# TADUKA

Aplicación web educativa para gestionar productos, lotes, caducidades y existencias de tienditas en México. No es un punto de venta.

Next.js (App Router) · TypeScript · Tailwind CSS · MariaDB (`mysql2`) · Vercel.

## Desarrollo

1. Crea `.env.local` con `DATABASE_URL` (`mysql://usuario:contraseña@host:puerto/base`) y, para pruebas, `DATABASE_URL_TEST` (la base debe terminar en `_test`).
2. `npm install`
3. `npm run db:migrate` aplica las migraciones de `db/migrations`.
4. `npm run dev`
5. `npm run test:db` corre las pruebas de la capa de datos (aislamiento por tienda, triggers, sesiones).

## Producción

Variables en Vercel: `DATABASE_URL`, `DATABASE_SSL` (`true` si la base exige TLS) y `DATABASE_POOL_SIZE` (por defecto bajo, ej. 3).
