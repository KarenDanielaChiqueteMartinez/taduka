// Debe coincidir con el CHECK de products.unit en la migración.
export const UNITS = [
  { value: "pieza", label: "Pieza" },
  { value: "kg", label: "Kilogramo (kg)" },
  { value: "g", label: "Gramo (g)" },
  { value: "litro", label: "Litro" },
  { value: "ml", label: "Mililitro (ml)" },
  { value: "paquete", label: "Paquete" },
  { value: "caja", label: "Caja" },
] as const;

export function unitLabel(value: string) {
  return UNITS.find((u) => u.value === value)?.label ?? value;
}

export function isUnit(value: string) {
  return UNITS.some((u) => u.value === value);
}
