<?php
/**
 * Circlix — v1.3.1
 * Database configuration template.
 *
 * Copy this file to config.php and edit with your real MySQL credentials before deploying:
 *   cp api/config.example.php api/config.php
 *
 * Keep config.php outside of version control if it contains production secrets.
 */

declare(strict_types=1);

const DB_HOST = 'localhost';
const DB_NAME = 'circlix_db';
const DB_USER = 'circlix_user';
const DB_PASS = 'your_db_password_here';
const DB_CHARSET = 'utf8mb4';

// Used to sign run tokens (see start_run.php / submit_score.php) and to
// hash IPs for rate limiting. MUST be a long random secret, unique per
// deployment, and never reused elsewhere. Generate one with e.g.:
//   php -r "echo bin2hex(random_bytes(32));"
const SCORE_SIGNING_SECRET = 'change_this_to_a_random_64_char_hex_secret';

// A run token is only valid for this long after it's issued. Generous
// enough to cover a real play session, tight enough that a leaked/old
// token can't be replayed indefinitely.
const RUN_TOKEN_MAX_AGE_SECONDS = 45 * 60;

/**
 * Returns a shared PDO connection, or exits with a JSON error if the
 * database is unreachable (misconfigured credentials, MySQL down, etc).
 */
function cc_get_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', DB_HOST, DB_NAME, DB_CHARSET);

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        return $pdo;
    } catch (PDOException $e) {
        // Deliberately generic: never echo $e->getMessage() here, it can
        // leak the DSN, hostname, or (on some drivers) partial credentials.
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'ok' => false,
            'message' => 'Database unreachable.',
        ]);
        exit;
    }
}

/** Common JSON + security headers for every API endpoint. */
function cc_send_json_headers(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    // No Access-Control-Allow-Origin is set on purpose: without it,
    // browsers block cross-site JS from calling these endpoints, so only
    // this site's own pages (or non-browser tools like curl, which CORS
    // can't stop anyway) can reach them.
}

/** SHA-256 hash of the caller's IP, salted with the signing secret — used
 *  only to bucket rate limits, never stored or logged in reversible form. */
function cc_hash_ip(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return hash('sha256', $ip . '|' . SCORE_SIGNING_SECRET);
}

/**
 * Simple per-IP, per-bucket rate limiter backed by circlix_rate_limit.
 * Returns true if the request is allowed (and records it), false if the
 * caller has exceeded $maxRequests within the last $windowSeconds.
 *
 * This is a lightweight abuse deterrent, not a hard security boundary —
 * under concurrent requests there's a small race window where two
 * requests can both read the same counter before either writes it back.
 * Good enough to stop casual scripted spam; a real DoS still needs
 * protection at the web-server/CDN level.
 */
function cc_rate_limit_check(PDO $pdo, string $bucket, int $maxRequests, int $windowSeconds): bool
{
    $ipHash = cc_hash_ip();

    $stmt = $pdo->prepare('SELECT window_start, count FROM circlix_rate_limit WHERE bucket = :b AND ip_hash = :ip');
    $stmt->execute([':b' => $bucket, ':ip' => $ipHash]);
    $row = $stmt->fetch();

    if (!$row) {
        $ins = $pdo->prepare('INSERT INTO circlix_rate_limit (bucket, ip_hash, window_start, count) VALUES (:b, :ip, NOW(), 1)');
        $ins->execute([':b' => $bucket, ':ip' => $ipHash]);
        return true;
    }

    $windowStart = strtotime((string) $row['window_start']);
    if (time() - $windowStart > $windowSeconds) {
        $upd = $pdo->prepare('UPDATE circlix_rate_limit SET window_start = NOW(), count = 1 WHERE bucket = :b AND ip_hash = :ip');
        $upd->execute([':b' => $bucket, ':ip' => $ipHash]);
        return true;
    }

    if ((int) $row['count'] >= $maxRequests) {
        return false;
    }

    $upd = $pdo->prepare('UPDATE circlix_rate_limit SET count = count + 1 WHERE bucket = :b AND ip_hash = :ip');
    $upd->execute([':b' => $bucket, ':ip' => $ipHash]);
    return true;
}
