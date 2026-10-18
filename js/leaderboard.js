/* ==========================================================================
   Circlix — v1.2.1
   Leaderboard client — talks to the PHP/MySQL backend in /api
   ========================================================================== */

(function () {
  'use strict';

  const API_BASE = 'api';

  async function getScores(difficulty, limit) {
    const params = new URLSearchParams({
      difficulty: difficulty === 'hard' ? 'hard' : 'easy',
      limit: String(limit || 10)
    });
    const res = await fetch(`${API_BASE}/get_scores.php?${params.toString()}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || 'Errore');
    return data.scores;
  }

  // Called when a run starts. Returns a signed token (or null if the
  // request fails) that must be sent back with submitScore() — see
  // api/start_run.php and api/submit_score.php for why.
  async function startRun(difficulty) {
    try {
      const res = await fetch(`${API_BASE}/start_run.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty: difficulty === 'hard' ? 'hard' : 'easy' })
      });
      const data = await res.json().catch(() => null);
      return data && data.ok ? data.token : null;
    } catch (err) {
      return null;
    }
  }

  async function submitScore(playerName, score, difficulty, runToken) {
    const res = await fetch(`${API_BASE}/submit_score.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_name: playerName,
        score: score,
        difficulty: difficulty === 'hard' ? 'hard' : 'easy',
        run_token: runToken
      })
    });
    const data = await res.json().catch(() => ({ ok: false, message: 'Risposta non valida dal server' }));
    return data;
  }

  window.CCLeaderboard = { getScores, startRun, submitScore };
})();
