<?php
/**
 * Circlix — v1.2.1
 * GET /api/get_scores.php?difficulty=easy|hard&limit=10
 *
 * Returns the top N scores for the requested difficulty, highest first.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

cc_send_json_headers();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'Method not allowed.']);
    exit;
}

$difficulty = $_GET['difficulty'] ?? 'easy';
if (!in_array($difficulty, ['easy', 'hard'], true)) {
    $difficulty = 'easy';
}

$limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 10;
$limit = max(1, min(50, $limit));

$pdo = cc_get_pdo();

if (!cc_rate_limit_check($pdo, 'get_scores', 120, 3600)) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'message' => 'Too many requests. Please slow down.']);
    exit;
}

$stmt = $pdo->prepare(
    'SELECT player_name, score, created_at
     FROM circlix_scores
     WHERE difficulty = :difficulty
     ORDER BY score DESC, created_at ASC
     LIMIT :limit'
);
$stmt->bindValue(':difficulty', $difficulty, PDO::PARAM_STR);
$stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
$stmt->execute();

$rows = $stmt->fetchAll();

echo json_encode([
    'ok' => true,
    'difficulty' => $difficulty,
    'scores' => $rows,
]);
