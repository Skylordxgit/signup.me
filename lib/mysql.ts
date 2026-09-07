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
  const [rows] = await mysqlPool().execute<mysql.RowDataPacket[] & mysql.ResultSetHeader[]>(
    sql,
    values as (string | number | boolean | Buffer | null)[],
  );
  return rows as T;
}

export type TransactionQuery = <R>(sql: string, values?: unknown[]) => Promise<R>;

export async function withTransaction<T>(handler: (query: TransactionQuery) => Promise<T>) {
  const connection = await mysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const query = async <R>(sql: string, values: unknown[] = []) => {
      const [rows] = await connection.execute<mysql.RowDataPacket[] & mysql.ResultSetHeader[]>(
        sql,
        values as (string | number | boolean | Buffer | null)[],
      );
      return rows as R;
    };
    const result = await handler(query);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
