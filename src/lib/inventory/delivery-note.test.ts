import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUTO_MATCH_SCORE,
  parseNoteRows,
  parseNoteText,
  rankProducts,
  similarity,
  type OcrBox,
} from "./delivery-note.ts";

// Renglones como los entrega el OCR (de una foto inclinada): con datos del proveedor arriba,
// precios en columna aparte, observaciones y firma abajo.
const box = (text: string, x: number, y: number, width = 300, height = 50): OcrBox => ({ text, x, y, width, height });
const ROWS: OcrBox[][] = [
  [box("LACTEOS DEL VALLE S.A. de C.V.", 60, 20, 600)],
  [box("Dirección: Av. Obregón 123, Culiacán", 60, 80, 700), box("Tel 667 123 4567", 800, 70, 250)],
  [box("NOTA DE REMISION Folio 004821", 52, 140, 591)],
  [box("Cliente: Super Azul", 59, 200, 316), box("Fecha: 22/11/2026", 427, 190, 301)],
  [box("Cant. Descripción", 62, 260, 320), box("Precio Importe", 576, 250, 273)],
  [box("12 Yogur Fresa 145 g", 66, 330, 388), box("$9.50 $114.00", 581, 320, 267)],
  [box("10", 68, 410, 68), box("Leche Entera 1L", 145, 400, 288)],
  [box("$24.00 $240.00", 577, 385, 275)],
  [box("6", 70, 480, 42), box("Galletas María 170 g", 147, 470, 340), box("$15.50", 590, 460, 120)],
  [box("Entregar antes de las 8 am", 150, 540, 400)],
  [box("24", 74, 600, 71), box("Refresco Cola 600 ml", 154, 590, 356)],
  [box("$14.00 $336.00", 611, 570, 277)],
  [box("Total", 79, 680, 104), box("$994.50", 580, 670, 147)],
  [box("Observaciones: favor de revisar caducidades", 60, 750, 700)],
  [box("3 Recibió: ______________ Firma", 60, 820, 600)],
];

test("por posición: solo productos, sin proveedor, precios, notas ni firmas", () => {
  assert.deepEqual(parseNoteRows(ROWS), [
    { description: "Yogur Fresa 145 g", quantity: 12 },
    { description: "Leche Entera 1L", quantity: 10 },
    { description: "Galletas María 170 g", quantity: 6 },
    { description: "Refresco Cola 600 ml", quantity: 24 },
  ]);
});

test("nota real de carnicería (letra manuscrita): solo sus 3 productos", () => {
  // Renglones tal como los entregó PaddleOCR con lectura por caja sobre una foto real.
  const real: OcrBox[][] = [
  [box("CARNICERIA", 323, 48, 454, 55), box("FOLIO", 850, 48, 131, 30)],
  [box("2", 194, 147, 20, 19)],
  [box("气", 136, 160, 15, 18)],
  [box("王AFA在A", 249, 129, 593, 114), box("251126", 840, 159, 164, 43), box("FECHA", 843, 124, 154, 36)],
  [box("Sixto Guillermo Mera Sánchez", 166, 250, 774, 43)],
  [box("RFC: MESS680806 923", 273, 295, 551, 38)],
  [box("victormera28@yahoo.com.mx", 229, 338, 646, 42)],
  [box("Cel. (442) 3 19 90 51, (442) 3 30 90 49", 257, 392, 621, 42)],
  [box("Tel.2 98 00 26,4 55 20 25", 306, 446, 520, 38)],
  [box("Av. de la Piedra No. 902, Col. Satélite, C.P. 76110, Querétaro, Qro.", 100, 494, 910, 38)],
  [box("SR. (A) Karen Daniela Chiavete Mtz.", 93, 557, 850, 55)],
  [box("CANT.", 92, 630, 135, 43), box("ARTICULO", 303, 634, 226, 38), box("PRECIO", 623, 634, 172, 38), box("IMPORTE", 803, 634, 184, 38)],
  [box("1", 128, 675, 53, 54), box("Milanesa de res", 237, 684, 329, 43), box("$180.00", 628, 683, 158, 42), box("$180.00", 807, 684, 167, 42)],
  [box("0.750", 98, 738, 114, 43), box("Carne molida", 236, 735, 292, 47), box("$140.00", 625, 734, 163, 47), box("$105.00", 805, 735, 170, 43)],
  [box("1", 132, 782, 53, 50), box("Chuleta de puerco", 230, 788, 368, 48), box("$130.00", 626, 790, 160, 42), box("$130.00", 801, 789, 176, 43)],
  [box("DEBO(EMOS) Y PAGARE(MOS) INCONDICIONALMENTE A LA ORDEN DE", 97, 1161, 498, 23), box("SIXTO GUILLERMO MERA SÁNCHEZ A LA VISTA LA CANTIDAD SEÑALADA", 97, 1178, 512, 23), box("SUBTOTAL", 621, 1159, 170, 35), box("$415.00", 805, 1159, 172, 47)],
  [box("EL IMPORTE DE MERCANCIAS RECIBIDAS DE CONFORMIDAD SI NO FUERE", 97, 1194, 521, 24)],
  [box("PAGADA A SU VENCIMIENTO, CAUSARÁ INTERESES MORATORIOS", 97, 1216, 467, 19)],
  [box("FIRMA.", 92, 1248, 70, 26), box("DEL", 93, 1231, 50, 26), box("%.", 163, 1233, 34, 23), box("TOTAL", 644, 1231, 123, 42), box("$415.00", 804, 1221, 178, 47)],
  ];
  assert.deepEqual(parseNoteRows(real), [
    { description: "Milanesa de res", quantity: 1 },
    { description: "Carne molida", quantity: 0.75 },
    { description: "Chuleta de puerco", quantity: 1 },
  ]);
});

