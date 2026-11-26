import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTO_MATCH_SCORE, parseNoteText, rankProducts, similarity } from "./delivery-note.ts";

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
