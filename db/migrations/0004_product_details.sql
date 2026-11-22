-- Datos opcionales del producto: descripción, código de barras, marca y ubicación.
-- El código de barras es único por tienda (varios NULL no chocan entre sí).
ALTER TABLE products
  ADD COLUMN description VARCHAR(500) NULL AFTER name,
  ADD COLUMN barcode VARCHAR(64) NULL AFTER description,
  ADD COLUMN brand VARCHAR(80) NULL AFTER barcode,
  ADD COLUMN location VARCHAR(80) NULL AFTER brand,
  ADD UNIQUE KEY products_store_barcode_key (store_id, barcode),
  ADD CONSTRAINT products_barcode_check CHECK (barcode IS NULL OR CHAR_LENGTH(TRIM(barcode)) BETWEEN 1 AND 64);
