import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;
let schemaReady: Promise<void> | null = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS workspace_settings (
    workspace_id CHAR(36) NOT NULL,
    setting_key VARCHAR(190) NOT NULL,
    setting_value JSON NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, setting_key)
  )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(190) NOT NULL,
    owner_email VARCHAR(190) NOT NULL,
    status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_workspaces_owner (owner_email)
  )`,
  `CREATE TABLE IF NOT EXISTS custom_domains (
    id CHAR(36) PRIMARY KEY,
    hostname VARCHAR(253) NOT NULL UNIQUE,
    workspace_id CHAR(36) NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    status ENUM('pending_dns', 'verifying', 'verified', 'ssl_pending', 'active', 'error', 'disabled') NOT NULL DEFAULT 'pending_dns',
    ssl_status ENUM('pending', 'active', 'error', 'disabled') NOT NULL DEFAULT 'pending',
    last_checked_at DATETIME NULL,
    last_verified_at DATETIME NULL,
    verification_error VARCHAR(700) NULL,
    ssl_updated_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_custom_domains_workspace (workspace_id),
    INDEX idx_custom_domains_status (status)
  )`,
  `CREATE TABLE IF NOT EXISTS domain_audit_events (
    sequence BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    id CHAR(36) NOT NULL UNIQUE,
    domain_id CHAR(36) NULL,
    hostname VARCHAR(253) NOT NULL,
    workspace_id CHAR(36) NULL,
    action VARCHAR(40) NOT NULL,
    actor_email VARCHAR(190) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_domain_audit_domain_created (domain_id, created_at),
    INDEX idx_domain_audit_workspace_created (workspace_id, created_at)
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
    country VARCHAR(100) NULL,
    city VARCHAR(100) NULL,
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
    country VARCHAR(100) NULL,
    city VARCHAR(100) NULL,
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
  `CREATE TABLE IF NOT EXISTS workspace_branding (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    workspace_id CHAR(36) NOT NULL UNIQUE,
    workspace_name VARCHAR(120) NULL,
    logo_url VARCHAR(700) NULL,
    favicon_url VARCHAR(700) NULL,
    site_title VARCHAR(200) NULL,
    meta_description VARCHAR(500) NULL,
    login_logo_url VARCHAR(700) NULL,
    login_background_url VARCHAR(700) NULL,
    login_title VARCHAR(160) NULL,
    login_subtitle VARCHAR(300) NULL,
    primary_color VARCHAR(30) NULL,
    secondary_color VARCHAR(30) NULL,
    button_color VARCHAR(30) NULL,
    link_color VARCHAR(30) NULL,
    footer_text VARCHAR(400) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_workspace_branding_workspace (workspace_id)
  )`,
];

/* Applied after the CREATE TABLE statements so an existing single-workspace
   database gains the multi-workspace columns in place. Each one is written to
   be safe to re-run: a column or index that is already there is ignored. */
