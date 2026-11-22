-- Proveedor del producto (texto libre, opcional).
ALTER TABLE products
  ADD COLUMN supplier VARCHAR(80) NULL AFTER brand;
