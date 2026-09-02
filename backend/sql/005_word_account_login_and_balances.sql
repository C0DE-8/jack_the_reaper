ALTER TABLE word_batches
  ADD COLUMN word_hash CHAR(64) NULL AFTER title,
  ADD INDEX idx_word_batches_word_hash (word_hash);

ALTER TABLE word_accounts
  ADD COLUMN word_hash CHAR(64) NULL AFTER batch_id,
  ADD UNIQUE KEY uniq_word_accounts_word_hash (word_hash);
