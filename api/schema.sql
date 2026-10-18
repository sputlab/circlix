-- Circlix — v1.2.1
-- Schema for the global leaderboard.
-- Import with: mysql -u <user> -p <database> < schema.sql

CREATE TABLE IF NOT EXISTS `circlix_scores` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `player_name` VARCHAR(16)  NOT NULL,
  `score`       INT UNSIGNED NOT NULL,
  `difficulty`  ENUM('easy','hard') NOT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_difficulty_score` (`difficulty`, `score` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Anti-abuse: each run token (issued by start_run.php) can only be
-- redeemed once by submit_score.php. Rows can be pruned periodically
-- (e.g. anything older than RUN_TOKEN_MAX_AGE_SECONDS is safe to delete).
CREATE TABLE IF NOT EXISTS `circlix_run_tokens_used` (
  `token_hash` CHAR(64) NOT NULL,
  `used_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Anti-abuse: lightweight per-IP request counter used by
-- cc_rate_limit_check() in config.php. `ip_hash` is a salted SHA-256,
-- never the raw IP. Safe to truncate/reset at any time.
CREATE TABLE IF NOT EXISTS `circlix_rate_limit` (
  `bucket`       VARCHAR(32) NOT NULL,
  `ip_hash`      CHAR(64)    NOT NULL,
  `window_start` DATETIME    NOT NULL,
  `count`        INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`bucket`, `ip_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