test("por posición: sin encabezado de tabla devuelve null para usar la lectura de texto", () => {
  assert.equal(parseNoteRows([[box("12 Yogur Fresa 145 g", 60, 100)], [box("$9.50", 600, 100)]]), null);
});

const NOTE = `
REMISIÓN No. 4821
CLIENTE: SUPER AZUL
FECHA 22/11/2026
CANT  DESCRIPCION         P.UNIT   IMPORTE
12    YOGUR FRESA 145 G   $9.50    $114.00
10    LECHE ENTERA 1 L    $24.00   $240.00
6 PZA GALLETA MARIA 170G 15.50 93.00
7501055300075 REFRESCO COLA 600ML 24 PZAS
SUBTOTAL $447.00
IVA $0.00
TOTAL $447.00
RECIBI DE CONFORMIDAD
`;

test("lee cantidad al inicio y al final, e ignora encabezados y totales", () => {
  const lines = parseNoteText(NOTE);
  assert.deepEqual(lines, [
    { description: "YOGUR FRESA 145 G", quantity: 12 },
    { description: "LECHE ENTERA 1 L", quantity: 10 },
    { description: "GALLETA MARIA 170G", quantity: 6 },
    { description: "REFRESCO COLA 600ML", quantity: 24 },
  ]);
});

test("acepta cantidades con decimales y coma", () => {
  assert.deepEqual(parseNoteText("2,5 KG QUESO PANELA"), [{ description: "QUESO PANELA", quantity: 2.5 }]);
});

test("descarta renglones sin letras suficientes o sin cantidad", () => {
  assert.deepEqual(parseNoteText("12 -- 3\nSOLO TEXTO SIN NUMERO\n"), []);
});

const PRODUCTS = [
  { id: "p1", name: "Yogur de fresa 145 g" },
  { id: "p2", name: "Leche entera 1 L" },
  { id: "p3", name: "Galletas María 170 g" },
  { id: "p4", name: "Refresco de cola 600 ml" },
  { id: "p5", name: "Atún en agua 140 g" },
];

test("enlaza cada línea con el producto correcto aunque el nombre cambie", () => {
  const expected: Record<string, string> = {
    "YOGUR FRESA 145 G": "p1",
    "LECHE ENTERA 1 L": "p2",
    "GALLETA MARIA 170G": "p3",
    "REFRESCO COLA 600ML": "p4",
  };
  for (const [description, id] of Object.entries(expected)) {
    const best = rankProducts(description, PRODUCTS)[0];
    assert.equal(best?.productId, id, description);
    assert.ok(best.score >= AUTO_MATCH_SCORE, `${description}: ${best.score}`);
  }
});

test("tolera una letra mal leída y abreviaturas", () => {
  assert.equal(rankProducts("YOGUR FRE5A 145 G", PRODUCTS)[0]?.productId, "p1");
  assert.equal(rankProducts("LECH ENTERA 1L", PRODUCTS)[0]?.productId, "p2");
});

test("separa palabra y medida pegadas por el OCR", () => {
  assert.equal(similarity("Leche Entera1L", "Leche entera 1 L"), 1);
});

test("un producto distinto no llega al umbral de preselección", () => {
  const best = rankProducts("DETERGENTE EN POLVO 1 KG", PRODUCTS)[0];
  assert.ok(!best || best.score < AUTO_MATCH_SCORE);
});

test("la similitud es simétrica y 1 para nombres iguales", () => {
  assert.equal(similarity("Leche entera 1 L", "leche ENTERA 1l"), 1);
  assert.equal(similarity("a b c", "c b a"), similarity("c b a", "a b c"));
});
