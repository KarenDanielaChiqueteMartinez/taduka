const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

// Las fechas de lote son `date` (YYYY-MM-DD) sin zona horaria.
export function formatDate(iso: string) {
  return dateFormatter.format(new Date(`${iso}T00:00:00Z`));
}

export function formatQuantity(value: number | string) {
  return Number(value).toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

// Fecha de hoy (YYYY-MM-DD) en la zona de la tienda; coincide con la vista lots_with_status.
export function todayInStoreTimezone() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mazatlan" }).format(
    new Date(),
  );
}

const SHORT_UNITS: Record<string, [string, string]> = {
  pieza: ["pza", "pzas"],
  kg: ["kg", "kg"],
  g: ["g", "g"],
  litro: ["L", "L"],
  ml: ["ml", "ml"],
  paquete: ["paquete", "paquetes"],
  caja: ["caja", "cajas"],
};

// "5 pzas", "1 pza", "2.5 kg", "3 L"
export function formatQty(value: number | string, unit: string) {
  const n = Number(value);
  const [singular, plural] = SHORT_UNITS[unit] ?? [unit, unit];
  return `${formatQuantity(n)} ${n === 1 ? singular : plural}`;
}

const TZ = "America/Mazatlan";

export function greeting(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

// "jueves, 22 de octubre" en la zona de la tienda.
export function longDate(now: Date) {
  const text = new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  // Inicia en mayúscula: "Miércoles, 21 de octubre".
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Fecha y hora de un instante (timestamptz) en la zona de la tienda.
export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function dayKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

export function dayLabel(key: string, todayKey: string) {
  if (key === todayKey) return "Hoy";
  const d = new Date(`${key}T00:00:00Z`);
  const y = new Date(`${todayKey}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (d.getTime() === y.getTime()) return "Ayer";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}