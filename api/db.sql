-- ============================================================
-- db.sql — Wave 音乐播放器数据库建表脚本
-- 在 InfinityFree 控制面板的 phpMyAdmin 中执行本文件
-- ============================================================

SET NAMES utf8mb4;

-- 用户表
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(32) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `email` VARCHAR(128) DEFAULT NULL,
  `token` VARCHAR(64) DEFAULT NULL,
  `uid` BIGINT UNSIGNED DEFAULT NULL,
  `nickname` VARCHAR(32) DEFAULT NULL,
  `avatar` VARCHAR(512) DEFAULT NULL,
  `gender` VARCHAR(16) DEFAULT NULL,
  `age` TINYINT UNSIGNED DEFAULT NULL,
  `hobby` VARCHAR(255) DEFAULT NULL,
  `signature` VARCHAR(200) DEFAULT NULL,
  `region` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_uid` (`uid`),
  KEY `idx_token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 邮箱验证码表（二次验证登录用）
CREATE TABLE IF NOT EXISTS `verify_codes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `code` VARCHAR(6) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 收藏表（一个用户一首歌一条记录）
CREATE TABLE IF NOT EXISTS `favorites` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `song_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_song` (`user_id`, `song_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 播放列表表
CREATE TABLE IF NOT EXISTS `playlists` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 播放列表-歌曲关联表
CREATE TABLE IF NOT EXISTS `playlist_songs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `playlist_id` INT UNSIGNED NOT NULL,
  `song_id` VARCHAR(64) NOT NULL,
  `position` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pl_song` (`playlist_id`, `song_id`),
  KEY `idx_playlist` (`playlist_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 收听历史表（权重用于推荐画像）
CREATE TABLE IF NOT EXISTS `history` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `song_id` VARCHAR(64) NOT NULL,
  `weight` FLOAT NOT NULL DEFAULT 1,
  `last_played` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_song` (`user_id`, `song_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 好友关系表（双向，添加时插两条）
CREATE TABLE IF NOT EXISTS `friends` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `friend_id` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_friend` (`user_id`, `friend_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 歌曲分享表
CREATE TABLE IF NOT EXISTS `song_shares` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `from_user` INT UNSIGNED NOT NULL,
  `to_user` INT UNSIGNED NOT NULL,
  `song_id` VARCHAR(64) NOT NULL,
  `song_data` MEDIUMTEXT NOT NULL,
  `message` VARCHAR(200) DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_to` (`to_user`),
  KEY `idx_from` (`from_user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
