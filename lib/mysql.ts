import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;
let schemaReady: Promise<void> | null = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(190) NOT NULL,
    owner_email VARCHAR(190) NOT NULL,
    status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_workspaces_owner (owner_email)
  )`,
  `CREATE TABLE IF NOT EXISTS workspace_users (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(190) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    session_version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS media_files (
    storage_path VARCHAR(255) PRIMARY KEY,
    workspace_id CHAR(36) NOT NULL DEFAULT 'default',
    file_name VARCHAR(120) NOT NULL,
    category VARCHAR(20) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size INT UNSIGNED NOT NULL,
    file_data MEDIUMBLOB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS admins (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS pages (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(190) NOT NULL,
    slug VARCHAR(120) NOT NULL UNIQUE,
    title VARCHAR(190) NOT NULL,
    bio TEXT NOT NULL,
    profile_image VARCHAR(600) NULL,
    logo_image VARCHAR(600) NULL,
    status ENUM('published', 'draft', 'disabled') NOT NULL DEFAULT 'draft',
    theme_settings JSON NOT NULL,
    seo_settings JSON NOT NULL,
    integration_settings JSON NOT NULL,
    views BIGINT UNSIGNED NOT NULL DEFAULT 0,
    unique_visitors BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pages_status_slug (status, slug)
  )`,
  `CREATE TABLE IF NOT EXISTS page_blocks (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    page_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(40) NOT NULL,
    title VARCHAR(190) NOT NULL,
    subtitle VARCHAR(255) NULL,
    url VARCHAR(700) NULL,
    icon VARCHAR(80) NULL,
    phone VARCHAR(80) NULL,
    message TEXT NULL,
    image_url VARCHAR(700) NULL,
    video_url VARCHAR(700) NULL,
    settings JSON NULL,
    sort_order INT UNSIGNED NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    clicks BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_blocks_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    INDEX idx_blocks_page_order (page_id, sort_order),
    INDEX idx_blocks_page_active (page_id, is_active)
  )`,
  `CREATE TABLE IF NOT EXISTS page_views (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    page_id BIGINT UNSIGNED NOT NULL,
    visitor_hash CHAR(64) NOT NULL,
    device_type VARCHAR(30) NOT NULL,
    referrer VARCHAR(255) NOT NULL DEFAULT 'Direct',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_views_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    INDEX idx_views_page_date (page_id, created_at),
    INDEX idx_views_unique (page_id, visitor_hash)
  )`,
  `CREATE TABLE IF NOT EXISTS link_clicks (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    page_id BIGINT UNSIGNED NOT NULL,
    block_id BIGINT UNSIGNED NOT NULL,
    device_type VARCHAR(30) NOT NULL,
    referrer VARCHAR(255) NOT NULL DEFAULT 'Direct',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_clicks_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    CONSTRAINT fk_clicks_block FOREIGN KEY (block_id) REFERENCES page_blocks(id) ON DELETE CASCADE,
    INDEX idx_clicks_page_date (page_id, created_at),
    INDEX idx_clicks_block_date (block_id, created_at)
  )`,
  `CREATE TABLE IF NOT EXISTS uploads (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    page_id BIGINT UNSIGNED NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size INT UNSIGNED NOT NULL,
    storage_path VARCHAR(700) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_uploads_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(120) NOT NULL UNIQUE,
    setting_value JSON NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS notification_campaigns (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    workspace_id CHAR(36) NOT NULL DEFAULT 'default',
    page_id BIGINT UNSIGNED NULL,
    page_slug VARCHAR(120) NULL,
    title VARCHAR(80) NOT NULL,
    body VARCHAR(180) NOT NULL,
    url VARCHAR(700) NOT NULL,
    audience VARCHAR(190) NOT NULL,
    attempted INT UNSIGNED NOT NULL DEFAULT 0,
    sent INT UNSIGNED NOT NULL DEFAULT 0,
    removed INT UNSIGNED NOT NULL DEFAULT 0,
    failed INT UNSIGNED NOT NULL DEFAULT 0,
    clicks BIGINT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('sent', 'failed') NOT NULL DEFAULT 'failed',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_campaign_workspace_created (workspace_id, created_at),
    INDEX idx_campaign_page (page_id)
  )`,
];

/* Applied after the CREATE TABLE statements so an existing single-workspace
   database gains the multi-workspace columns in place. Each one is written to
   be safe to re-run: a column or index that is already there is ignored. */
const migrationStatements = [
  `ALTER TABLE workspace_users ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default'`,
  `ALTER TABLE workspace_users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin'`,
  `ALTER TABLE workspace_users ADD INDEX idx_workspace_users_workspace (workspace_id)`,
  `ALTER TABLE workspace_users MODIFY COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ''`,
  `ALTER TABLE pages ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default'`,
  `ALTER TABLE pages ADD INDEX idx_pages_workspace (workspace_id)`,
  `ALTER TABLE uploads ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default'`,
  `ALTER TABLE media_files ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default'`,
  `ALTER TABLE media_files ADD INDEX idx_media_workspace (workspace_id)`,
];

/* Errors that mean "this migration already ran". */
const appliedCodes = new Set(['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_CANT_DROP_FIELD_OR_KEY']);

export function hasMysqlConfig() {
  return Boolean(
    process.env.DATABASE_URL
    || (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD),
  );
}

export function mysqlPool() {
  if (pool) return pool;

  if (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
    const port = Number(process.env.DB_PORT ?? "3306");
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("DB_PORT must be a valid TCP port");
    }

    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    return pool;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("Configure DATABASE_URL or DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD");
  }

  pool = mysql.createPool(process.env.DATABASE_URL);
  return pool;
}

async function ensureMysqlSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const database = mysqlPool();
      for (const statement of schemaStatements) {
        await database.query(statement);
      }
      for (const statement of migrationStatements) {
        try { await database.query(statement); }
        catch (error) { if (!appliedCodes.has((error as { code?: string }).code ?? '')) throw error; }
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export async function mysqlQuery<T>(sql: string, values: unknown[] = []) {
  await ensureMysqlSchema();
  const [rows] = await mysqlPool().execute<mysql.RowDataPacket[] & mysql.ResultSetHeader[]>(
    sql,
    values as (string | number | boolean | Buffer | null)[],
  );
  return rows as T;
}

export type TransactionQuery = <R>(sql: string, values?: unknown[]) => Promise<R>;

export async function withTransaction<T>(handler: (query: TransactionQuery) => Promise<T>) {
  await ensureMysqlSchema();
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
