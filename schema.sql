-- Kyoona Connect 2.0 database tables.
-- The app also creates these automatically on start; this file is here so you can
-- set them up (or check them) from phpMyAdmin → SQL. Safe to run more than once.

CREATE TABLE IF NOT EXISTS members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL DEFAULT '',
  city VARCHAR(80) NOT NULL DEFAULT '',
  interests VARCHAR(255) NOT NULL DEFAULT '',
  status ENUM('pending','confirmed','unsubscribed') NOT NULL DEFAULT 'pending',
  token CHAR(48) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME NULL,
  INDEX (status), INDEX (token)
) CHARACTER SET utf8mb4;

-- Events, organizations, announcements and settings (one row each, edited in /admin)
CREATE TABLE IF NOT EXISTS records (
  kind VARCHAR(24) NOT NULL,
  id VARCHAR(120) NOT NULL,
  data LONGTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (kind, id)
) CHARACTER SET utf8mb4;

-- Photos uploaded in /admin
CREATE TABLE IF NOT EXISTS media (
  id CHAR(24) NOT NULL PRIMARY KEY,
  mime VARCHAR(40) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
