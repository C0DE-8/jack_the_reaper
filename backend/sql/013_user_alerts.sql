CREATE TABLE IF NOT EXISTS user_alerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  severity ENUM('info', 'success', 'warning', 'error') NOT NULL DEFAULT 'info',
  target_account_number VARCHAR(64) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  expires_at DATETIME NULL,
  created_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_alerts_delivery (active, target_account_number, expires_at, created_at)
);
