// Pruebas del esquema y de la capa de datos contra una base MariaDB de PRUEBAS (DATABASE_URL_TEST).
//   node --env-file=.env.local --no-warnings --test db/tests/core.test.ts
// Sin RLS, el aislamiento entre tiendas depende de la capa de acceso y de las restricciones de la
// base: aquí se verifican ambas. Las tablas se vacían al empezar (solo en una base *_test).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const url = process.env.DATABASE_URL_TEST;
if (!url || !/\/[A-Za-z0-9_]*_test(\?.*)?$/.test(url)) {
  throw new Error("DATABASE_URL_TEST debe apuntar a una base cuyo nombre termine en _test.");
}
process.env.DATABASE_URL = url;

const pool = await import("../../src/lib/db/pool.ts");
const users = await import("../../src/lib/db/users.ts");
const stores = await import("../../src/lib/db/stores.ts");
const catalog = await import("../../src/lib/db/catalog.ts");
const lots = await import("../../src/lib/db/lots.ts");
const photos = await import("../../src/lib/db/photos.ts");
const { db, closePool, getPool, newId, isDuplicate, isForeignKey, isCheckViolation, isRaised } = pool;

const today = () => new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10); // Mazatlán (UTC-7)
const plus = (days: number) => new Date(Date.parse(`${today()}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function reset() {
  const connection = await getPool().getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of [
      "inventory_movements", "product_photos", "lots", "products", "categories",
      "store_members", "stores", "sessions", "users",
    ]) await connection.query(`TRUNCATE TABLE ${table}`);
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    connection.release();
  }
}

const rejects = (promise: Promise<unknown>, check: (e: unknown) => boolean, message: string) =>
  assert.rejects(promise, (e) => check(e), message);

let ownerA: string, ownerB: string, storeA: string, storeB: string;
let productA: string, productB: string, catA: string, catB: string;

before(async () => {
  await reset();
  ownerA = await users.createUser({ email: "a@test.local", passwordHash: "x" });
  ownerB = await users.createUser({ email: "b@test.local", passwordHash: "x" });
  storeA = await stores.createStore(ownerA, "Tienda A");
  storeB = await stores.createStore(ownerB, "Tienda B");
  catA = await catalog.createCategory(storeA, "Lácteos");
  catB = await catalog.createCategory(storeB, "Lácteos");
  productA = await catalog.createProduct(storeA, { categoryId: catA, name: "Leche A", unit: "litro" });
  productB = await catalog.createProduct(storeB, { categoryId: catB, name: "Leche B", unit: "litro" });
});
after(async () => {
  await closePool();
});

// ---------------------------------------------------------------------------------------------
test("tiendas: createStore crea la membresía de propietario y la tienda activa sale de ahí", async () => {
  const membership = await stores.getMembership(ownerA);
  assert.equal(membership?.role, "owner");
  assert.equal(membership?.store.id, storeA);
  assert.equal(membership?.store.expiry_alert_days, 7);
  assert.equal(await stores.getMembership(newId()), null, "un usuario sin tienda no tiene membresía");
  await assert.rejects(stores.createStore(ownerA, "   "), /inválido/);
});

test("restricciones: nombres, unidades, cantidades y fechas inválidas son rechazadas por la base", async () => {
  await rejects(catalog.createCategory(storeA, ""), isCheckViolation, "categoría vacía");
  await rejects(catalog.createProduct(storeA, { categoryId: null, name: "X", unit: "galón" }), isCheckViolation, "unidad inválida");
  await rejects(catalog.createCategory(storeA, "lácteos"), isDuplicate, "categoría duplicada sin distinguir mayúsculas/acentos");
  await rejects(catalog.createProduct(storeA, { categoryId: null, name: "leche a", unit: "pieza" }), isDuplicate, "producto duplicado");
  const base = { productId: productA, supplierLotCode: null, entryDate: today() };
  await rejects(lots.createLot(storeA, { ...base, expirationDate: plus(5), quantity: "0" }), isCheckViolation, "cantidad 0");
  await rejects(lots.createLot(storeA, { ...base, entryDate: plus(5), expirationDate: plus(1), quantity: "1" }), isCheckViolation, "caducidad anterior a la entrada");
  await rejects(db.exec("UPDATE stores SET expiry_alert_days = 91 WHERE id = ?", [storeA]), isCheckViolation, "umbral > 90");
  await rejects(db.exec("UPDATE stores SET expiry_alert_days = 0 WHERE id = ?", [storeA]), isCheckViolation, "umbral < 1");
  await rejects(db.exec("INSERT INTO users (id, email, password_hash) VALUES (?, 'MAYUS@x.com', 'x')", [newId()]), isCheckViolation, "correo en mayúsculas");
});

test("aislamiento: claves foráneas compuestas impiden mezclar tiendas", async () => {
  await rejects(catalog.createProduct(storeB, { categoryId: catA, name: "Robado", unit: "pieza" }), isForeignKey, "producto de B con categoría de A");
  await rejects(
    lots.createLot(storeB, { productId: productA, supplierLotCode: null, entryDate: today(), expirationDate: plus(5), quantity: "1" }),
    isForeignKey, "lote de B con producto de A",
  );
});

test("aislamiento: las consultas de la capa de datos nunca devuelven filas de otra tienda", async () => {
  const lotA = await lots.createLot(storeA, { productId: productA, supplierLotCode: "AISLA-A", entryDate: today(), expirationDate: plus(3), quantity: "5" });
  const lotB = await lots.createLot(storeB, { productId: productB, supplierLotCode: "AISLA-B", entryDate: today(), expirationDate: plus(3), quantity: "5" });
  assert.deepEqual((await catalog.listCategories(storeB)).map((c) => c.id), [catB]);
  assert.deepEqual((await catalog.listProducts(storeB)).map((p) => p.id), [productB]);
  assert.equal(await catalog.getProduct(storeB, productA), null, "producto de A pedido con la tienda B");
  assert.ok((await lots.listLots(storeB)).every((l) => l.id !== lotA));
  assert.equal((await lots.listLots(storeB, { productId: productA })).length, 0);
  assert.ok((await lots.listEntries(storeB)).every((e) => e.id !== lotA));
  await rejects(lots.registerMovement(storeB, ownerB, { lotId: lotA, type: "count", quantityAfter: 1 }), () => true, "movimiento sobre lote ajeno");
  const intact = await db.queryOne<{ current_quantity: number }>("SELECT current_quantity FROM lots WHERE id = ?", [lotA]);
  assert.equal(Number(intact?.current_quantity), 5, "el lote ajeno no cambió");
  void lotB;
});

test("triggers: la existencia inicia igual a la inicial y los campos de identidad no cambian", async () => {
  const id = await lots.createLot(storeA, { productId: productA, supplierLotCode: "TRG", entryDate: today(), expirationDate: plus(40), quantity: "12.5" });
  const row = await db.queryOne<{ current_quantity: number; initial_quantity: number }>("SELECT current_quantity, initial_quantity FROM lots WHERE id = ?", [id]);
  assert.equal(Number(row?.current_quantity), 12.5);
  await rejects(db.exec("UPDATE lots SET store_id = ? WHERE id = ?", [storeB, id]), isRaised, "mover lote de tienda");
  await rejects(db.exec("UPDATE lots SET initial_quantity = 99 WHERE id = ?", [id]), isRaised, "cambiar cantidad inicial");
  await rejects(db.exec("UPDATE products SET store_id = ? WHERE id = ?", [storeB, productA]), isRaised, "mover producto de tienda");
  await rejects(db.exec("UPDATE categories SET store_id = ? WHERE id = ?", [storeB, catA]), isRaised, "mover categoría de tienda");
  await rejects(db.exec("UPDATE store_members SET user_id = ? WHERE store_id = ?", [ownerB, storeA]), isRaised, "cambiar miembro");
});

test("triggers: una tienda conserva siempre al menos un propietario", async () => {
  await rejects(db.exec("UPDATE store_members SET role = 'staff' WHERE store_id = ? AND user_id = ?", [storeA, ownerA]), isRaised, "degradar al único owner");
  await rejects(db.exec("DELETE FROM store_members WHERE store_id = ? AND user_id = ?", [storeA, ownerA]), isRaised, "eliminar al único owner");
  const staff = await users.createUser({ email: "staff@test.local", passwordHash: "x" });
  await db.exec("INSERT INTO store_members (store_id, user_id, role) VALUES (?, ?, 'staff')", [storeA, staff]);
  await db.exec("DELETE FROM store_members WHERE store_id = ? AND user_id = ?", [storeA, staff]); // staff sí se puede quitar
});

test("vista lots_with_status: estados y días calculados por la base", async () => {
  const mk = (code: string, exp: number, entry = 0) =>
    lots.createLot(storeA, { productId: productA, supplierLotCode: code, entryDate: plus(entry), expirationDate: plus(exp), quantity: "4" });
  const venc = await mk("V-VENC", -2, -10);
  const soon = await mk("V-SOON", 3);
  const edge = await mk("V-EDGE", 7); // justo en el umbral de 7 días
  const ok = await mk("V-OK", 30);
  const byId = new Map((await lots.listLots(storeA)).map((l) => [l.id, l]));
  assert.equal(byId.get(venc)?.status, "vencido");
  assert.equal(byId.get(venc)?.days_to_expiry, -2);
  assert.equal(byId.get(soon)?.status, "por_vencer");
  assert.equal(byId.get(edge)?.status, "por_vencer");
  assert.equal(byId.get(ok)?.status, "vigente");
  const sorted = (await lots.listLots(storeA)).map((l) => l.expiration_date);
  assert.deepEqual(sorted, [...sorted].sort(), "orden por caducidad ascendente (FEFO)");
  // el umbral de la tienda se respeta
  await db.exec("UPDATE stores SET expiry_alert_days = 30 WHERE id = ?", [storeA]);
  assert.equal((await lots.listLots(storeA)).find((l) => l.id === ok)?.status, "por_vencer");
  await db.exec("UPDATE stores SET expiry_alert_days = 7 WHERE id = ?", [storeA]);
});

test("movimientos: conteo, ajuste y baja respetan sus reglas y dejan historial", async () => {
  const lot = await lots.createLot(storeA, { productId: productA, supplierLotCode: "MOV", entryDate: today(), expirationDate: plus(20), quantity: "10" });
  const stock = async () => Number((await db.queryOne<{ q: number }>("SELECT current_quantity AS q FROM lots WHERE id = ?", [lot]))?.q);
  await lots.registerMovement(storeA, ownerA, { lotId: lot, type: "count", quantityAfter: 8 });
  assert.equal(await stock(), 8);
  await rejects(lots.registerMovement(storeA, ownerA, { lotId: lot, type: "adjustment", quantityAfter: 9 }), (e) => e instanceof lots.DomainError, "ajuste sin motivo");
  await rejects(lots.registerMovement(storeA, ownerA, { lotId: lot, type: "write_off", quantityAfter: 9, reason: "x" }), (e) => e instanceof lots.DomainError, "baja que aumenta");
  await rejects(lots.registerMovement(storeA, ownerA, { lotId: lot, type: "adjustment", quantityAfter: 8, reason: "x" }), (e) => e instanceof lots.DomainError, "ajuste sin cambio");
  await rejects(lots.registerMovement(storeA, ownerA, { lotId: lot, type: "count", quantityAfter: -1 }), (e) => e instanceof lots.DomainError, "cantidad negativa");
  await rejects(lots.registerMovement(storeA, ownerA, { lotId: lot, type: "venta" as never, quantityAfter: 1, reason: "x" }), (e) => e instanceof lots.DomainError, "tipo 'venta' no existe");
  assert.equal(await stock(), 8, "los movimientos rechazados no cambian la existencia");
  await lots.registerMovement(storeA, ownerA, { lotId: lot, type: "write_off", quantityAfter: 5, reason: "caja dañada" });
  assert.equal(await stock(), 5);
  const history = (await lots.listMovements(storeA)).filter((m) => m.supplier_lot_code === "MOV");
  assert.deepEqual(history.map((m) => m.type).sort(), ["count", "write_off"]);
  assert.equal(history.find((m) => m.type === "write_off")?.difference, -3);
});

test("movimientos: el historial es inmutable y los conteos simultáneos se serializan", async () => {
  const lot = await lots.createLot(storeA, { productId: productA, supplierLotCode: "CONC", entryDate: today(), expirationDate: plus(20), quantity: "100" });
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) => lots.registerMovement(storeA, ownerA, { lotId: lot, type: "count", quantityAfter: 90 - i })),
  );
  assert.ok(results.every((r) => r.status === "fulfilled"));
  const rows = await db.query<{ quantity_before: number; quantity_after: number }>(
    "SELECT quantity_before, quantity_after FROM inventory_movements WHERE lot_id = ? ORDER BY created_at, id", [lot]);
  // Cada "antes" es el "después" de otro movimiento (cadena sin huecos ni valores repetidos).
  const befores = new Set(rows.map((r) => Number(r.quantity_before)));
  const afters = new Set(rows.map((r) => Number(r.quantity_after)));
  assert.equal(rows.length, 8);
  assert.equal([...befores].filter((b) => !afters.has(b)).join(), "100", "solo el primero parte de 100");
  await rejects(db.exec("UPDATE inventory_movements SET reason = 'x' WHERE lot_id = ?", [lot]), isRaised, "modificar historial");
  await rejects(db.exec("DELETE FROM inventory_movements WHERE lot_id = ?", [lot]), isRaised, "borrar historial");
});

test("fotos: se guardan por tienda y una tienda no puede leer ni pisar la de otra", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
  assert.equal(await photos.savePhoto(storeA, productA, "image/png", png), true);
  assert.equal((await photos.getPhoto(storeA, productA))?.content_type, "image/png");
  assert.deepEqual([...(await photos.getPhotoVersions(storeA)).keys()], [productA]);
  assert.equal(await photos.getPhoto(storeB, productA), null, "B no lee la foto de A");
  assert.equal((await photos.getPhotoVersions(storeB)).size, 0);
  assert.equal(await photos.savePhoto(storeB, productA, "image/jpeg", jpg), false, "B no puede pisar la foto de A");
  assert.deepEqual([...(await photos.getPhoto(storeA, productA))!.data], [...png], "la foto de A sigue intacta");
  await photos.deletePhoto(storeB, productA); // borrar con la tienda equivocada no hace nada
  assert.ok(await photos.getPhoto(storeA, productA));
  assert.equal(await photos.savePhoto(storeA, productA, "image/jpeg", jpg), true, "reemplazo en su propia tienda");
  assert.equal((await photos.getPhoto(storeA, productA))?.content_type, "image/jpeg");
  await rejects(db.exec("INSERT INTO product_photos (product_id, store_id, content_type, data) VALUES (?, ?, 'image/gif', 'x')", [productB, storeB]), isCheckViolation, "tipo no admitido");
  await rejects(db.exec("INSERT INTO product_photos (product_id, store_id, content_type, data) VALUES (?, ?, 'image/png', REPEAT('a', 524289))", [productB, storeB]), isCheckViolation, "más de 512 KB");
  await photos.deletePhoto(storeA, productA);
  assert.equal(await photos.getPhoto(storeA, productA), null);
});

test("sesiones: solo valen mientras no expiran y se pueden cerrar", async () => {
  const future = new Date(Date.now() + 3600_000);
  await users.createSession("a".repeat(64), ownerA, future);
  assert.equal((await users.findSessionUser("a".repeat(64)))?.email, "a@test.local");
  assert.equal(await users.findSessionUser("b".repeat(64)), null, "token desconocido");
  await users.createSession("c".repeat(64), ownerA, new Date(Date.now() - 1000));
  assert.equal(await users.findSessionUser("c".repeat(64)), null, "sesión expirada");
  await users.deleteSession("a".repeat(64));
  assert.equal(await users.findSessionUser("a".repeat(64)), null, "sesión cerrada");
  await users.deleteExpiredSessions();
  assert.equal(Number((await db.queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM sessions"))?.n), 0);
  await rejects(users.createUser({ email: "a@test.local", passwordHash: "x" }), isDuplicate, "correo repetido");
});
