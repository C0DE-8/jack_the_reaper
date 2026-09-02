CREATE TABLE IF NOT EXISTS telegram_admin_chats (
  chat_id VARCHAR(64) PRIMARY KEY,
  telegram_user_id VARCHAR(64) NULL,
  username VARCHAR(255) NULL,
  first_name VARCHAR(255) NULL,
  last_name VARCHAR(255) NULL,
  authorized TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS word_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NULL,
  word_hash CHAR(64) NOT NULL,
  source VARCHAR(32) NOT NULL,
  chat_id VARCHAR(64) NULL,
  created_by VARCHAR(255) NULL,
  word_count INT UNSIGNED NOT NULL,
  approval_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  reviewed_by_chat_id VARCHAR(64) NULL,
  reviewed_by_name VARCHAR(255) NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_word_batches_created_at (created_at),
  INDEX idx_word_batches_approval_status (approval_status),
  INDEX idx_word_batches_word_hash (word_hash),
  INDEX idx_word_batches_chat_id (chat_id)
);

CREATE TABLE IF NOT EXISTS word_batch_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  position INT UNSIGNED NOT NULL,
  word VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_word_batch_position (batch_id, position),
  INDEX idx_word_batch_items_word (word),
  CONSTRAINT fk_word_batch_items_batch
    FOREIGN KEY (batch_id)
    REFERENCES word_batches (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS word_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  word_hash CHAR(64) NOT NULL,
  account_number VARCHAR(64) NOT NULL,
  title VARCHAR(255) NULL,
  usdt_balance DECIMAL(24, 8) NOT NULL DEFAULT 0,
  btc_balance DECIMAL(24, 8) NOT NULL DEFAULT 0,
  eth_balance DECIMAL(24, 8) NOT NULL DEFAULT 0,
  bnb_balance DECIMAL(24, 8) NOT NULL DEFAULT 0,
  tron_balance DECIMAL(24, 8) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_word_accounts_batch_id (batch_id),
  UNIQUE KEY uniq_word_accounts_word_hash (word_hash),
  UNIQUE KEY uniq_word_accounts_account_number (account_number),
  CONSTRAINT fk_word_accounts_batch
    FOREIGN KEY (batch_id)
    REFERENCES word_batches (id)
    ON DELETE CASCADE
);
