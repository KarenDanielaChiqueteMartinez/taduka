-- TADUKA · esquema núcleo para MariaDB (>= 10.11; probado en 11.8).
-- Convenciones:
--   * Las sentencias se separan con una línea `-- ;;` (el ejecutor no usa DELIMITER).
--   * Todas las fechas y horas se guardan en UTC (DATETIME) o como DATE de calendario.
--   * Sin RLS: el aislamiento por tienda lo impone la capa de acceso a datos (src/lib/db) y,
--     en la base, las claves foráneas compuestas (id, store_id) y los triggers de abajo.
--   * Collation utf8mb4_unicode_ci: las comparaciones y los índices únicos no distinguen
--     mayúsculas ni acentos ("Leche" = "leche" = "léche").

CREATE TABLE users (
  id UUID NOT NULL DEFAULT UUID(),
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_key (email),
  CONSTRAINT users_email_check CHECK (CHAR_LENGTH(email) BETWEEN 3 AND 254 AND email = LOWER(email))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ;;

CREATE TABLE sessions (
  token_hash CHAR(64) NOT NULL,
  user_id UUID NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (token_hash),
  KEY sessions_user_idx (user_id),
  KEY sessions_expires_idx (expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ;;

CREATE TABLE stores (
  id UUID NOT NULL DEFAULT UUID(),
  name VARCHAR(80) NOT NULL,
  expiry_alert_days SMALLINT UNSIGNED NOT NULL DEFAULT 7,
  created_by UUID NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT stores_name_check CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 80),
  CONSTRAINT stores_alert_days_check CHECK (expiry_alert_days BETWEEN 1 AND 90),
  CONSTRAINT stores_created_by_fk FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ;;

CREATE TABLE store_members (
  store_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role VARCHAR(10) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (store_id, user_id),
  KEY store_members_user_idx (user_id),
  CONSTRAINT store_members_role_check CHECK (role IN ('owner', 'staff')),
  CONSTRAINT store_members_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
  CONSTRAINT store_members_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ;;

CREATE TABLE categories (
  id UUID NOT NULL DEFAULT UUID(),
  store_id UUID NOT NULL,
  name VARCHAR(60) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY categories_id_store_key (id, store_id),
  UNIQUE KEY categories_store_name_key (store_id, name),
  CONSTRAINT categories_name_check CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 60),
  CONSTRAINT categories_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ;;

CREATE TABLE products (
  id UUID NOT NULL DEFAULT UUID(),
  store_id UUID NOT NULL,
  category_id UUID NULL,
  name VARCHAR(120) NOT NULL,
  unit VARCHAR(10) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY products_id_store_key (id, store_id),
  UNIQUE KEY products_store_name_key (store_id, name),
  KEY products_store_active_name_idx (store_id, is_active, name),
  KEY products_store_category_idx (store_id, category_id),
  CONSTRAINT products_name_check CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 120),
  CONSTRAINT products_unit_check CHECK (unit IN ('pieza', 'kg', 'g', 'litro', 'ml', 'paquete', 'caja')),
  CONSTRAINT products_active_check CHECK (is_active IN (0, 1)),
  CONSTRAINT products_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
  CONSTRAINT products_category_fk FOREIGN KEY (category_id, store_id)
    REFERENCES categories (id, store_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ;;

CREATE TABLE lots (
  id UUID NOT NULL DEFAULT UUID(),
  store_id UUID NOT NULL,
  product_id UUID NOT NULL,
  supplier_lot_code VARCHAR(60) NULL,
  entry_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  initial_quantity DECIMAL(12, 3) NOT NULL,
  current_quantity DECIMAL(12, 3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY lots_id_store_key (id, store_id),
  KEY lots_store_product_idx (store_id, product_id),
  KEY lots_store_expiration_idx (store_id, expiration_date),
  CONSTRAINT lots_initial_check CHECK (initial_quantity > 0),
  CONSTRAINT lots_current_check CHECK (current_quantity >= 0),
  CONSTRAINT lots_dates_check CHECK (expiration_date >= entry_date),
  CONSTRAINT lots_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
  CONSTRAINT lots_product_fk FOREIGN KEY (product_id, store_id)
    REFERENCES products (id, store_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ;;

CREATE TABLE inventory_movements (
  id UUID NOT NULL DEFAULT UUID(),
  store_id UUID NOT NULL,
  lot_id UUID NOT NULL,
  type VARCHAR(12) NOT NULL,
  quantity_before DECIMAL(12, 3) NOT NULL,
  quantity_after DECIMAL(12, 3) NOT NULL,
  difference DECIMAL(12, 3) GENERATED ALWAYS AS (quantity_after - quantity_before) STORED,
  reason VARCHAR(300) NULL,
  created_by UUID NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY inventory_movements_store_created_idx (store_id, created_at),
  KEY inventory_movements_lot_created_idx (lot_id, created_at),
  CONSTRAINT movements_type_check CHECK (type IN ('count', 'adjustment', 'write_off')),
  CONSTRAINT movements_before_check CHECK (quantity_before >= 0),
  CONSTRAINT movements_after_check CHECK (quantity_after >= 0),
  CONSTRAINT movements_reason_check CHECK (type = 'count' OR CHAR_LENGTH(TRIM(COALESCE(reason, ''))) > 0),
  CONSTRAINT movements_write_off_check CHECK (type <> 'write_off' OR quantity_after < quantity_before),
  CONSTRAINT movements_adjustment_check CHECK (type <> 'adjustment' OR quantity_after <> quantity_before),
  CONSTRAINT movements_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
  CONSTRAINT movements_lot_fk FOREIGN KEY (lot_id, store_id)
    REFERENCES lots (id, store_id) ON DELETE RESTRICT,
  CONSTRAINT movements_user_fk FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ;;

CREATE TABLE product_photos (
  product_id UUID NOT NULL,
  store_id UUID NOT NULL,
  content_type VARCHAR(20) NOT NULL,
  data LONGBLOB NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (product_id),
  KEY product_photos_store_idx (store_id),
  CONSTRAINT product_photos_type_check CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT product_photos_size_check CHECK (OCTET_LENGTH(data) BETWEEN 1 AND 524288),
  CONSTRAINT product_photos_store_fk FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
  CONSTRAINT product_photos_product_fk FOREIGN KEY (product_id, store_id)
    REFERENCES products (id, store_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ;;

-- Estado de caducidad calculado en la base (única fuente de verdad, como antes).
-- "Hoy" = fecha de calendario en America/Mazatlan (UTC-7 todo el año desde 2022).
CREATE VIEW lots_with_status AS
SELECT
  l.id, l.store_id, l.product_id,
  p.name AS product_name, p.unit,
  l.supplier_lot_code, l.entry_date, l.expiration_date,
  l.initial_quantity, l.current_quantity,
  l.created_at, l.updated_at,
  DATEDIFF(l.expiration_date, t.today) AS days_to_expiry,
  CASE
    WHEN l.expiration_date < t.today THEN 'vencido'
    WHEN l.expiration_date <= DATE_ADD(t.today, INTERVAL s.expiry_alert_days DAY) THEN 'por_vencer'
    ELSE 'vigente'
  END AS status
FROM lots l
JOIN products p ON p.id = l.product_id AND p.store_id = l.store_id
JOIN stores s ON s.id = l.store_id
CROSS JOIN (SELECT DATE(UTC_TIMESTAMP() - INTERVAL 7 HOUR) AS today) t;
-- ;;

-- Al crear un lote, la existencia actual arranca igual a la inicial.
CREATE TRIGGER lots_bi BEFORE INSERT ON lots FOR EACH ROW
BEGIN
  SET NEW.current_quantity = NEW.initial_quantity;
END;
-- ;;

-- store_id (y las identidades) no cambian nunca: nadie "mueve" filas entre tiendas.
CREATE TRIGGER categories_bu BEFORE UPDATE ON categories FOR EACH ROW
BEGIN
  IF NOT (NEW.store_id <=> OLD.store_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'store_id no es modificable';
  END IF;
END;
-- ;;

CREATE TRIGGER products_bu BEFORE UPDATE ON products FOR EACH ROW
BEGIN
  IF NOT (NEW.store_id <=> OLD.store_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'store_id no es modificable';
  END IF;
END;
-- ;;

CREATE TRIGGER lots_bu BEFORE UPDATE ON lots FOR EACH ROW
BEGIN
  IF NOT (NEW.store_id <=> OLD.store_id) OR NOT (NEW.product_id <=> OLD.product_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'store_id y product_id no son modificables';
  END IF;
  IF NOT (NEW.initial_quantity <=> OLD.initial_quantity) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'initial_quantity no es modificable';
  END IF;
END;
-- ;;

CREATE TRIGGER product_photos_bu BEFORE UPDATE ON product_photos FOR EACH ROW
BEGIN
  IF NOT (NEW.store_id <=> OLD.store_id) OR NOT (NEW.product_id <=> OLD.product_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'store_id y product_id no son modificables';
  END IF;
END;
-- ;;

CREATE TRIGGER store_members_bu BEFORE UPDATE ON store_members FOR EACH ROW
BEGIN
  IF NOT (NEW.store_id <=> OLD.store_id) OR NOT (NEW.user_id <=> OLD.user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'store_id y user_id no son modificables';
  END IF;
  -- Una tienda siempre conserva al menos un propietario.
  IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM store_members m
      WHERE m.store_id = OLD.store_id AND m.role = 'owner' AND m.user_id <> OLD.user_id
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La tienda debe conservar al menos un propietario';
    END IF;
  END IF;
END;
-- ;;

CREATE TRIGGER store_members_bd BEFORE DELETE ON store_members FOR EACH ROW
BEGIN
  IF OLD.role = 'owner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM store_members m
      WHERE m.store_id = OLD.store_id AND m.role = 'owner' AND m.user_id <> OLD.user_id
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La tienda debe conservar al menos un propietario';
    END IF;
  END IF;
END;
-- ;;

-- El historial de movimientos es inmutable (las bajas en cascada de una tienda no pasan por aquí).
CREATE TRIGGER inventory_movements_bu BEFORE UPDATE ON inventory_movements FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El historial de movimientos no se modifica';
END;
-- ;;

CREATE TRIGGER inventory_movements_bd BEFORE DELETE ON inventory_movements FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El historial de movimientos no se elimina';
END;
