ALTER TABLE operators
  MODIFY admin_id BIGINT UNSIGNED NULL,
  ADD COLUMN telegram_chat_id VARCHAR(64) NULL AFTER admin_id,
  ADD UNIQUE KEY uniq_operators_telegram_chat_id (telegram_chat_id),
  ADD CONSTRAINT fk_operators_telegram_admin_chat
    FOREIGN KEY (telegram_chat_id) REFERENCES telegram_admin_chats(chat_id) ON DELETE CASCADE;

UPDATE operators o
JOIN (
  SELECT operator_id, MIN(chat_id) AS chat_id
  FROM telegram_operator_chats
  GROUP BY operator_id
) existing_chat ON existing_chat.operator_id = o.id
SET o.telegram_chat_id = existing_chat.chat_id
WHERE o.telegram_chat_id IS NULL;

