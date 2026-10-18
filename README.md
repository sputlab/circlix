# Circlix — v1.3.1

<p align="center">
  <img src="icons/icon-192.png" alt="Circlix Icon" width="128" height="128">
</p>

[![Italian Version](https://img.shields.io/badge/docs-Italian-blue.svg)](README.it.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-2fe3b4.svg)](manifest.json)

A minimalist reflex arcade game built with HTML5 Canvas, modern JavaScript, PHP, and MySQL (originally known as *Circle Challenge*). Orbit around circular tracks, dodge obstacles, and hit targets at the perfect split-second as angular speed continuously accelerates.

The UI is entirely in English for global reach, and the app is packaged as a **Progressive Web App (PWA)** installable on iOS, Android, macOS, and Windows with offline play support.

> For the Italian documentation, see [README.it.md](README.it.md).

---

## Features

- **Intuitive single-action gameplay**: Tap, click, or press Space to jump between inner and outer orbits.
- **Dynamic scoring & precision bonuses**: Hit target segments dead-center for maximum points.
- **Power-ups & hazards**:
  - **Targets (Teal)**: Earn points with center-hit accuracy multipliers.
  - **Obstacles (Coral)**: Cost a life when hit.
  - **Slowdown (Blue)**: Temporarily eases the speed back down with an on-screen timer ring.
  - **Double Life (Purple)**: Grants +2 lives (up to the difficulty ceiling).
  - **Bomb (Orange)**: Detonates all obstacles currently on track in a particle explosion.
- **Dual difficulty modes**:
  - **Easy**: 4 starting lives (max 8), smooth acceleration curve, forgiving reaction windows.
  - **Hard**: 2 starting lives (max 4), ruthless acceleration curve, narrow reaction windows.
- **Global Leaderboard**: Backed by MySQL with signed run tokens (HMAC-SHA256) and IP rate limiting to prevent score tampering.
- **Progressive Web App (PWA)**: Installable to your home screen or desktop with service-worker offline caching for immediate load times and offline gameplay.
- **Pure Web Audio synthesis**: Retro-modern procedural sound effects without external audio assets.

---

## Project Structure

```
circlix/
├── index.html              Main HTML structure: splash, HUD, canvas, overlays
├── manifest.json           PWA Web App Manifest (metadata, theme, icons)
├── sw.js                   Service Worker for offline asset caching
├── LICENSE                 MIT License
├── README.md               Project documentation (English)
├── README.it.md            Documentazione del progetto (Italiano)
├── SECURITY.md             Security evaluation report & hardening checklist
├── VERSION                 Current version string (1.2.1)
├── css/
│   └── style.css           Graphite theme styles + amber/coral/teal neon accents
├── js/
│   ├── game.js             Game engine (physics, canvas rendering, input, HUD)
│   ├── sound.js            Web Audio API procedural sound synthesizer
│   ├── leaderboard.js      API fetch client with signature handling
│   └── pwa.js              PWA service worker registration & lifecycle
├── icons/
│   ├── favicon.svg         Vector SVG icon
│   ├── icon-192.png        Standard PWA icon (192×192)
│   ├── icon-512.png        High-res PWA icon (512×512)
│   ├── icon-maskable-192.png Maskable adaptive icon (192×192)
│   ├── icon-maskable-512.png Maskable adaptive icon (512×512)
│   └── apple-touch-icon.png iOS home screen icon (180×180)
└── api/
    ├── config.example.php  Template configuration for MySQL credentials & secrets
    ├── config.php          Production credentials (ignored by git)
    ├── schema.sql          Database schema (scores, run tokens, rate limits)
    ├── start_run.php       API endpoint: issues HMAC-signed session run tokens
    ├── get_scores.php      API endpoint: retrieves top scores by difficulty
    └── submit_score.php    API endpoint: validates run tokens and saves scores
```

---

## Setup & Deployment

### 1. Database Configuration
Create the database and user in MySQL (or MariaDB):

```sql
CREATE DATABASE circlix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'circlix_user'@'localhost' IDENTIFIED BY 'your-secure-password';
GRANT ALL PRIVILEGES ON circlix.* TO 'circlix_user'@'localhost';
FLUSH PRIVILEGES;
```

Import the table schemas:
```bash
mysql -u circlix_user -p circlix < api/schema.sql
```

### 2. Environment Configuration
Copy the sample configuration file and edit it with your database credentials:
```bash
cp api/config.example.php api/config.php
```

Edit `api/config.php`:
- Set `DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASS`.
- Generate a unique, cryptographically secure 64-character hex secret for `SCORE_SIGNING_SECRET`:
  ```bash
  php -r "echo bin2hex(random_bytes(32)) . PHP_EOL;"
  ```

### 3. Web Server Deployment
Upload all files to any web server supporting **PHP 8.0+** with the `pdo_mysql` extension.
No build step or node package manager is required — the application runs on standard vanilla web technologies.

> [!NOTE]
> Make sure to serve the game over HTTPS in production (required for Service Workers, PWA installation, and Web Crypto APIs). Disable directory listing on `/api/`.

### 4. Verification
1. Open the website in your browser via a local or remote web server (`https://` or `http://localhost`).
2. Test the API endpoint directly: `api/get_scores.php?difficulty=easy`
   Expected response: `{"ok":true,"difficulty":"easy","scores":[]}`.
3. Open Developer Tools > Application to verify that the Web App Manifest and Service Worker are active.

---

## How to Play

- **Single Control**: Tap anywhere on screen, click the mouse, or press **Spacebar** to toggle between inner and outer orbital tracks.
- **Red Segments (Coral)**: Dangerous obstacles. Switch tracks to avoid them.
- **Green Segments (Teal)**: Target milestones. Switch into their lane to score points (hitting the center dot scores maximum bonus).
- **Blue Segments**: Speed brake. Temporarily slows rotation speed.
- **Purple Segments**: Extra lives (+2 lives).
- **Orange Segments**: Bomb power-up. Detonates all obstacles currently active on the ring.
- **Continuous Acceleration**: Angular speed increases progressively over time.

---

## Security Architecture

Circlix features comprehensive backend defense mechanisms against cheating and leaderboard flooding:
- **HMAC-SHA256 Signed Run Tokens**: Players must request a token via `api/start_run.php` when starting a match. The submission endpoint verifies signature integrity, token expiration, single-use consumption, and that score corresponds plausibly with session playtime.
- **Salted IP Rate Limiting**: Protects all API endpoints against automated spam.
- **Parameterized SQL Queries**: All queries utilize prepared statements via PDO.
- **Input Sanitization**: Player nicknames are sanitized to neutralize XSS vulnerabilities.

See [SECURITY.md](SECURITY.md) for the complete security evaluation and hardening checklist.

---

## Changelog

- **v1.3.1**
  - Enhanced graphics with multi-pass neon bloom and 60–120 FPS performance optimizations.
  - Added dynamic comet tail motion ribbon, squash & stretch lane transitions, and speed embers.
  - Added camera screen shake, expanding shockwave rings, and combo streak multipliers with harmonic pitch chime.
  - Updated development support link (`https://www.sputlab.com/donate`) and studio link (`https://www.sputlab.com`).
- **v1.3.0**
  - Added full Progressive Web App (PWA) support with offline gameplay caching via Service Worker.
  - Designed official high-resolution game icon suite (SVG, ICO, Apple touch icon, maskable PWA icons).
  - Bilingual documentation: complete English reference (`README.md`) and Italian reference (`README.it.md`).
- **v1.2.1**
  - Updated all database table names to use the `circlix_` prefix (`circlix_scores`, `circlix_run_tokens_used`, `circlix_rate_limit`).
  - Added template configuration `config.example.php` and `.gitignore` protection.
- **v1.2.0**
  - Implemented anti-cheat HMAC-signed run token lifecycle.
  - Added per-IP rate limiting across all API endpoints.
  - Implemented time-proportional score plausibility thresholds.
  - Added security response headers (`X-Frame-Options`, `Referrer-Policy`) and HTML Content Security Policy.
- **v1.1.0**
  - Added Orange Bomb bonus segment with particle detonation effects.
  - Added precision center indicators on target segments.
  - Introduced the Quick Guide modal.
- **v1.0.1**
  - Added comprehensive in-game Guide modal under Settings.
  - Added precision glow gradients.
- **v1.0.0**
  - Renamed game to **Circlix**.
  - Translated complete user interface to English.
  - Added Settings dialog with audio controls and development links.
- **v0.1 – v0.5**
  - Speed ramp balance revisions, procedural sound synthesizer, lookahead lane spawners, and core game loop architecture.

---

## License

Distributed under the [MIT License](LICENSE). Copyright (c) 2026 sputlab.
