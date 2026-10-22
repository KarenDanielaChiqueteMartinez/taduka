# TADUKA

Aplicación web educativa para gestionar productos, lotes, caducidades y existencias de tienditas en México. No es un punto de venta.

## Stack
Next.js (App Router), TypeScript, Tailwind CSS, Supabase (PostgreSQL + Auth), Vercel y Git.

## Instrucciones
- Para el diseño, consulta `TADUKA_Premium_UI_Design.md`. No dupliques sus especificaciones aquí.
- Inspecciona el proyecto antes de modificar archivos y reutiliza el código existente.
- Trabaja por etapas pequeñas; implementa, verifica y corrige antes de avanzar.
- Sé conciso. Evita explicaciones repetidas, dependencias innecesarias y regenerar archivos sin motivo.
- Usa datos reales de Supabase en funciones implementadas; no inventes resultados.
- Protege los datos con RLS y aislamiento por tienda. Nunca expongas secretos ni `service_role` en el cliente.
- Los productos pueden tener varios lotes con distintas caducidades. Las fechas se confirman manualmente.
- Los conteos y ajustes no equivalen a ventas.
- No afirmes haber probado algo si no lo ejecutaste.

## Alcance actual
Interfaces responsive y conexión real con Supabase: autenticación, dashboard, productos, lotes y movimientos de inventario.

OCR, IA, notificaciones automáticas, pagos y sincronización offline quedan fuera de esta etapa.

## Forma de trabajo
Primero inspecciona el entorno y el proyecto. Propón el siguiente paso concreto y espera confirmación cuando una decisión afecte la arquitectura. Antes de crear las tablas, presenta el esquema relacional para aprobación.