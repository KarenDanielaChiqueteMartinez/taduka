// Ejecutor mínimo de migraciones para MariaDB (sin dependencias extra: usa mysql2).
//   node --env-file=.env.local db/migrate.mjs            -> DATABASE_URL
//   DATABASE_URL=mysql://... node db/migrate.mjs          -> otra base (p. ej. la de pruebas)
// Aplica en orden los db/migrations/*.sql pendientes. Las sentencias se separan con una línea
// "-- ;;" (los triggers llevan BEGIN…END con punto y coma dentro, y no se usa DELIMITER).
// Las migraciones ya aplicadas no se vuelven a ejecutar ni se modifican.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (mysql://usuario:contraseña@host:puerto/base).");
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

const connection = await mysql.createConnection({
  uri: url,
  multipleStatements: false,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

try {
  await connection.query("SET time_zone = '+00:00'");
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [rows] = await connection.query("SELECT version, checksum FROM schema_migrations");
  const applied = new Map(rows.map((r) => [r.version, r.checksum]));

  let count = 0;
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        throw new Error(`La migración ${file} ya se aplicó y fue modificada. Crea una nueva en lugar de editarla.`);
      }
      continue;
    }
    const statements = sql
      .split(/^-- ;;\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
    console.log(`Aplicando ${file} (${statements.length} sentencias)…`);
    for (const statement of statements) {
      try {
        await connection.query(statement);
      } catch (error) {
        console.error(`\nError en ${file}:\n${statement.slice(0, 300)}\n`);
        throw error;
      }
    }
    await connection.query("INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)", [file, checksum]);
    count += 1;
  }
  console.log(count === 0 ? "Base al día: no hay migraciones pendientes." : `Listo: ${count} migración(es) aplicada(s).`);
} finally {
  await connection.end();
}
