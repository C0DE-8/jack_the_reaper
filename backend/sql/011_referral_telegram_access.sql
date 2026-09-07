ALTER TABLE telegram_admin_chats
  ADD COLUMN alert_level ENUM('level1','level2') NOT NULL DEFAULT 'level1';

CREATE TABLE IF NOT EXISTS telegram_referral_assignments (
  chat_id VARCHAR(64) NOT NULL,
  referral_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (chat_id, referral_id),
  FOREIGN KEY (chat_id) REFERENCES telegram_admin_chats(chat_id) ON DELETE CASCADE,
  FOREIGN KEY (referral_id) REFERENCES referral_links(id) ON DELETE CASCADE
);