const migrationStatements = [
  `CREATE TABLE IF NOT EXISTS workspace_branding (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    workspace_id CHAR(36) NOT NULL UNIQUE,
    workspace_name VARCHAR(120) NULL,
    logo_url VARCHAR(700) NULL,
    favicon_url VARCHAR(700) NULL,
    site_title VARCHAR(200) NULL,
    meta_description VARCHAR(500) NULL,
    login_logo_url VARCHAR(700) NULL,
    login_background_url VARCHAR(700) NULL,
    login_title VARCHAR(160) NULL,
    login_subtitle VARCHAR(300) NULL,
    primary_color VARCHAR(30) NULL,
    secondary_color VARCHAR(30) NULL,
    button_color VARCHAR(30) NULL,
    link_color VARCHAR(30) NULL,
    footer_text VARCHAR(400) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_workspace_branding_workspace (workspace_id)
  )`,
  `ALTER TABLE workspace_users ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default'`,
  `ALTER TABLE workspace_users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin'`,
  `ALTER TABLE workspace_users ADD COLUMN permissions JSON NULL`,
  `ALTER TABLE workspace_users ADD COLUMN invite_hash CHAR(64) NULL`,
  `ALTER TABLE workspace_users ADD COLUMN invite_expires_at DATETIME NULL`,
  `ALTER TABLE admins ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE admins ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1`,
  `ALTER TABLE workspace_users ADD INDEX idx_workspace_users_workspace (workspace_id)`,
  `ALTER TABLE workspace_users MODIFY COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ''`,
  `ALTER TABLE pages ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default'`,
  `ALTER TABLE pages ADD INDEX idx_pages_workspace (workspace_id)`,
  `ALTER TABLE uploads ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default'`,
  `ALTER TABLE media_files ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default'`,
  `ALTER TABLE media_files ADD INDEX idx_media_workspace (workspace_id)`,
  `UPDATE uploads u INNER JOIN pages p ON p.id = u.page_id SET u.workspace_id = p.workspace_id WHERE u.workspace_id <> p.workspace_id`,
  ...['page_blocks', 'page_views', 'link_clicks'].flatMap(table => [
    `ALTER TABLE ${table} ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default'`,
    `ALTER TABLE ${table} ADD INDEX idx_${table}_workspace (workspace_id)`,
    `UPDATE ${table} child INNER JOIN pages p ON p.id = child.page_id SET child.workspace_id = p.workspace_id WHERE child.workspace_id <> p.workspace_id`,
  ]),
  // This table only holds platform settings. Page-specific settings live on
  // pages (workspace_id) and blocks (workspace_id), never in the global table.
  `ALTER TABLE settings ADD COLUMN workspace_id CHAR(36) NULL DEFAULT NULL`,
  `ALTER TABLE page_views ADD COLUMN country VARCHAR(100) NULL`,
  `ALTER TABLE page_views ADD COLUMN city VARCHAR(100) NULL`,
  `ALTER TABLE link_clicks ADD COLUMN country VARCHAR(100) NULL`,
  `ALTER TABLE link_clicks ADD COLUMN city VARCHAR(100) NULL`,
  `ALTER TABLE custom_domains ADD INDEX idx_custom_domains_host_status (hostname, status)`,
  `ALTER TABLE pages ADD INDEX idx_pages_ws_slug_status (workspace_id, slug, status)`,
  `ALTER TABLE page_blocks ADD INDEX idx_blocks_page_active_order (page_id, is_active, sort_order)`,
   `ALTER TABLE page_views ADD INDEX idx_views_ws_created (workspace_id, created_at)`,
   `ALTER TABLE link_clicks ADD INDEX idx_clicks_ws_created (workspace_id, created_at)`,
];

/* Errors that mean "this migration already ran". */
const appliedCodes = new Set(['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_CANT_DROP_FIELD_OR_KEY']);

export function hasMysqlConfig() {
  return Boolean(
    process.env.DATABASE_URL
    || (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD),
  );
}

// Circuit breaker state
let consecutiveFailures = 0;
let circuitBreakerOpenUntil = 0;
const FAILURE_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 15000;

export function isDatabaseCircuitOpen(): boolean {
  return Date.now() < circuitBreakerOpenUntil;
}

function recordDbSuccess() {
  consecutiveFailures = 0;
}

function recordDbFailure() {
  consecutiveFailures++;
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitBreakerOpenUntil = Date.now() + CIRCUIT_RESET_MS;
    console.warn(`[MySQL Circuit Breaker] OPENED for ${CIRCUIT_RESET_MS / 1000}s after ${consecutiveFailures} consecutive failures.`);
  }
}

export function mysqlPool() {
  if (pool) return pool;

  const poolMax = Math.min(Math.max(Number(process.env.DB_POOL_MAX || 30), 5), 100);

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
      waitForConnections: true,
      connectionLimit: poolMax,
      queueLimit: 500,
      connectTimeout: 5000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
    return pool;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("Configure DATABASE_URL or DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD");
  }

  pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: poolMax,
    queueLimit: 500,
    connectTimeout: 5000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
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
  if (isDatabaseCircuitOpen()) {
    throw new Error('Database temporarily unavailable (circuit breaker open). Serving cached content.');
  }

  await ensureMysqlSchema();
  const start = Date.now();
  try {
    const [rows] = await mysqlPool().execute<mysql.RowDataPacket[] & mysql.ResultSetHeader[]>(
      sql,
      values as (string | number | boolean | Buffer | null)[],
    );
    recordDbSuccess();
    const duration = Date.now() - start;
    if (duration > 250 && process.env.NODE_ENV !== 'production') {
      console.warn(`[MySQL Slow Query ${duration}ms]: ${sql.slice(0, 120)}`);
    }
    return rows as T;
  } catch (error) {
    recordDbFailure();
    throw error;
  }
}

export type TransactionQuery = <R>(sql: string, values?: unknown[]) => Promise<R>;

export async function withTransaction<T>(handler: (query: TransactionQuery) => Promise<T>) {
  if (isDatabaseCircuitOpen()) {
    throw new Error('Database temporarily unavailable (circuit breaker open).');
  }

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
    recordDbSuccess();
    return result;
  } catch (error) {
    await connection.rollback();
    recordDbFailure();
    throw error;
  } finally {
    connection.release();
  }
}
