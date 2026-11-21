-- Corrección: con la collation utf8mb4_unicode_ci (insensible a mayúsculas) la restricción
-- `email = LOWER(email)` siempre era verdadera. Se compara en binario para exigir minúsculas.
ALTER TABLE users DROP CONSTRAINT users_email_check;
-- ;;

ALTER TABLE users ADD CONSTRAINT users_email_check
  CHECK (CHAR_LENGTH(email) BETWEEN 3 AND 254 AND BINARY email = BINARY LOWER(email));
