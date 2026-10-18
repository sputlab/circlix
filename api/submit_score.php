<?php
/**
 * Circlix — v1.2.1
 * POST /api/submit_score.php
 * Body (JSON): { "player_name": "...", "score": 1234, "difficulty": "easy", "run_token": "..." }
 *
 * Validates and inserts a new leaderboard entry.
 *
 * Anti-abuse layers, in order:
 *   1. Per-IP rate limiting (cc_rate_limit_check).
 *   2. A signed run_token (from start_run.php) must be present, valid,
 *      unexpired, and matching the submitted difficulty.
 *   3. The run_token can only ever be redeemed once (circlix_run_tokens_used).
 *   4. The score is checked against a per-difficulty points-per-second
 *      ceiling, scaled by the token's elapsed time — a submission
 *      claiming more points than are plausible for the time actually
 *      played is rejected.
 *
 * This still isn't fully server-authoritative gameplay (the game logic
 * and scoring run entirely client-side), so a sufficiently motivated
 * attacker who reverse-engineers the token format could still submit an
 * inflated-but-plausible score. See SECURITY.md for the full trade-off
 * write-up and what a stronger fix would look like.
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

if (!cc_rate_limit_check($pdo, 'submit_score', 30, 3600)) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'message' => 'Too many requests. Please slow down.']);
    exit;
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);

if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Invalid request body.']);
    exit;
}

$playerName = trim((string) ($body['player_name'] ?? ''));
$score = $body['score'] ?? null;
$difficulty = $body['difficulty'] ?? '';
$runToken = trim((string) ($body['run_token'] ?? ''));

// --- basic shape validation -------------------------------------------

if ($playerName === '') {
    $playerName = 'Anonymous';
}
// Strip control characters, collapse whitespace, hard length cap.
$playerName = preg_replace('/[\x00-\x1F\x7F]/u', '', $playerName) ?? 'Anonymous';
$playerName = mb_substr(trim($playerName), 0, 16);
if ($playerName === '') {
    $playerName = 'Anonymous';
}

if (!in_array($difficulty, ['easy', 'hard'], true)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Invalid difficulty.']);
    exit;
}

if (!is_int($score) && !(is_float($score) && floor($score) == $score)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Invalid score.']);
    exit;
}
$score = (int) $score;

// Hard outer bound, independent of the run-token check below — cheap to
// check first and rejects obvious garbage (negative numbers, overflow
// attempts) before touching the database.
const MAX_PLAUSIBLE_SCORE = 200000;
if ($score < 0 || $score > MAX_PLAUSIBLE_SCORE) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Score out of range.']);
    exit;
}

// --- run token validation ----------------------------------------------

if ($runToken === '' || substr_count($runToken, '.') !== 1) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Missing or invalid run token.']);
    exit;
}

[$payloadB64, $signature] = explode('.', $runToken, 2);
$expectedSignature = hash_hmac('sha256', $payloadB64, SCORE_SIGNING_SECRET);

if (!hash_equals($expectedSignature, $signature)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Invalid run token.']);
    exit;
}

$payloadJson = base64_decode(strtr($payloadB64, '-_', '+/'));
$payload = is_string($payloadJson) ? json_decode($payloadJson, true) : null;

if (!is_array($payload) || !isset($payload['difficulty'], $payload['issued_at'])) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Malformed run token.']);
    exit;
}

if ($payload['difficulty'] !== $difficulty) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Run token does not match difficulty.']);
    exit;
}

$issuedAt = (int) $payload['issued_at'];
$elapsedSeconds = time() - $issuedAt;

if ($elapsedSeconds < 0 || $elapsedSeconds > RUN_TOKEN_MAX_AGE_SECONDS) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Run token expired.']);
    exit;
}

// Generous points-per-second ceilings, derived from each difficulty's
// survival rate plus room for frequent, near-perfect target/bonus hits.
// Comfortably above what real play can achieve, but far below the old
// flat 999999 cap — a submission has to at least be plausible for the
// time actually spent in that run.
const MAX_POINTS_PER_SECOND = ['easy' => 40, 'hard' => 65];
const SCORE_CEILING_BUFFER = 300; // slack for the first few seconds / clock skew

$ceiling = $elapsedSeconds * MAX_POINTS_PER_SECOND[$difficulty] + SCORE_CEILING_BUFFER;
if ($score > $ceiling) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Score not plausible for this run.']);
    exit;
}

// One-time use: redeem the token before inserting the score. The
// primary key on token_hash makes the second attempt fail atomically.
$tokenHash = hash('sha256', $runToken);
try {
    $insToken = $pdo->prepare('INSERT INTO circlix_run_tokens_used (token_hash) VALUES (:h)');
    $insToken->execute([':h' => $tokenHash]);
} catch (PDOException $e) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'This run token has already been used.']);
    exit;
}

// --- insert -----------------------------------------------------------

$stmt = $pdo->prepare(
    'INSERT INTO circlix_scores (player_name, score, difficulty, created_at)
     VALUES (:player_name, :score, :difficulty, NOW())'
);
$stmt->bindValue(':player_name', $playerName, PDO::PARAM_STR);
$stmt->bindValue(':score', $score, PDO::PARAM_INT);
$stmt->bindValue(':difficulty', $difficulty, PDO::PARAM_STR);
$stmt->execute();

echo json_encode([
    'ok' => true,
    'id' => (int) $pdo->lastInsertId(),
]);
