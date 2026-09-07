CREATE TABLE IF NOT EXISTS visitor_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  user_agent VARCHAR(1024) NOT NULL,
  visit_count INT UNSIGNED NOT NULL DEFAULT 1,
  first_visit TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_visit TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_visit_duration BIGINT UNSIGNED NOT NULL DEFAULT 0,
  referrer VARCHAR(2048) NOT NULL DEFAULT '',
  country VARCHAR(128) NOT NULL DEFAULT '',
  city VARCHAR(255) NOT NULL DEFAULT '',
  region VARCHAR(255) NOT NULL DEFAULT '',
  browser VARCHAR(128) NOT NULL DEFAULT '',
  os VARCHAR(128) NOT NULL DEFAULT '',
  device_type VARCHAR(64) NOT NULL DEFAULT '',
  screen_resolution VARCHAR(64) NOT NULL DEFAULT '',
  language VARCHAR(32) NOT NULL DEFAULT '',
  current_page VARCHAR(2048) NOT NULL DEFAULT '',
  last_page VARCHAR(2048) NOT NULL DEFAULT '',
  utm_source VARCHAR(255) NOT NULL DEFAULT '',
  utm_medium VARCHAR(255) NOT NULL DEFAULT '',
  utm_campaign VARCHAR(255) NOT NULL DEFAULT '',
  utm_term VARCHAR(255) NOT NULL DEFAULT '',
  utm_content VARCHAR(255) NOT NULL DEFAULT '',
  INDEX idx_visitor_logs_last_visit (last_visit),
  INDEX idx_visitor_logs_ip_user_agent (ip_address, user_agent(255)),
  INDEX idx_visitor_logs_device_type (device_type),
  INDEX idx_visitor_logs_browser (browser),
  INDEX idx_visitor_logs_country (country)
);

CREATE TABLE IF NOT EXISTS visitor_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  visitor_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  event_data JSON NULL,
  page_url VARCHAR(2048) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_visitor_events_visitor_created (visitor_id, created_at),
  INDEX idx_visitor_events_event_type (event_type),
  CONSTRAINT fk_visitor_events_visitor
    FOREIGN KEY (visitor_id)
    REFERENCES visitor_logs (id)
    ON DELETE CASCADE
);
