-- One-time cleanup for databases that previously ran 009_activity.sql.
-- Keeps referral_links and its existing records, but removes its old activity-only assignment.
SET @referral_operator_fk = (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'referral_links'
    AND COLUMN_NAME = 'operator_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);
SET @drop_referral_operator_fk = IF(
  @referral_operator_fk IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `referral_links` DROP FOREIGN KEY `', @referral_operator_fk, '`')
);
PREPARE remove_referral_operator_fk FROM @drop_referral_operator_fk;
EXECUTE remove_referral_operator_fk;
DEALLOCATE PREPARE remove_referral_operator_fk;

SET @referral_operator_column = (
  SELECT COLUMN_NAME
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'referral_links'
    AND COLUMN_NAME = 'operator_id'
  LIMIT 1
);
SET @drop_referral_operator_column = IF(
  @referral_operator_column IS NULL,
  'SELECT 1',
  'ALTER TABLE `referral_links` DROP COLUMN `operator_id`'
);
PREPARE remove_referral_operator_column FROM @drop_referral_operator_column;
EXECUTE remove_referral_operator_column;
DEALLOCATE PREPARE remove_referral_operator_column;

DROP TABLE IF EXISTS telegram_alert_deliveries;
DROP TABLE IF EXISTS activity_events;
DROP TABLE IF EXISTS activity_sessions;
DROP TABLE IF EXISTS telegram_invitations;
DROP TABLE IF EXISTS telegram_operator_chats;
DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS operators;
