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
  source VARCHAR(32) NOT NULL,
  chat_id VARCHAR(64) NULL,
  created_by VARCHAR(255) NULL,
  word_count TINYINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_word_batches_created_at (created_at),
  INDEX idx_word_batches_chat_id (chat_id)
);

CREATE TABLE IF NOT EXISTS word_batch_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  word VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_word_batch_position (batch_id, position),
  INDEX idx_word_batch_items_word (word),
  CONSTRAINT fk_word_batch_items_batch
    FOREIGN KEY (batch_id)
    REFERENCES word_batches (id)
    ON DELETE CASCADE
);
