<?php
/**
 * Circlix — v1.2.1
 * POST /api/start_run.php
 * Body (JSON): { "difficulty": "easy" }
 *
 * Issues a signed "run token" binding a difficulty to a start timestamp.
 * The client holds onto this for the whole run and sends it back with
 * submit_score.php, which uses the elapsed time to sanity-check the
 * claimed score and to make sure each token can only be redeemed once.
 *
 * This does NOT make the leaderboard fully tamper-proof (the game still
 * computes its own score client-side — see SECURITY.md for the full
 * write-up) but it closes the trivial "POST any score directly" hole.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

cc_send_json_headers();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'Method not allowed.']);
    exit;
}

$pdo = cc_get_pdo();

if (!cc_rate_limit_check($pdo, 'start_run', 40, 3600)) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'message' => 'Too many requests. Please slow down.']);
    exit;
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
$difficulty = is_array($body) ? ($body['difficulty'] ?? '') : '';

if (!in_array($difficulty, ['easy', 'hard'], true)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Invalid difficulty.']);
    exit;
}

$issuedAt = time();
$payload = json_encode([
    'difficulty' => $difficulty,
    'issued_at' => $issuedAt,
    'nonce' => bin2hex(random_bytes(8)),
]);
$payloadB64 = rtrim(strtr(base64_encode((string) $payload), '+/', '-_'), '=');
$signature = hash_hmac('sha256', $payloadB64, SCORE_SIGNING_SECRET);

echo json_encode([
    'ok' => true,
    'token' => $payloadB64 . '.' . $signature,
]);
