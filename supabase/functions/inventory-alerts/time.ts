// Zona horaria de las tiendas. Cron de Supabase corre en GMT (cron.timezone), así que la
// función decide la hora local por su cuenta: no depende de la zona de pg_cron.
export const STORE_TIMEZONE = "America/Mazatlan";

// El resumen diario se envía en la primera ejecución entre las 07:00 y las 11:59 locales
// (si falla, las ejecuciones horarias siguientes lo reintentan dentro de esa ventana).
export const SUMMARY_START_HOUR = 7;
export const SUMMARY_END_HOUR = 12;

export function localDateTime(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}
