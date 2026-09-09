CREATE TABLE admins (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE pages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  workspace_id CHAR(36) NOT NULL DEFAULT 'default',
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
  INDEX idx_pages_status_slug (status, slug),
  INDEX idx_pages_workspace (workspace_id)
);

CREATE TABLE page_blocks (
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
);

CREATE TABLE page_views (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  page_id BIGINT UNSIGNED NOT NULL,
  visitor_hash CHAR(64) NOT NULL,
  device_type VARCHAR(30) NOT NULL,
  referrer VARCHAR(255) NOT NULL DEFAULT 'Direct',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_views_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  INDEX idx_views_page_date (page_id, created_at),
  INDEX idx_views_unique (page_id, visitor_hash)
);

CREATE TABLE link_clicks (
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
);

CREATE TABLE uploads (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  page_id BIGINT UNSIGNED NULL,
  workspace_id CHAR(36) NOT NULL DEFAULT 'default',
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  storage_path VARCHAR(700) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_uploads_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE SET NULL
);

CREATE TABLE push_subscriptions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  page_id BIGINT UNSIGNED NOT NULL,
  endpoint_hash CHAR(64) NOT NULL UNIQUE,
  subscription_json JSON NOT NULL,
  user_agent VARCHAR(500) NULL,
  client_details JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_failed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_push_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  INDEX idx_push_page (page_id)
);

CREATE TABLE settings (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  setting_key VARCHAR(120) NOT NULL UNIQUE,
  setting_value JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS workspaces (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  owner_email VARCHAR(190) NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_workspaces_owner (owner_email)
);

-- One account per email across the whole install. workspace_id is the
-- membership: every account belongs to exactly one workspace, and role says
-- whether it owns that workspace. An empty password_hash is a pending invite:
-- the address was added by a workspace before that person signed up.
CREATE TABLE IF NOT EXISTS workspace_users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  workspace_id CHAR(36) NOT NULL DEFAULT 'default',
  role VARCHAR(20) NOT NULL DEFAULT 'admin',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  session_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_workspace_users_workspace (workspace_id)
);

-- Upgrading an existing single-workspace database.
-- The app applies these itself on first connection and ignores them when they
-- have already run, so this block is only for applying them by hand. Existing
-- rows land in the 'default' workspace, which ADMIN_EMAIL owns.
--
--   ALTER TABLE workspace_users ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default';
--   ALTER TABLE workspace_users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin';
--   ALTER TABLE workspace_users ADD INDEX idx_workspace_users_workspace (workspace_id);
--   ALTER TABLE workspace_users MODIFY COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT '';
--   ALTER TABLE pages ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default';
--   ALTER TABLE pages ADD INDEX idx_pages_workspace (workspace_id);
--   ALTER TABLE uploads ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default';
