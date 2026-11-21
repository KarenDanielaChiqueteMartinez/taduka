// Utilidades de PRESENTACIÓN sobre filas de lots_with_status. El estado y los días restantes
// los calcula la base de datos; aquí solo se agrupan y se redactan para la interfaz.
export type LotStatus = "vencido" | "por_vencer" | "vigente";

export type LotRow = {
  id: string;
  product_id: string;
  product_name: string;
  unit: string;
  supplier_lot_code: string | null;
  entry_date: string;
  expiration_date: string;
  initial_quantity: number;
  current_quantity: number;
  days_to_expiry: number;
  status: LotStatus;
};

const STATUS_RANK: Record<LotStatus, number> = { vencido: 0, por_vencer: 1, vigente: 2 };

export function expiryText(days: number) {
  if (days < -1) return `Venció hace ${-days} días`;
  if (days === -1) return "Venció ayer";
  if (days === 0) return "Caduca hoy";
  if (days === 1) return "Caduca mañana";
  return `Caduca en ${days} días`;
}

// Lotes con existencia: los agotados no generan pérdida y no cuentan en los resúmenes.
export const withStock = (lots: LotRow[]) => lots.filter((l) => l.current_quantity > 0);

export function countByStatus(lots: LotRow[]) {
  const counts: Record<LotStatus, number> = { vencido: 0, por_vencer: 0, vigente: 0 };
  for (const l of withStock(lots)) counts[l.status] += 1;
  return counts;
}

export type ProductSummary = {
  productId: string;
  totalQuantity: number;
  worst: LotStatus | null;
  nextLot: LotRow | null; // el lote con existencia que vence primero
  lotCount: number;
  counts: Record<LotStatus, number>; // lotes con existencia por estado
  codes: string[]; // códigos de lote del proveedor (para la búsqueda)
};

// Resumen por producto: cantidad total, peor estado y próximo lote a vencer.
export function summarizeByProduct(lots: LotRow[]) {
  const map = new Map<string, ProductSummary>();
  for (const lot of withStock(lots)) {
    const current = map.get(lot.product_id) ?? {
      productId: lot.product_id,
      totalQuantity: 0,
      worst: null,
      nextLot: null,
      lotCount: 0,
      counts: { vencido: 0, por_vencer: 0, vigente: 0 },
      codes: [],
    };
    current.totalQuantity += Number(lot.current_quantity);
    current.lotCount += 1;
    current.counts[lot.status] += 1;
    if (lot.supplier_lot_code) current.codes.push(lot.supplier_lot_code);
    if (!current.worst || STATUS_RANK[lot.status] < STATUS_RANK[current.worst]) {
      current.worst = lot.status;
    }
    if (!current.nextLot || lot.expiration_date < current.nextLot.expiration_date) {
      current.nextLot = lot;
    }
    map.set(lot.product_id, current);
  }
  return map;
}

// Lotes que requieren atención: vencidos primero, luego por vencer; dentro de cada uno, el que vence antes.
export function priorityLots(lots: LotRow[]) {
  return withStock(lots)
    .filter((l) => l.status !== "vigente")
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        a.expiration_date.localeCompare(b.expiration_date),
    );
}
