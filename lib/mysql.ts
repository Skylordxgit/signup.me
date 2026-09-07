import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

export function hasMysqlConfig() {
  return Boolean(process.env.DATABASE_URL);
}

export function mysqlPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  pool ??= mysql.createPool(process.env.DATABASE_URL);
  return pool;
}

export async function mysqlQuery<T>(sql: string, values: unknown[] = []) {
  const [rows] = await mysqlPool().execute(sql, values);
  return rows as T;
}
