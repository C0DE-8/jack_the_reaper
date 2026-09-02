ALTER TABLE word_batches
  ADD COLUMN approval_status VARCHAR(32) NOT NULL DEFAULT 'pending' AFTER word_count,
  ADD COLUMN reviewed_by_chat_id VARCHAR(64) NULL AFTER approval_status,
  ADD COLUMN reviewed_by_name VARCHAR(255) NULL AFTER reviewed_by_chat_id,
  ADD COLUMN reviewed_at TIMESTAMP NULL AFTER reviewed_by_name,
  ADD INDEX idx_word_batches_approval_status (approval_status);

CREATE TABLE IF NOT EXISTS word_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  word_hash CHAR(64) NULL,
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
