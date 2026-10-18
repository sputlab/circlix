/* ==========================================================================
   Circlix — v1.2.1
   Game engine (vanilla JS, canvas 2D)
   -------------------------------------------------------------------------
   Mechanic
   - Player orbits a fixed circular track, split into an inner and an outer
     lane. A single input (tap / click / Space / ArrowUp) toggles lane.
   - Obstacles and targets are fixed "bands" on the track. Passing through
     a band on the wrong lane costs a life (obstacle) or does nothing
     (target). Passing through on the matching lane scores points (target)
     or is a safe dodge (obstacle).
   - Angular speed increases continuously, shrinking the reaction window.
   ========================================================================== */

(function () {
  'use strict';

  const TWO_PI = Math.PI * 2;

  const DIFFICULTY = {
    easy: {
      lives: 4,
      maxLives: 8,           // 4 starting + up to 4 earned
      targetsPerExtraLife: 8,
      baseSpeed: 1.05,      // rad/s
      rampRate: 0.005,      // rad/s^2 — reaching 2.5x now takes ~5 min instead of ~2
      maxSpeed: 3.0,
      spawnGapMin: 0.62,    // rad between spawns
      spawnGapMax: 0.95,
      bandWidth: 0.30,      // rad
      obstacleChance: 0.5,
      targetChance: 0.28,
      slowChance: 0.05,      // "rallenta" bonus segment — was too frequent at 0.12
      lifeChance: 0.008,      // rare "+2 vite" bonus segment — made rarer
      bombChance: 0.025,      // clears all obstacles currently on the track
      targetPoints: 80,
      survivalPointsPerSec: 12,
      slowFactor: 0.5,        // temporary speed multiplier while active
      slowDurationMs: 3200,
      lifeBonusAmount: 2
    },
    hard: {
      lives: 2,
      maxLives: 4,           // 2 starting + up to 2 earned
      targetsPerExtraLife: 6,
      baseSpeed: 1.6,
      rampRate: 0.010,      // was too steep — reaching 2.5x now takes ~4 min instead of ~2
      maxSpeed: 4.6,
      spawnGapMin: 0.46,
      spawnGapMax: 0.72,
      bandWidth: 0.20,
      obstacleChance: 0.56,
      targetChance: 0.24,
      slowChance: 0.04,
      lifeChance: 0.006,
      bombChance: 0.02,
      targetPoints: 130,
      survivalPointsPerSec: 18,
      slowFactor: 0.55,
      slowDurationMs: 2600,
      lifeBonusAmount: 2
    }
  };

  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const el = {
    splash: document.getElementById('splash'),
    game: document.getElementById('game'),
    pauseOverlay: document.getElementById('pause-overlay'),
    gameoverOverlay: document.getElementById('gameover-overlay'),
    leaderboardOverlay: document.getElementById('leaderboard-overlay'),
    hudScore: document.getElementById('hud-score'),
    hudLives: document.getElementById('hud-lives'),
    hudSpeed: document.getElementById('hud-speed'),
    tapZone: document.getElementById('tap-zone'),
    btnPause: document.getElementById('btn-pause'),
    btnResume: document.getElementById('btn-resume'),
    btnQuit: document.getElementById('btn-quit'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnGotoMenu: document.getElementById('btn-goto-menu'),
    btnGotoLeaderboard: document.getElementById('btn-goto-leaderboard'),
    btnOpenLeaderboard: document.getElementById('btn-open-leaderboard'),
    quickguideOverlay: document.getElementById('quickguide-overlay'),
    btnOpenQuickguide: document.getElementById('btn-open-quickguide'),
    btnCloseQuickguide: document.getElementById('btn-close-quickguide'),
    btnToggleSound: document.getElementById('btn-toggle-sound'),
    settingsSoundValue: document.getElementById('settings-sound-value'),
    btnPauseSound: document.getElementById('btn-pause-sound'),
    btnCloseLeaderboard: document.getElementById('btn-close-leaderboard'),
    settingsOverlay: document.getElementById('settings-overlay'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    changelogOverlay: document.getElementById('changelog-overlay'),
    btnOpenChangelog: document.getElementById('btn-open-changelog'),
    btnCloseChangelog: document.getElementById('btn-close-changelog'),
    guideOverlay: document.getElementById('guide-overlay'),
    btnOpenGuide: document.getElementById('btn-open-guide'),
    btnCloseGuide: document.getElementById('btn-close-guide'),
    btnSubmitScore: document.getElementById('btn-submit-score'),
    goScoreValue: document.getElementById('go-score-value'),
    goDiffValue: document.getElementById('go-diff-value'),
    goName: document.getElementById('go-name'),
    goSubmitStatus: document.getElementById('go-submit-status'),
    goSubmitRow: document.getElementById('go-submit-row'),
    diffButtons: Array.from(document.querySelectorAll('.diff-btn')),
    lbTabs: Array.from(document.querySelectorAll('.lb-tab')),
    lbList: document.getElementById('lb-list')
  };

  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let cssW = 0, cssH = 0, cx = 0, cy = 0, radius = 0, laneGap = 0;

  let selectedDifficulty = 'easy';
  let state = 'menu'; // menu | playing | paused | gameover
  let lastTs = 0;

  let player, spawnMgr, score, lives, targetsHit, elapsed, cfg;
  let slowUntil = 0; // performance.now() timestamp until which the "slow" bonus is active
  let runTokenPromise = null; // resolves to the signed run token for the current game
  let effects = [];  // transient visual feedback: floating text + particle bursts

  // ---------------------------------------------------------------------
  // Sizing — responsive down to small phones (iPhone 12 mini and below)
  // ---------------------------------------------------------------------
  function resize() {
    const wrap = canvas.parentElement;
    cssW = wrap.clientWidth;
    cssH = wrap.clientHeight;
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cx = cssW / 2;
    cy = cssH / 2;
    const shortSide = Math.min(cssW, cssH);
    radius = shortSide * 0.34;
    laneGap = Math.max(16, shortSide * 0.055);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 50));

  // ---------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------
  function createPlayer() {
    return {
      totalAngle: 0,        // unbounded, always increasing
      lane: 0,               // 0 = inner, 1 = outer
      laneT: 0,               // animated 0..1 for smooth radius transition
      laneTarget: 0,
      switching: false,
      flashUntil: 0          // ms timestamp for hit flash
    };
  }

  function toggleLane() {
    if (state !== 'playing') return;
    player.lane = player.lane === 0 ? 1 : 0;
    player.laneTarget = player.lane;
  }

  // ---------------------------------------------------------------------
  // Spawn manager — obstacles & targets live on an absolute angle axis
  // ---------------------------------------------------------------------
  function createSpawnManager() {
    return {
      items: [],          // { angle, lane, type, width, resolved, scored, missed }
      nextSpawnAngle: TWO_PI * 0.35 // short breather at start (must stay below the 0.55 lookahead below)
    };
  }

  function maybeSpawn() {
    // Lookahead MUST stay under one full lap (TWO_PI). Items are rendered
    // at (angle % TWO_PI), so if we ever pre-spawn more than a full lap
    // ahead, an item that is actually a whole lap away renders at nearly
    // the same screen position as the very next, truly-imminent item —
    // a "decoy" band the player reacts to while the real one sneaks past
    // underneath it. That was causing hits that looked unfair: the player
    // was dodging the wrong (far-away) band. Kept well under TWO_PI here.
    while (spawnMgr.nextSpawnAngle < player.totalAngle + TWO_PI * 0.55) {
      const roll = Math.random();
      let type = 'gap';
      let cumulative = cfg.obstacleChance;
      if (roll < cumulative) {
        type = 'obstacle';
      } else if (roll < (cumulative += cfg.targetChance)) {
        type = 'target';
      } else if (roll < (cumulative += cfg.slowChance)) {
        type = 'slow';
      } else if (roll < (cumulative += cfg.lifeChance)) {
        type = 'life';
      } else if (roll < (cumulative += cfg.bombChance)) {
        type = 'bomb';
      }

      if (type !== 'gap') {
        spawnMgr.items.push({
          angle: spawnMgr.nextSpawnAngle,
          lane: Math.random() < 0.5 ? 0 : 1,
          type,
          width: cfg.bandWidth,
          resolved: false
        });
      }

      const gap = cfg.spawnGapMin + Math.random() * (cfg.spawnGapMax - cfg.spawnGapMin);
      spawnMgr.nextSpawnAngle += gap;
    }

    // garbage collect items well behind the player
    spawnMgr.items = spawnMgr.items.filter(
      (it) => player.totalAngle - it.angle < TWO_PI * 0.5
    );
  }

  // ---------------------------------------------------------------------
  // Game lifecycle
  // ---------------------------------------------------------------------
  function startGame(difficulty) {
    selectedDifficulty = difficulty;
    cfg = DIFFICULTY[difficulty];
    player = createPlayer();
    spawnMgr = createSpawnManager();
    score = 0;
    lives = cfg.lives;
    targetsHit = 0;
    slowUntil = 0;
    effects = [];
    elapsed = 0;
    state = 'playing';

    // Kicked off now, awaited later at submission time — this way it
    // doesn't delay the start of the game itself.
    runTokenPromise = window.CCLeaderboard.startRun(difficulty);

    showScreen('game');
    updateHud();
    resize();
    lastTs = performance.now();
    requestAnimationFrame(loop);
  }

  function endGame() {
    state = 'gameover';
    el.goScoreValue.textContent = Math.floor(score);
    el.goDiffValue.textContent = selectedDifficulty === 'easy' ? 'Easy' : 'Hard';
    el.goSubmitStatus.textContent = '';
    el.goSubmitRow.classList.remove('hidden');
    el.btnSubmitScore.disabled = false;
    const savedName = localStorage.getItem('cc_player_name');
    if (savedName) el.goName.value = savedName;
    el.gameoverOverlay.classList.remove('hidden');
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    el.pauseOverlay.classList.remove('hidden');
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    el.pauseOverlay.classList.add('hidden');
    lastTs = performance.now();
    requestAnimationFrame(loop);
  }

  function quitToMenu() {
    state = 'menu';
    el.pauseOverlay.classList.add('hidden');
    el.gameoverOverlay.classList.add('hidden');
    showScreen('splash');
  }

  function showScreen(name) {
    el.splash.classList.toggle('hidden', name !== 'splash');
    el.game.classList.toggle('hidden', name !== 'game');
  }

  // ---------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------
  function update(dt) {
    elapsed += dt;

    // The difficulty ramp keeps accumulating in the background even while
    // a "slow" bonus is active — it's a temporary reprieve, not a reset.
    const rampSpeed = Math.min(cfg.maxSpeed, cfg.baseSpeed + elapsed * cfg.rampRate);
    const slowActive = performance.now() < slowUntil;
    const speed = slowActive ? rampSpeed * cfg.slowFactor : rampSpeed;
    player.totalAngle += speed * dt;

    // smooth lane transition
    const target = player.laneTarget;
    player.laneT += (target - player.laneT) * Math.min(1, dt * 14);

    score += cfg.survivalPointsPerSec * dt;

    maybeSpawn();

    const halfBand = cfg.bandWidth / 2;
    for (const it of spawnMgr.items) {
      if (it.resolved) continue;
      const dist = player.totalAngle - it.angle;

      if (Math.abs(dist) <= halfBand) {
        const sameLane = it.lane === player.lane;
        if (it.type === 'obstacle' && sameLane) {
          it.resolved = true;
          hitObstacle();
        } else if (it.type === 'target' && sameLane) {
          it.resolved = true;
          const precision = 1 - Math.min(1, Math.abs(dist) / halfBand);
          const gained = Math.round(cfg.targetPoints * (0.5 + 0.5 * precision));
          score += gained;
          player.flashUntil = performance.now() + 180;
          window.CCSound.playTargetHit();
          spawnPopup('+' + gained, '#2FE3B4');
          spawnBurst('#2FE3B4', 8);

          targetsHit += 1;
          if (targetsHit % cfg.targetsPerExtraLife === 0 && lives < cfg.maxLives) {
            lives += 1;
            window.CCSound.playExtraLife();
            pulseLivesHud();
            spawnPopup('+1 LIFE', '#FFB020');
          }
        } else if (it.type === 'slow' && sameLane) {
          it.resolved = true;
          slowUntil = performance.now() + cfg.slowDurationMs;
          player.flashUntil = performance.now() + 180;
          window.CCSound.playSlow();
          spawnPopup('SLOW', '#3EA6FF');
          spawnBurst('#3EA6FF', 10);
        } else if (it.type === 'life' && sameLane) {
          it.resolved = true;
          const before = lives;
          lives = Math.min(cfg.maxLives, lives + cfg.lifeBonusAmount);
          player.flashUntil = performance.now() + 220;
          window.CCSound.playBigBonus();
          spawnPopup('+2 LIVES', '#C77DFF');
          spawnBurst('#C77DFF', 16);
          if (lives > before) pulseLivesHud();
        } else if (it.type === 'bomb' && sameLane) {
          it.resolved = true;
          player.flashUntil = performance.now() + 220;
          triggerBomb();
        }
      } else if (dist > halfBand) {
        // Passed without interacting: a safely dodged obstacle is a
        // correct action and gets a soft confirmation tick. A missed
        // target (wrong lane) is neutral, not a mistake — no sound.
        if (it.type === 'obstacle') {
          window.CCSound.playDodge();
        }
        it.resolved = true;
      }
    }

    updateHud(speed, slowActive);
  }

  // ---------------------------------------------------------------------
  // Visual feedback — floating text + particle bursts at the player's
  // current position, so every pickup/hit has an on-screen confirmation
  // in addition to its sound.
  // ---------------------------------------------------------------------
  function getPlayerScreenPos() {
    const rInner = radius - laneGap / 2;
    const rOuter = radius + laneGap / 2;
    const r = rInner + (rOuter - rInner) * player.laneT;
    const a = player.totalAngle % TWO_PI;
    return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
  }

  function spawnPopup(text, color) {
    const pos = getPlayerScreenPos();
    effects.push({ type: 'text', x: pos.x, y: pos.y, text, color, start: performance.now(), duration: 850 });
  }

  function spawnBurstAt(x, y, color, count) {
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TWO_PI;
      const speed = 50 + Math.random() * 70;
      effects.push({
        type: 'particle', x, y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        color, start: now, duration: 480
      });
    }
  }

  function spawnBurst(color, count) {
    const pos = getPlayerScreenPos();
    spawnBurstAt(pos.x, pos.y, color, count);
  }

  function getRingScreenPos(lane, angle) {
    const rInner = radius - laneGap / 2;
    const rOuter = radius + laneGap / 2;
    const r = lane === 0 ? rInner : rOuter;
    return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
  }

  // "Bomb" bonus: clears every obstacle currently on the track, with a
  // small explosion burst at each one's exact position.
  function triggerBomb() {
    let destroyed = 0;
    for (const it of spawnMgr.items) {
      if (!it.resolved && it.type === 'obstacle') {
        const renderAngle = ((it.angle % TWO_PI) + TWO_PI) % TWO_PI;
        const pos = getRingScreenPos(it.lane, renderAngle);
        spawnBurstAt(pos.x, pos.y, '#FFA53D', 12);
        spawnBurstAt(pos.x, pos.y, '#FF4D5E', 6);
        it.resolved = true;
        destroyed += 1;
      }
    }
    window.CCSound.playBomb();
    spawnPopup(destroyed > 0 ? 'BOOM!' : 'CLEAR', '#FFA53D');
    spawnBurst('#FFA53D', 14);
  }

  function hitObstacle() {
    lives -= 1;
    player.flashUntil = performance.now() + 260;
    window.CCSound.playHit();
    spawnPopup('-1', '#FF4D5E');
    if (navigator.vibrate) navigator.vibrate(40);
    if (lives <= 0) {
      endGame();
    }
  }

  function updateHud(speed, slowActive) {
    el.hudScore.textContent = Math.floor(score);
    el.hudLives.textContent = '●'.repeat(Math.max(0, lives)) + '○'.repeat(Math.max(0, cfg.maxLives - lives));
    if (speed !== undefined) {
      el.hudSpeed.textContent = (slowActive ? '❄ x' : 'x') + (speed / cfg.baseSpeed).toFixed(1);
      el.hudSpeed.classList.toggle('hud-speed-slow', !!slowActive);
    }
  }

  function pulseLivesHud() {
    const wrap = document.getElementById('hud-lives-wrap');
    wrap.classList.add('pulse');
    setTimeout(() => wrap.classList.remove('pulse'), 260);
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  const BAND_STYLES = {
    obstacle: { color: '#FF4D5E', glow: 'rgba(255,77,94,0.55)' },
    target: { color: '#2FE3B4', glow: 'rgba(47,227,180,0.55)' },
    slow: { color: '#3EA6FF', glow: 'rgba(62,166,255,0.55)' },
    life: { color: '#C77DFF', glow: 'rgba(199,125,255,0.65)' },
    bomb: { color: '#FFA53D', glow: 'rgba(255,165,61,0.6)', icon: '💣' }
  };

  function render() {
    ctx.clearRect(0, 0, cssW, cssH);

    const rInner = radius - laneGap / 2;
    const rOuter = radius + laneGap / 2;
    const playerAngle = player.totalAngle % TWO_PI;

    // lane guide rings (always visible, faint)
    drawRing(rInner, 'rgba(233,236,241,0.10)', 1.5);
    drawRing(rOuter, 'rgba(233,236,241,0.10)', 1.5);

    // highlight whichever lane the player is currently on — the track
    // alone is hard to read at speed, so this gives a constant visual
    // anchor for "where am I right now".
    const innerActive = 1 - player.laneT;
    const outerActive = player.laneT;
    if (innerActive > 0.02) {
      drawRing(rInner, `rgba(255,176,32,${(0.4 * innerActive).toFixed(3)})`, 3 + 3 * innerActive);
    }
    if (outerActive > 0.02) {
      drawRing(rOuter, `rgba(255,176,32,${(0.4 * outerActive).toFixed(3)})`, 3 + 3 * outerActive);
    }

    // bands (obstacles / targets / bonuses)
    for (const it of spawnMgr.items) {
      const renderAngle = ((it.angle % TWO_PI) + TWO_PI) % TWO_PI;
      const r = it.lane === 0 ? rInner : rOuter;
      const style = BAND_STYLES[it.type] || BAND_STYLES.obstacle;
      drawBand(r, renderAngle, it.width, style, it.resolved);
    }

    // player
    const rPlayer = rInner + (rOuter - rInner) * player.laneT;
    const flashing = performance.now() < player.flashUntil;
    drawPlayer(rPlayer, playerAngle, flashing);

    // center: countdown ring for the "rallenta" bonus while active,
    // otherwise just the faint center mark
    drawCenter();

    // floating text + particle feedback from recent pickups/hits
    drawEffects();
  }

  function drawCenter() {
    const now = performance.now();
    if (now < slowUntil) {
      const remainMs = slowUntil - now;
      const totalMs = cfg.slowDurationMs;
      const frac = Math.max(0, Math.min(1, remainMs / totalMs));
      const ringR = Math.max(18, laneGap * 0.9);

      ctx.save();
      // background track for the countdown ring
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, TWO_PI);
      ctx.strokeStyle = 'rgba(62,166,255,0.18)';
      ctx.lineWidth = 4;
      ctx.stroke();

      // depleting arc — starts full, sweeps away clockwise from 12 o'clock
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + TWO_PI * frac);
      ctx.strokeStyle = '#3EA6FF';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(62,166,255,0.6)';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#3EA6FF';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((remainMs / 1000).toFixed(1) + 's', cx, cy);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, TWO_PI);
      ctx.fillStyle = 'rgba(233,236,241,0.18)';
      ctx.fill();
    }
  }

  function drawEffects() {
    const now = performance.now();
    effects = effects.filter((e) => now - e.start < e.duration);

    for (const e of effects) {
      const t = (now - e.start) / e.duration;
      const alpha = 1 - t;

      if (e.type === 'text') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = e.color;
        ctx.font = '700 14px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(e.text, e.x, e.y - t * 34 - 8);
        ctx.restore();
      } else if (e.type === 'particle') {
        const dtSec = (now - e.start) / 1000;
        const px = e.x + e.vx * dtSec;
        const py = e.y + e.vy * dtSec;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.5, 3 * (1 - t)), 0, TWO_PI);
        ctx.fillStyle = e.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawRing(r, color, width) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // Player position uses a "clock" convention (angle 0 = 12 o'clock,
  // increasing clockwise): x = cx + r*sin(a), y = cy - r*cos(a).
  // Canvas's native arc() angle convention is different (0 = 3 o'clock).
  // This helper converts a clock-angle to the native angle so bands are
  // drawn in the exact same place the player will physically be.
  function clockToNative(angle) {
    return angle - Math.PI / 2;
  }

  function hexToRgba(hex, alpha) {
    const v = hex.replace('#', '');
    const r = parseInt(v.substring(0, 2), 16);
    const g = parseInt(v.substring(2, 4), 16);
    const b = parseInt(v.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function drawBand(r, angle, width, style, resolved) {
    const a = clockToNative(angle);
    const trackWidth = laneGap * 0.72;
    ctx.lineCap = 'round';

    if (resolved) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, a - width / 2, a + width / 2);
      ctx.strokeStyle = 'rgba(233,236,241,0.08)';
      ctx.lineWidth = trackWidth;
      ctx.stroke();
      return;
    }

    // Solid segment with a moderate transparency, so hazards and bonuses
    // read clearly without feeling like a solid wall.
    ctx.beginPath();
    ctx.arc(cx, cy, r, a - width / 2, a + width / 2);
    ctx.strokeStyle = hexToRgba(style.color, 0.55);
    ctx.lineWidth = trackWidth;
    ctx.shadowColor = style.glow;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Sweet-spot marker at the exact center of the segment: a fully
    // solid dot (or a small icon for the bomb) showing at a glance
    // where a hit is worth the most.
    const mx = cx + r * Math.sin(angle);
    const my = cy - r * Math.cos(angle);

    if (style.icon) {
      ctx.font = `${Math.round(trackWidth * 0.95)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(style.icon, mx, my);
    } else {
      ctx.beginPath();
      ctx.arc(mx, my, trackWidth * 0.24, 0, TWO_PI);
      ctx.fillStyle = style.color;
      ctx.shadowColor = style.glow;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawPlayer(r, angle, flashing) {
    const x = cx + r * Math.sin(angle);
    const y = cy - r * Math.cos(angle);
    const color = flashing ? '#FF4D5E' : '#FFB020';

    ctx.beginPath();
    ctx.arc(x, y, laneGap * 0.34, 0, TWO_PI);
    ctx.fillStyle = color;
    ctx.shadowColor = flashing ? 'rgba(255,77,94,0.8)' : 'rgba(255,176,32,0.75)';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;

    // small trail dot behind
    const trailAngle = angle - 0.14;
    const tx = cx + r * Math.sin(trailAngle);
    const ty = cy - r * Math.cos(trailAngle);
    ctx.beginPath();
    ctx.arc(tx, ty, laneGap * 0.16, 0, TWO_PI);
    ctx.fillStyle = flashing ? 'rgba(255,77,94,0.35)' : 'rgba(255,176,32,0.35)';
    ctx.fill();
  }

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------
  function loop(ts) {
    if (state !== 'playing') return;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = Math.min(dt, 0.05); // clamp to avoid huge jumps on tab-switch

    update(dt);
    render();

    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------
  function onPrimaryAction() {
    if (state === 'playing') toggleLane();
  }

  el.tapZone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onPrimaryAction();
  });

  window.addEventListener('keydown', (e) => {
    if (state !== 'playing') return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      toggleLane();
    }
  });

  // ---------------------------------------------------------------------
  // UI wiring
  // ---------------------------------------------------------------------
  el.diffButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      el.diffButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDifficulty = btn.dataset.difficulty;
    });
  });

  el.btnStart.addEventListener('click', () => {
    window.CCSound.unlock(); // must run inside a user-gesture handler
    startGame(selectedDifficulty);
  });
  el.btnRetry.addEventListener('click', () => {
    el.gameoverOverlay.classList.add('hidden');
    startGame(selectedDifficulty);
  });
  el.btnGotoMenu.addEventListener('click', () => {
    el.gameoverOverlay.classList.add('hidden');
    quitToMenu();
  });

  el.btnPause.addEventListener('click', pauseGame);
  el.btnResume.addEventListener('click', resumeGame);
  el.btnQuit.addEventListener('click', () => {
    el.pauseOverlay.classList.add('hidden');
    quitToMenu();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') pauseGame();
  });

  el.btnSubmitScore.addEventListener('click', async () => {
    const name = (el.goName.value || 'Anonymous').trim().slice(0, 16) || 'Anonymous';
    localStorage.setItem('cc_player_name', name);
    el.btnSubmitScore.disabled = true;
    el.goSubmitStatus.textContent = 'Submitting…';
    try {
      const token = await runTokenPromise;
      if (!token) {
        el.goSubmitStatus.textContent = 'Could not verify this run. Try again.';
        el.btnSubmitScore.disabled = false;
        return;
      }
      const res = await window.CCLeaderboard.submitScore(name, Math.floor(score), selectedDifficulty, token);
      if (res && res.ok) {
        el.goSubmitStatus.textContent = 'Score submitted ✓';
        el.goSubmitRow.classList.add('hidden');
      } else {
        el.goSubmitStatus.textContent = res && res.message ? res.message : 'Submission failed. Try again.';
        el.btnSubmitScore.disabled = false;
      }
    } catch (err) {
      el.goSubmitStatus.textContent = 'Server unreachable.';
      el.btnSubmitScore.disabled = false;
    }
  });

  function openLeaderboard(defaultDifficulty) {
    el.lbTabs.forEach((t) => t.classList.toggle('active', t.dataset.lbDifficulty === defaultDifficulty));
    el.leaderboardOverlay.classList.remove('hidden');
    loadLeaderboard(defaultDifficulty);
  }

  el.btnOpenLeaderboard.addEventListener('click', () => openLeaderboard('easy'));
  el.btnOpenQuickguide.addEventListener('click', () => {
    el.quickguideOverlay.classList.remove('hidden');
  });
  el.btnCloseQuickguide.addEventListener('click', () => {
    el.quickguideOverlay.classList.add('hidden');
  });
  el.btnGotoLeaderboard.addEventListener('click', () => openLeaderboard(selectedDifficulty));
  el.btnCloseLeaderboard.addEventListener('click', () => el.leaderboardOverlay.classList.add('hidden'));

  el.lbTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      el.lbTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      loadLeaderboard(tab.dataset.lbDifficulty);
    });
  });

  async function loadLeaderboard(difficulty) {
    el.lbList.innerHTML = '<li class="lb-empty">Loading…</li>';
    try {
      const rows = await window.CCLeaderboard.getScores(difficulty);
      if (!rows || rows.length === 0) {
        el.lbList.innerHTML = '<li class="lb-empty">No scores yet. Be the first!</li>';
        return;
      }
      el.lbList.innerHTML = rows.map((r, i) => `
        <li>
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name">${escapeHtml(r.player_name)}</span>
          <span class="lb-points">${r.score}</span>
        </li>
      `).join('');
    } catch (err) {
      el.lbList.innerHTML = '<li class="lb-empty">Unable to load the leaderboard.</li>';
    }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---------------------------------------------------------------------
  // Sound toggle
  // ---------------------------------------------------------------------
  function refreshSoundButtons() {
    const on = window.CCSound.isEnabled();
    el.settingsSoundValue.textContent = on ? 'On' : 'Off';
    el.btnToggleSound.setAttribute('aria-pressed', String(on));
    el.btnPauseSound.textContent = on ? '🔊' : '🔇';
  }

  function toggleSound() {
    window.CCSound.setEnabled(!window.CCSound.isEnabled());
    refreshSoundButtons();
  }

  el.btnToggleSound.addEventListener('click', toggleSound);
  el.btnPauseSound.addEventListener('click', toggleSound);

  // ---------------------------------------------------------------------
  // Settings, guide & changelog modals
  // ---------------------------------------------------------------------
  el.btnOpenSettings.addEventListener('click', () => {
    el.settingsOverlay.classList.remove('hidden');
  });
  el.btnCloseSettings.addEventListener('click', () => {
    el.settingsOverlay.classList.add('hidden');
  });
  el.btnOpenGuide.addEventListener('click', () => {
    el.settingsOverlay.classList.add('hidden');
    el.guideOverlay.classList.remove('hidden');
  });
  el.btnCloseGuide.addEventListener('click', () => {
    el.guideOverlay.classList.add('hidden');
    el.settingsOverlay.classList.remove('hidden');
  });
  el.btnOpenChangelog.addEventListener('click', () => {
    el.settingsOverlay.classList.add('hidden');
    el.changelogOverlay.classList.remove('hidden');
  });
  el.btnCloseChangelog.addEventListener('click', () => {
    el.changelogOverlay.classList.add('hidden');
    el.settingsOverlay.classList.remove('hidden');
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  const savedNameInit = localStorage.getItem('cc_player_name');
  if (savedNameInit) el.goName.value = savedNameInit;

  refreshSoundButtons();
  resize();
  showScreen('splash');
})();
