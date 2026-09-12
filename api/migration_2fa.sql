-- ============================================================
-- migration_2fa.sql — 二次验证升级脚本（给已建表的数据库执行）
-- 用法：在 phpMyAdmin 的 SQL 标签页，分 2 次执行下面两段
-- ============================================================

-- 第 1 次执行：给 users 表加 email 字段
ALTER TABLE users ADD COLUMN email VARCHAR(128) DEFAULT NULL;

-- 第 2 次执行：新建验证码表
CREATE TABLE verify_codes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
