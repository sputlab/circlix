/* ==========================================================================
   Circlix — v1.3.1
   Game engine (vanilla JS, high-performance canvas 2D)
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
      baseSpeed: 1.05,       // rad/s
      rampRate: 0.005,       // rad/s^2
      maxSpeed: 3.0,
      spawnGapMin: 0.62,     // rad between spawns
      spawnGapMax: 0.95,
      bandWidth: 0.30,       // rad
      obstacleChance: 0.5,
      targetChance: 0.28,
      slowChance: 0.05,
      lifeChance: 0.008,
      bombChance: 0.025,
      targetPoints: 80,
      survivalPointsPerSec: 12,
      slowFactor: 0.5,
      slowDurationMs: 3200,
      lifeBonusAmount: 2
    },
    hard: {
      lives: 2,
      maxLives: 4,           // 2 starting + up to 2 earned
      targetsPerExtraLife: 6,
      baseSpeed: 1.6,
      rampRate: 0.010,
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
  const ctx = canvas.getContext('2d', { alpha: false }); // alpha false enables faster compositor compositing

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

  // DPR capped to 2 to maintain steady 60-120fps on high-density displays
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cssW = 0, cssH = 0, cx = 0, cy = 0, radius = 0, laneGap = 0;

  let selectedDifficulty = 'easy';
  let state = 'menu'; // menu | playing | paused | gameover
  let lastTs = 0;

  let player, spawnMgr, score, lives, targetsHit, elapsed, cfg;
  let slowUntil = 0;
  let runTokenPromise = null;
  let comboCount = 0;

  // Visual Effects & Animation Systems
  let effects = [];       // floating text + particles
  let shockwaves = [];    // expanding blast rings
  let ambientStars = [];  // subtle background dust
  let screenShake = { trauma: 0, x: 0, y: 0 };

  // ---------------------------------------------------------------------
  // Ambient Starfield
  // ---------------------------------------------------------------------
  function initAmbientStars() {
    ambientStars = [];
    const count = 38;
    for (let i = 0; i < count; i++) {
      ambientStars.push({
        rFactor: 0.15 + Math.random() * 1.35,
        angle: Math.random() * TWO_PI,
        speed: (Math.random() * 0.05 + 0.015) * (Math.random() < 0.5 ? 1 : -1),
        size: Math.random() * 1.5 + 0.6,
        baseAlpha: Math.random() * 0.38 + 0.12,
        pulseSpeed: Math.random() * 2 + 1,
        pulsePhase: Math.random() * TWO_PI
      });
    }
  }

  // ---------------------------------------------------------------------
  // Sizing — responsive down to small phones (iPhone 12 mini and below)
  // ---------------------------------------------------------------------
  function resize() {
    const wrap = canvas.parentElement;
    if (!wrap) return;
    cssW = wrap.clientWidth;
    cssH = wrap.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cx = cssW / 2;
    cy = cssH / 2;
    const shortSide = Math.min(cssW, cssH);
    radius = shortSide * 0.34;
    laneGap = Math.max(16, shortSide * 0.055);

    if (ambientStars.length === 0) {
      initAmbientStars();
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 50));

  // ---------------------------------------------------------------------
  // Camera Shake (Trauma model)
  // ---------------------------------------------------------------------
  function addTrauma(amount) {
    screenShake.trauma = Math.min(1.0, screenShake.trauma + amount);
  }

  function updateScreenShake(dt) {
    if (screenShake.trauma > 0) {
      screenShake.trauma = Math.max(0, screenShake.trauma - dt * 2.8);
      const shakeVal = screenShake.trauma * screenShake.trauma;
      const maxOffset = 13;
      screenShake.x = (Math.random() * 2 - 1) * maxOffset * shakeVal;
      screenShake.y = (Math.random() * 2 - 1) * maxOffset * shakeVal;
    } else {
      screenShake.x = 0;
      screenShake.y = 0;
    }
  }

  // ---------------------------------------------------------------------
  // Shockwave Rings
  // ---------------------------------------------------------------------
  function spawnShockwave(x, y, color, maxRadius, duration = 350, lineWidth = 3.5) {
    shockwaves.push({
      x, y, color,
      radius: 4,
      maxRadius,
      start: performance.now(),
      duration,
      lineWidth
    });
  }

  // ---------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------
  function createPlayer() {
    return {
      totalAngle: 0,        // unbounded, always increasing
      lane: 0,              // 0 = inner, 1 = outer
      laneT: 0,              // animated 0..1 for smooth radius transition
      laneTarget: 0,
      flashUntil: 0,        // ms timestamp for hit flash
      squash: 1.0,          // squash/stretch scaling factor
      trail: [],            // array of recent position samples
      trailTimer: 0
    };
  }

  function toggleLane() {
    if (state !== 'playing') return;
    const fromLane = player.lane;
    player.lane = player.lane === 0 ? 1 : 0;
    player.laneTarget = player.lane;
    player.squash = 1.34;
    spawnLaneSwitchSparks(fromLane, player.lane);
  }

  function spawnLaneSwitchSparks(fromLane, toLane) {
    const rInner = radius - laneGap / 2;
    const rOuter = radius + laneGap / 2;
    const count = 7;
    const curAngle = player.totalAngle % TWO_PI;

    for (let i = 0; i < count; i++) {
      const p = Math.random();
      const r = rInner + (rOuter - rInner) * p;
      const spreadAngle = curAngle + (Math.random() - 0.5) * 0.12;
      effects.push({
        type: 'spark',
        x: cx + r * Math.sin(spreadAngle),
        y: cy - r * Math.cos(spreadAngle),
        vx: (Math.random() - 0.5) * 45,
        vy: (Math.random() - 0.5) * 45,
        color: '#FFB020',
        size: Math.random() * 2 + 1.2,
        start: performance.now(),
        duration: 220 + Math.random() * 120
      });
    }
  }

  // ---------------------------------------------------------------------
  // Spawn manager — obstacles & targets live on an absolute angle axis
  // ---------------------------------------------------------------------
  function createSpawnManager() {
    return {
      items: [],
      nextSpawnAngle: TWO_PI * 0.35
    };
  }

  function maybeSpawn() {
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
          resolved: false,
          spawnTime: performance.now()
        });
      }

      const gap = cfg.spawnGapMin + Math.random() * (cfg.spawnGapMax - cfg.spawnGapMin);
      spawnMgr.nextSpawnAngle += gap;
    }

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
    comboCount = 0;
    slowUntil = 0;
    effects = [];
    shockwaves = [];
    screenShake = { trauma: 0, x: 0, y: 0 };
    elapsed = 0;
    state = 'playing';

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
  // Update Loop
  // ---------------------------------------------------------------------
  function update(dt) {
    elapsed += dt;

    // Difficulty speed ramp
    const rampSpeed = Math.min(cfg.maxSpeed, cfg.baseSpeed + elapsed * cfg.rampRate);
    const slowActive = performance.now() < slowUntil;
    const speed = slowActive ? rampSpeed * cfg.slowFactor : rampSpeed;
    player.totalAngle += speed * dt;

    // Smooth lane transition with spring recovery
    const target = player.laneTarget;
    player.laneT += (target - player.laneT) * Math.min(1, dt * 15);
    player.squash += (1.0 - player.squash) * Math.min(1, dt * 10);

    score += cfg.survivalPointsPerSec * dt;

    // Update screen shake
    updateScreenShake(dt);

    // Current player position on canvas
    const rInner = radius - laneGap / 2;
    const rOuter = radius + laneGap / 2;
    const curR = rInner + (rOuter - rInner) * player.laneT;
    const curAngle = player.totalAngle % TWO_PI;
    const playerPos = {
      x: cx + curR * Math.sin(curAngle),
      y: cy - curR * Math.cos(curAngle)
    };

    // Update player comet ribbon history
    player.trail.unshift({
      x: playerPos.x,
      y: playerPos.y,
      r: curR,
      angle: curAngle,
      time: performance.now()
    });

    const maxTrailPoints = Math.round(14 + (speed / cfg.baseSpeed) * 8);
    if (player.trail.length > maxTrailPoints) {
      player.trail.length = maxTrailPoints;
    }

    // Trailing speed ember emission
    player.trailTimer = (player.trailTimer || 0) + dt;
    if (player.trailTimer > 0.04) {
      player.trailTimer = 0;
      const backAngle = curAngle - 0.08 * (speed / cfg.baseSpeed);
      effects.push({
        type: 'ember',
        x: cx + curR * Math.sin(backAngle) + (Math.random() - 0.5) * 5,
        y: cy - curR * Math.cos(backAngle) + (Math.random() - 0.5) * 5,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.5) * 16,
        color: slowActive ? '#3EA6FF' : (comboCount >= 3 ? '#FFE066' : '#FFB020'),
        size: Math.random() * 2.2 + 1,
        start: performance.now(),
        duration: 260
      });
    }

    maybeSpawn();

    // Collision detection & Resolution
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
          comboCount += 1;
          const comboBonus = comboCount >= 3 ? Math.min(60, (comboCount - 2) * 15) : 0;
          const gained = Math.round(cfg.targetPoints * (0.5 + 0.5 * precision)) + comboBonus;
          score += gained;
          player.flashUntil = performance.now() + 180;

          // Sound with harmonic combo pitch
          window.CCSound.playTargetHit(comboCount);
          addTrauma(0.08);
          spawnShockwave(playerPos.x, playerPos.y, '#2FE3B4', 38, 300, 3);

          if (comboCount >= 3) {
            spawnPopup('+' + gained + ' (x' + comboCount + ' COMBO!)', '#2FE3B4', true);
          } else if (precision > 0.88) {
            spawnPopup('PERFECT! +' + gained, '#2FE3B4', true);
          } else {
            spawnPopup('+' + gained, '#2FE3B4', false);
          }
          spawnBurstAt(playerPos.x, playerPos.y, '#2FE3B4', precision > 0.88 ? 16 : 10, precision > 0.88);

          targetsHit += 1;
          if (targetsHit % cfg.targetsPerExtraLife === 0 && lives < cfg.maxLives) {
            lives += 1;
            window.CCSound.playExtraLife();
            pulseLivesHud();
            spawnShockwave(playerPos.x, playerPos.y, '#FFB020', 48, 380, 4);
            spawnPopup('+1 LIFE', '#FFB020', true);
            spawnBurstAt(playerPos.x, playerPos.y, '#FFB020', 16, true);
          }
        } else if (it.type === 'slow' && sameLane) {
          it.resolved = true;
          slowUntil = performance.now() + cfg.slowDurationMs;
          player.flashUntil = performance.now() + 180;
          window.CCSound.playSlow();
          addTrauma(0.08);
          spawnShockwave(playerPos.x, playerPos.y, '#3EA6FF', 42, 350, 3.5);
          spawnPopup('SLOW', '#3EA6FF', true);
          spawnBurstAt(playerPos.x, playerPos.y, '#3EA6FF', 14, false);
        } else if (it.type === 'life' && sameLane) {
          it.resolved = true;
          const before = lives;
          lives = Math.min(cfg.maxLives, lives + cfg.lifeBonusAmount);
          player.flashUntil = performance.now() + 220;
          window.CCSound.playBigBonus();
          addTrauma(0.12);
          spawnShockwave(playerPos.x, playerPos.y, '#C77DFF', 52, 420, 4);
          spawnPopup('+2 LIVES', '#C77DFF', true);
          spawnBurstAt(playerPos.x, playerPos.y, '#C77DFF', 20, true);
          if (lives > before) pulseLivesHud();
        } else if (it.type === 'bomb' && sameLane) {
          it.resolved = true;
          player.flashUntil = performance.now() + 220;
          triggerBomb();
        }
      } else if (dist > halfBand) {
        if (it.type === 'obstacle') {
          window.CCSound.playDodge();
        }
        it.resolved = true;
      }
    }

    updateHud(speed, slowActive);
  }

  // ---------------------------------------------------------------------
  // Visual Effects Spawners
  // ---------------------------------------------------------------------
  function getPlayerScreenPos() {
    const rInner = radius - laneGap / 2;
    const rOuter = radius + laneGap / 2;
    const r = rInner + (rOuter - rInner) * player.laneT;
    const a = player.totalAngle % TWO_PI;
    return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
  }

  function getRingScreenPos(lane, angle) {
    const rInner = radius - laneGap / 2;
    const rOuter = radius + laneGap / 2;
    const r = lane === 0 ? rInner : rOuter;
    return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
  }

  function spawnPopup(text, color, isCrit = false) {
    const pos = getPlayerScreenPos();
    effects.push({
      type: 'text',
      x: pos.x,
      y: pos.y,
      text,
      color,
      isCrit,
      start: performance.now(),
      duration: isCrit ? 950 : 800
    });
  }

  function spawnBurstAt(x, y, color, count, highVelocity = false) {
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TWO_PI;
      const baseSpeed = highVelocity ? (80 + Math.random() * 110) : (50 + Math.random() * 70);
      effects.push({
        type: 'particle',
        x, y,
        vx: Math.cos(a) * baseSpeed,
        vy: Math.sin(a) * baseSpeed,
        color,
        size: Math.random() * 2.8 + 1.2,
        drag: highVelocity ? 0.92 : 0.95,
        start: now,
        duration: 440 + Math.random() * 160
      });
    }
  }

  function triggerBomb() {
    let destroyed = 0;
    for (const it of spawnMgr.items) {
      if (!it.resolved && it.type === 'obstacle') {
        const renderAngle = ((it.angle % TWO_PI) + TWO_PI) % TWO_PI;
        const pos = getRingScreenPos(it.lane, renderAngle);
        spawnBurstAt(pos.x, pos.y, '#FFA53D', 16, true);
        spawnBurstAt(pos.x, pos.y, '#FF4D5E', 10, true);
        spawnShockwave(pos.x, pos.y, '#FFA53D', 42, 320, 3);
        it.resolved = true;
        destroyed += 1;
      }
    }
    window.CCSound.playBomb();
    addTrauma(0.85); // heavy camera rumble
    spawnShockwave(cx, cy, '#FFA53D', radius * 1.55, 600, 6);
    spawnPopup(destroyed > 0 ? 'BOOM! ' + destroyed + ' CLEARED' : 'CLEAR', '#FFA53D', true);
    const playerPos = getPlayerScreenPos();
    spawnBurstAt(playerPos.x, playerPos.y, '#FFA53D', 24, true);
  }

  function hitObstacle() {
    lives -= 1;
    comboCount = 0;
    player.flashUntil = performance.now() + 280;
    addTrauma(0.65); // sharp impact shake
    window.CCSound.playHit();
    const pos = getPlayerScreenPos();
    spawnShockwave(pos.x, pos.y, '#FF4D5E', 55, 420, 4);
    spawnPopup('-1', '#FF4D5E', true);
    spawnBurstAt(pos.x, pos.y, '#FF4D5E', 22, true);
    if (navigator.vibrate) navigator.vibrate(50);
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
    if (!wrap) return;
    wrap.classList.add('pulse');
    setTimeout(() => wrap.classList.remove('pulse'), 260);
  }

  // ---------------------------------------------------------------------
  // High-Performance Bloom & Rendering Pipeline
  // ---------------------------------------------------------------------
  const BAND_THEMES = {
    obstacle: {
      color: '#FF4D5E',
      coreColor: '#FFA3AB',
      bloomColor: 'rgba(255, 77, 94, 0.22)',
      pipColor: '#FFFFFF',
      icon: null
    },
    target: {
      color: '#2FE3B4',
      coreColor: '#B2FCE7',
      bloomColor: 'rgba(47, 227, 180, 0.22)',
      pipColor: '#FFFFFF',
      icon: null
    },
    slow: {
      color: '#3EA6FF',
      coreColor: '#BCE0FF',
      bloomColor: 'rgba(62, 166, 255, 0.22)',
      pipColor: '#FFFFFF',
      icon: null
    },
    life: {
      color: '#C77DFF',
      coreColor: '#F0D4FF',
      bloomColor: 'rgba(199, 125, 255, 0.25)',
      pipColor: '#FFFFFF',
      icon: null
    },
    bomb: {
      color: '#FFA53D',
      coreColor: '#FFE0B8',
      bloomColor: 'rgba(255, 165, 61, 0.24)',
      pipColor: '#FFFFFF',
      icon: '💣'
    }
  };

  function hexToRgba(hex, alpha) {
    const v = hex.replace('#', '');
    const r = parseInt(v.substring(0, 2), 16);
    const g = parseInt(v.substring(2, 4), 16);
    const b = parseInt(v.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function clockToNative(angle) {
    return angle - Math.PI / 2;
  }

  function drawRing(r, color, width) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function render() {
    // 1. Atmosphere Background
    const bgGrad = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, Math.max(cssW, cssH) * 0.65);
    bgGrad.addColorStop(0, '#131822');
    bgGrad.addColorStop(0.55, '#0B0D12');
    bgGrad.addColorStop(1, '#060709');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.save();
    // Camera shake translation
    if (screenShake.x !== 0 || screenShake.y !== 0) {
      ctx.translate(screenShake.x, screenShake.y);
    }

    // 2. Ambient starfield & tech ticks
    drawAtmosphere();

    const rInner = radius - laneGap / 2;
    const rOuter = radius + laneGap / 2;
    const playerAngle = player.totalAngle % TWO_PI;

    // 3. Track Grooves & Guides
    drawTracks(rInner, rOuter);

    // 4. Active Lane Highlights
    drawActiveLane(rInner, rOuter);

    // 5. Bands (Obstacles / Targets / Power-ups)
    for (const it of spawnMgr.items) {
      const renderAngle = ((it.angle % TWO_PI) + TWO_PI) % TWO_PI;
      const r = it.lane === 0 ? rInner : rOuter;
      const theme = BAND_THEMES[it.type] || BAND_THEMES.obstacle;
      drawBand(r, renderAngle, it.width, theme, it.resolved);
    }

    // 6. Shockwave Rings
    drawShockwaves();

    // 7. Player (Comet Tail Ribbon & Ball)
    const rPlayer = rInner + (rOuter - rInner) * player.laneT;
    const flashing = performance.now() < player.flashUntil;
    drawPlayer(rPlayer, playerAngle, flashing);

    // 8. Center HUD Gauge / Reticle
    drawCenter();

    // 9. Floating Text & Particles
    drawEffects();

    ctx.restore();
  }

  function drawAtmosphere() {
    const now = performance.now();
    ctx.fillStyle = '#E9ECF1';
    for (let i = 0; i < ambientStars.length; i++) {
      const s = ambientStars[i];
      const curAngle = s.angle + s.speed * now * 0.0005;
      const curR = s.rFactor * radius * 1.5;
      const x = cx + curR * Math.cos(curAngle);
      const y = cy + curR * Math.sin(curAngle);
      const alpha = s.baseAlpha * (0.6 + 0.4 * Math.sin(now * 0.002 * s.pulseSpeed + s.pulsePhase));
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.beginPath();
      ctx.arc(x, y, s.size, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Outer tachometer tech ticks (every 30 deg)
    const tickR = radius + laneGap * 1.35;
    ctx.strokeStyle = 'rgba(233, 236, 241, 0.05)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let a = 0; a < TWO_PI; a += Math.PI / 6) {
      const x1 = cx + tickR * Math.cos(a);
      const y1 = cy + tickR * Math.sin(a);
      const x2 = cx + (tickR + 5) * Math.cos(a);
      const y2 = cy + (tickR + 5) * Math.sin(a);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  function drawTracks(rInner, rOuter) {
    // Under-track dark groove
    ctx.beginPath();
    ctx.arc(cx, cy, rInner, 0, TWO_PI);
    ctx.arc(cx, cy, rOuter, 0, TWO_PI);
    ctx.strokeStyle = 'rgba(25, 30, 42, 0.35)';
    ctx.lineWidth = laneGap * 1.05;
    ctx.stroke();

    // Lane guide rings
    drawRing(rInner, 'rgba(233, 236, 241, 0.08)', 1.5);
    drawRing(rOuter, 'rgba(233, 236, 241, 0.08)', 1.5);

    // Decorative outer boundaries
    drawRing(rOuter + laneGap * 0.95, 'rgba(233, 236, 241, 0.02)', 1);
    drawRing(rInner - laneGap * 0.95, 'rgba(233, 236, 241, 0.02)', 1);
  }

  function drawActiveLane(rInner, rOuter) {
    const innerActive = 1 - player.laneT;
    const outerActive = player.laneT;

    if (innerActive > 0.02) {
      const a = innerActive;
      drawRing(rInner, `rgba(255, 176, 32, ${(0.10 * a).toFixed(3)})`, laneGap * 0.75);
      drawRing(rInner, `rgba(255, 176, 32, ${(0.42 * a).toFixed(3)})`, 2.5 + 2 * a);
    }
    if (outerActive > 0.02) {
      const a = outerActive;
      drawRing(rOuter, `rgba(255, 176, 32, ${(0.10 * a).toFixed(3)})`, laneGap * 0.75);
      drawRing(rOuter, `rgba(255, 176, 32, ${(0.42 * a).toFixed(3)})`, 2.5 + 2 * a);
    }
  }

  function drawBand(r, angle, width, theme, resolved) {
    const a = clockToNative(angle);
    const trackWidth = laneGap * 0.72;
    ctx.lineCap = 'round';

    if (resolved) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, a - width / 2, a + width / 2);
      ctx.strokeStyle = 'rgba(233, 236, 241, 0.06)';
      ctx.lineWidth = trackWidth * 0.55;
      ctx.stroke();
      return;
    }

    // Layer 1: Ambient outer bloom aura
    ctx.beginPath();
    ctx.arc(cx, cy, r, a - width / 2, a + width / 2);
    ctx.strokeStyle = theme.bloomColor;
    ctx.lineWidth = trackWidth * 1.5;
    ctx.stroke();

    // Layer 2: Core colored segment
    ctx.beginPath();
    ctx.arc(cx, cy, r, a - width / 2, a + width / 2);
    ctx.strokeStyle = hexToRgba(theme.color, 0.65);
    ctx.lineWidth = trackWidth * 0.82;
    ctx.stroke();

    // Layer 3: Inner bright laser core
    ctx.beginPath();
    ctx.arc(cx, cy, r, a - width / 2 + 0.02, a + width / 2 - 0.02);
    ctx.strokeStyle = theme.coreColor;
    ctx.lineWidth = trackWidth * 0.22;
    ctx.stroke();

    // Layer 4: Sweet-spot precision pip
    const mx = cx + r * Math.sin(angle);
    const my = cy - r * Math.cos(angle);

    if (theme.icon) {
      ctx.font = `${Math.round(trackWidth * 0.92)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(theme.icon, mx, my);
    } else {
      const now = performance.now();
      const pulse = 1 + 0.18 * Math.sin(now * 0.007 + angle * 3);
      const pipR = trackWidth * 0.25 * pulse;

      // Glow halo around pip
      ctx.beginPath();
      ctx.arc(mx, my, pipR * 1.8, 0, TWO_PI);
      ctx.fillStyle = theme.bloomColor;
      ctx.fill();

      // Colored pip disc
      ctx.beginPath();
      ctx.arc(mx, my, pipR, 0, TWO_PI);
      ctx.fillStyle = theme.color;
      ctx.fill();

      // Sharp white center dot
      ctx.beginPath();
      ctx.arc(mx, my, pipR * 0.5, 0, TWO_PI);
      ctx.fillStyle = theme.pipColor;
      ctx.fill();
    }
  }

  function drawShockwaves() {
    const now = performance.now();
    shockwaves = shockwaves.filter((sw) => now - sw.start < sw.duration);

    for (const sw of shockwaves) {
      const t = (now - sw.start) / sw.duration;
      const easedT = 1 - Math.pow(1 - t, 3);
      const curR = sw.radius + (sw.maxRadius - sw.radius) * easedT;
      const alpha = (1 - t) * 0.75;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, curR, 0, TWO_PI);
      ctx.strokeStyle = hexToRgba(sw.color, alpha);
      ctx.lineWidth = Math.max(1, (sw.lineWidth || 3) * (1 - t * 0.5));
      ctx.stroke();
    }
  }

  function drawPlayer(r, angle, flashing) {
    const mainColor = flashing ? '#FF4D5E' : '#FFB020';
    const coreColor = flashing ? '#FFE5E8' : '#FFF8E6';
    const bloomColor = flashing ? 'rgba(255, 77, 94, 0.25)' : 'rgba(255, 176, 32, 0.25)';
    const trailColor = flashing ? 'rgba(255, 77, 94,' : 'rgba(255, 176, 32,';

    const playerR = laneGap * 0.33;

    // 1. Render Comet Ribbon Tail
    if (player.trail && player.trail.length > 1) {
      for (let i = 1; i < player.trail.length; i++) {
        const p1 = player.trail[i - 1];
        const p2 = player.trail[i];
        const progress = i / player.trail.length;
        const alpha = Math.max(0, (1 - progress) * 0.45);
        const w = playerR * 1.8 * (1 - progress * 0.82);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = `${trailColor}${alpha.toFixed(3)})`;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // 2. Player Body with Squash & Stretch
    const x = cx + r * Math.sin(angle);
    const y = cy - r * Math.cos(angle);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const s = player.squash || 1.0;
    ctx.scale(1 / s, s);

    // Outer soft aura
    ctx.beginPath();
    ctx.arc(0, 0, playerR * 1.7, 0, TWO_PI);
    ctx.fillStyle = bloomColor;
    ctx.fill();

    // Medium glow disc
    ctx.beginPath();
    ctx.arc(0, 0, playerR * 1.25, 0, TWO_PI);
    ctx.fillStyle = hexToRgba(mainColor, 0.5);
    ctx.fill();

    // Main ball body
    ctx.beginPath();
    ctx.arc(0, 0, playerR, 0, TWO_PI);
    ctx.fillStyle = mainColor;
    ctx.fill();

    // Inner bright hot-spot core
    ctx.beginPath();
    ctx.arc(-playerR * 0.2, -playerR * 0.2, playerR * 0.45, 0, TWO_PI);
    ctx.fillStyle = coreColor;
    ctx.fill();

    ctx.restore();
  }

  function drawCenter() {
    const now = performance.now();
    if (now < slowUntil) {
      const remainMs = slowUntil - now;
      const totalMs = cfg.slowDurationMs;
      const frac = Math.max(0, Math.min(1, remainMs / totalMs));
      const ringR = Math.max(20, laneGap * 0.95);

      ctx.save();
      // Outer track
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, TWO_PI);
      ctx.strokeStyle = 'rgba(62, 166, 255, 0.16)';
      ctx.lineWidth = 4.5;
      ctx.stroke();

      // Glowing progress arc
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + TWO_PI * frac);
      ctx.strokeStyle = 'rgba(62, 166, 255, 0.3)';
      ctx.lineWidth = 8;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + TWO_PI * frac);
      ctx.strokeStyle = '#3EA6FF';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.fillStyle = '#3EA6FF';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((remainMs / 1000).toFixed(1) + 's', cx, cy - 2);

      ctx.font = '600 8px "Space Grotesk", sans-serif';
      ctx.fillStyle = 'rgba(62, 166, 255, 0.7)';
      ctx.fillText('SLOW', cx, cy + 9);
      ctx.restore();
    } else {
      // Sleek ambient gyro reticle in center
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(now * 0.0003);

      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, TWO_PI);
      ctx.strokeStyle = 'rgba(233, 236, 241, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, TWO_PI);
      ctx.fillStyle = 'rgba(233, 236, 241, 0.25)';
      ctx.fill();

      ctx.restore();
    }
  }

  function drawEffects() {
    const now = performance.now();
    effects = effects.filter((e) => now - e.start < e.duration);

    for (const e of effects) {
      const t = (now - e.start) / e.duration;
      const alpha = Math.max(0, 1 - t);

      if (e.type === 'text') {
        ctx.save();
        ctx.globalAlpha = alpha;
        const scale = e.isCrit
          ? (t < 0.2 ? 1 + 0.35 * Math.sin((t / 0.2) * Math.PI) : 1)
          : (t < 0.15 ? 1 + 0.2 * Math.sin((t / 0.15) * Math.PI) : 1);

        const yOffset = t * 38 + 6;
        ctx.translate(e.x, e.y - yOffset);
        ctx.scale(scale, scale);

        ctx.font = e.isCrit ? '800 15px "Space Grotesk", sans-serif' : '700 13px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Dark outline for legibility
        ctx.strokeStyle = 'rgba(7, 8, 12, 0.9)';
        ctx.lineWidth = 3.5;
        ctx.strokeText(e.text, 0, 0);

        ctx.fillStyle = e.color;
        ctx.fillText(e.text, 0, 0);

        ctx.restore();
      } else if (e.type === 'particle' || e.type === 'spark' || e.type === 'ember') {
        const dtSec = (now - e.start) / 1000;
        const drag = e.drag || 0.95;
        const speedMul = Math.pow(drag, dtSec * 60);
        const px = e.x + e.vx * dtSec * speedMul;
        const py = e.y + e.vy * dtSec * speedMul;
        const curSize = Math.max(0.4, (e.size || 2.5) * (1 - t * 0.8));

        ctx.beginPath();
        ctx.arc(px, py, curSize, 0, TWO_PI);
        ctx.fillStyle = e.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------
  function loop(ts) {
    if (state !== 'playing') return;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = Math.min(dt, 0.05);

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
    window.CCSound.unlock();
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
