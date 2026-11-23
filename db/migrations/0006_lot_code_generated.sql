-- El código del lote lo genera la base de datos cuando no se indica uno:
-- L-AAMMDD-XXXX (fecha local de la tienda, UTC-7, y 4 caracteres hexadecimales al azar).
-- Si se indica un código explícito, se respeta. La existencia actual sigue arrancando igual
-- a la inicial, como antes.
CREATE OR REPLACE TRIGGER lots_bi BEFORE INSERT ON lots FOR EACH ROW
BEGIN
  SET NEW.current_quantity = NEW.initial_quantity;
  IF NEW.supplier_lot_code IS NULL OR TRIM(NEW.supplier_lot_code) = '' THEN
    SET NEW.supplier_lot_code = CONCAT(
      'L-',
      DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 7 HOUR, '%y%m%d'),
      '-',
      UPPER(SUBSTRING(MD5(UUID()), 1, 4))
    );
  END IF;
END;
