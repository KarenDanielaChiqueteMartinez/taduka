import { randomUUID } from "node:crypto";
import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

// Conexión a MariaDB. Solo para código de servidor (acciones, rutas, páginas de servidor).
// - Fechas DATE y DATETIME llegan como texto ("2026-10-22", "2026-10-22 18:30:00.123", en UTC).
// - DECIMAL llega como número; los UUID, como texto.
// - Cada conexión fija UTC y un modo SQL estricto, sin depender del servidor.

declare global {
  var __tadukaPool: Pool | undefined;
}

function createPool(): Pool {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("Falta la variable de entorno DATABASE_URL.");
  const pool = mysql.createPool({
    uri,
    // En funciones serverless cada instancia abre su propio pool: se mantiene pequeño.
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    waitForConnections: true,
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
    decimalNumbers: true,
    enableKeepAlive: true,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
  pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
    connection.query(
      "SET SESSION sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
    );
  });
  return pool;
}

// Un solo pool por proceso (también entre recargas en desarrollo).
export function getPool(): Pool {
  globalThis.__tadukaPool ??= createPool();
  return globalThis.__tadukaPool;
}

export async function closePool() {
  await globalThis.__tadukaPool?.end();
  globalThis.__tadukaPool = undefined;
}

export type Params = unknown[];

export interface Executor {
  query<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T | null>;
  exec(sql: string, params?: Params): Promise<ResultSetHeader>;
}

function executorFor(run: Pool | PoolConnection): Executor {
  return {
    async query<T>(sql: string, params: Params = []) {
      const [rows] = await run.query<RowDataPacket[]>(sql, params);
      return rows as T[];
    },
    async queryOne<T>(sql: string, params: Params = []) {
      const [rows] = await run.query<RowDataPacket[]>(sql, params);
      return (rows[0] as T | undefined) ?? null;
    },
    async exec(sql: string, params: Params = []) {
      const [result] = await run.query<ResultSetHeader>(sql, params);
      return result;
    },
  };
}

export const db: Executor = {
  query: (sql, params) => executorFor(getPool()).query(sql, params),
  queryOne: (sql, params) => executorFor(getPool()).queryOne(sql, params),
  exec: (sql, params) => executorFor(getPool()).exec(sql, params),
};

// Transacción: confirma si la función termina bien y revierte si lanza un error.
export async function transaction<T>(work: (tx: Executor) => Promise<T>): Promise<T> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(executorFor(connection));
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export const newId = () => randomUUID();

// --- Clasificación de errores de MariaDB (por número de error) -------------------------------
const errno = (error: unknown) => (error as { errno?: number } | null)?.errno;
export const isDuplicate = (e: unknown) => errno(e) === 1062; // ER_DUP_ENTRY
export const isForeignKey = (e: unknown) => errno(e) === 1452 || errno(e) === 1451;
export const isCheckViolation = (e: unknown) => errno(e) === 4025; // ER_CONSTRAINT_FAILED
export const isRaised = (e: unknown) => errno(e) === 1644; // SIGNAL de un trigger

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID_PATTERN.test(value);

// "2026-10-22 18:30:00.123" (UTC) -> Date
export function toDate(datetime: string): Date {
  return new Date(`${datetime.replace(" ", "T")}Z`);
}
