import assert from "node:assert/strict";
import { test } from "node:test";
import { fromBytea, MAX_PHOTO_BYTES, photoUrl, sniffImageType, toBytea } from "./photos.ts";

const bytes = (...n: number[]) => new Uint8Array(n);

test("reconoce JPEG, PNG y WebP por su firma", () => {
  assert.equal(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)), "image/jpeg");
  assert.equal(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), "image/png");
  const webp = new Uint8Array([...new TextEncoder().encode("RIFF"), 1, 2, 3, 4, ...new TextEncoder().encode("WEBP")]);
  assert.equal(sniffImageType(webp), "image/webp");
});

test("rechaza archivos que no son imágenes admitidas", () => {
  assert.equal(sniffImageType(new TextEncoder().encode("GIF89a....")), null); // GIF
  assert.equal(sniffImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(sniffImageType(new TextEncoder().encode("<?php echo 1;")), null);
  assert.equal(sniffImageType(new TextEncoder().encode("%PDF-1.7")), null);
  assert.equal(sniffImageType(bytes()), null);
  assert.equal(sniffImageType(bytes(0xff, 0xd8)), null); // truncado
  assert.equal(sniffImageType(new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WAVE")])), null);
});

test("bytea hexadecimal ida y vuelta", () => {
  const original = bytes(0, 1, 15, 16, 127, 128, 254, 255);
  const hex = toBytea(original);
  assert.equal(hex, "\\x00010f107f80feff");
  assert.deepEqual(fromBytea(hex), original);
  assert.deepEqual(fromBytea("00ff"), bytes(0, 255));
});

test("el límite del servidor queda por debajo del de la base de datos (512 KB)", () => {
  assert.ok(MAX_PHOTO_BYTES < 512 * 1024);
});

test("la URL lleva la versión para cachear sin servir imágenes viejas", () => {
  assert.equal(photoUrl("abc", 123), "/products/abc/photo?v=123");
});
