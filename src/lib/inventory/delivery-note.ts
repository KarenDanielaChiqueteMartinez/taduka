// Interpretación del texto que el lector (OCR) saca de una nota de remisión, y enlace de cada
// línea con los productos de la tienda. Son funciones puras: no tocan la red ni la base de datos.
// El OCR se equivoca con frecuencia, así que todo lo que sale de aquí es una SUGERENCIA que la
// persona revisa y corrige antes de guardar nada.

export type NoteLine = { description: string; quantity: number };
export type ProductRef = { id: string; name: string };
export type ProductMatch = { productId: string; score: number };

// Renglones que no son productos: encabezados, totales, datos del cliente, firmas…
const SKIP =
  /\b(total|subtotal|sub total|iva|i\.v\.a|importe|folio|fecha|cliente|rfc|direccion|domicilio|telefono|tel|remision|nota|proveedor|recibi|recibido|firma|observaciones|gracias|pagar|pago|credito|vendedor|chofer|ruta|descripcion|cantidad|cant|precio|unitario|p\.? ?unit|unidad|producto|articulo|codigo|cod|factura|hoja|pagina|folio|surtido|entrega|entrego|autorizo)\b/i;

const UNITS = "pzas?|pz|pzs|piezas?|cajas?|cja|cjs|paq|paquetes?|bolsas?|bultos?|bto|kgs?|kilos?|lts?|litros?|uds?|unidades?|pack|dz|docenas?";
const NUMBER = String.raw`\d{1,4}(?:[.,]\d{1,3})?`;

const START_QTY = new RegExp(`^(${NUMBER})\\s*(?:(?:${UNITS})\\.?\\s+)?(.+)$`, "i");
const END_QTY = new RegExp(`^(.+?)\\s+(${NUMBER})\\s*(?:${UNITS})\\.?$`, "i");
const MONEY = /^\$?\d{1,6}[.,]\d{2}$|^\$\d+$/;
const BARCODE = /^\d{8,14}$/;

function toNumber(raw: string) {
  return Number(raw.replace(",", "."));
}

function clean(line: string) {
  return line
    .replace(/[|_¦]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function plain(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Quita precios e importes del final y códigos de barras del principio.
function stripMoneyAndCodes(tokens: string[]) {
  let list = [...tokens];
  while (list.length > 1 && MONEY.test(list[list.length - 1])) list.pop();
  if (list.length > 1 && BARCODE.test(list[0])) list = list.slice(1);
  return list;
}

function usableDescription(text: string) {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return letters >= 3 ? text : null;
}

// Convierte el texto reconocido en líneas de producto (descripción y cantidad). Prueba dos
// formas comunes: "12 YOGUR FRESA 145 G" (cantidad primero) y "YOGUR FRESA 145 G 12 PZAS"
// (cantidad con unidad al final). Lo que no encaja se descarta; la persona puede agregarlo.
export function parseNoteText(text: string): NoteLine[] {
  const result: NoteLine[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = clean(rawLine);
    if (line.length < 4 || SKIP.test(plain(line))) continue;

    const working = stripMoneyAndCodes(line.split(" ")).join(" ");
    if (!working.includes(" ")) continue;

    let quantity: number | null = null;
    let description: string | null = null;

    // El código de barras estaba al inicio y ya se quitó; ahora se busca la cantidad.
    const start = START_QTY.exec(working);
    if (start && !BARCODE.test(start[1])) {
      quantity = toNumber(start[1]);
      // Quita precios que hayan quedado al final de la descripción.
      description = usableDescription(stripMoneyAndCodes(start[2].split(" ")).join(" "));
    }

    if (description === null) {
      const end = END_QTY.exec(working);
      if (end) {
        quantity = toNumber(end[2]);
        description = usableDescription(stripMoneyAndCodes(end[1].split(" ")).join(" "));
      }
    }

    if (description && quantity !== null && Number.isFinite(quantity) && quantity > 0 && quantity <= 9999) {
      result.push({ description, quantity });
    }
  }
  return result;
}

// --- Enlace con los productos de la tienda ----------------------------------------------------

const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "con", "sin", "y", "en", "para", "por", "pza", "pzas", "pieza", "piezas", "caja", "cajas", "paq"]);

function tokensOf(name: string) {
  const text = plain(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    // El OCR a veces pega palabra y medida ("entera1l"): se separan antes de unir "1 l" -> "1l".
    .replace(/([a-z]{3,})(\d)/g, "$1 $2")
    // "145 g" / "1 l" se vuelven un solo término: "145g" / "1l".
    .replace(/(\d+)\s+(g|gr|grs|gramos|ml|kg|kgs|lt|lts|l|litro|litros)\b/g, (_m, n: string, u: string) => {
      const unit = u.startsWith("g") ? "g" : u.startsWith("k") ? "kg" : u === "ml" ? "ml" : "l";
      return `${n}${unit}`;
    })
    .trim();
  return text.split(" ").filter((t) => t && !STOPWORDS.has(t));
}

function editDistanceAtMostOne(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function similarTokens(a: string, b: string) {
  if (a === b) return true;
  const shortest = Math.min(a.length, b.length);
  if (shortest >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return shortest >= 5 && editDistanceAtMostOne(a, b);
}

// Similitud entre dos nombres (0 a 1): coeficiente de Dice sobre sus términos, tolerando
// abreviaturas ("yog" ~ "yogur") y una letra mal leída por el OCR.
export function similarity(a: string, b: string) {
  const left = tokensOf(a);
  const right = tokensOf(b);
  if (left.length === 0 || right.length === 0) return 0;
  const used = new Set<number>();
  let hits = 0;
  for (const token of left) {
    const index = right.findIndex((other, i) => !used.has(i) && similarTokens(token, other));
    if (index >= 0) {
      used.add(index);
      hits += 1;
    }
  }
  return (2 * hits) / (left.length + right.length);
}

// Mejores coincidencias de una descripción entre los productos de la tienda.
export function rankProducts(description: string, products: ProductRef[], limit = 3): ProductMatch[] {
  return products
    .map((p) => ({ productId: p.id, score: similarity(description, p.name) }))
    .filter((m) => m.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

// Umbral para preseleccionar un producto; por debajo, la persona lo elige.
export const AUTO_MATCH_SCORE = 0.5;
