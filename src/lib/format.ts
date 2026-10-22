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
