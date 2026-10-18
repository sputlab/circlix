# Circlix — v1.3.1

<p align="center">
  <img src="icons/icon-192.png" alt="Circlix Icon" width="128" height="128">
</p>

[![English Version](https://img.shields.io/badge/docs-English-blue.svg)](README.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-2fe3b4.svg)](manifest.json)

Gioco di riflessi in HTML5 + JS + PHP + MySQL, precedentemente noto come
"Circle Challenge". Orbita attorno a un percorso circolare, evita gli
ostacoli, colpisci i bersagli al momento giusto: la velocità aumenta di
continuo.

L'app è ora configurata come **Progressive Web App (PWA)**, installabile su iOS, Android e Desktop, con supporto offline tramite Service Worker.

> Per la documentazione in lingua inglese, vedi [README.md](README.md).

## Changelog

**v1.3.1**
- Grafica ed effetti visivi potenziati con bloom neon multi-pass e rendering ottimizzato a 60–120 FPS.
- Aggiunta scia dinamica a cometa (motion ribbon), deformazione squash & stretch nei cambi corsia e scintille di velocità.
- Aggiunto screen shake (scuotimento telecamera), anelli di onde d'urto e moltiplicatore combo con chime audio a tono crescente.
- Aggiornati i link in Impostazioni per il supporto allo sviluppo (`https://www.sputlab.com/donate`) e lo studio (`https://www.sputlab.com`).

**v1.3.0**
- Supporto completo Progressive Web App (PWA) con caching e gioco offline via Service Worker.
- Suite completa di icone ad alta risoluzione (SVG, ICO, Apple touch icon, icone adattive maskable per Android).
- Documentazione bilingue: guida completa in inglese (`README.md`) e versione italiana (`README.it.md`).

**v1.2.1**
- Tutte le tabelle del database usano ora il prefisso `circlix_`
  (`circlix_scores`, `circlix_run_tokens_used`, `circlix_rate_limit`)
  al posto del precedente `cc_`. Se hai già importato lo schema
  precedente, va reimportato da zero (o rinominate manualmente le
  tabelle) prima di aggiornare i file PHP — i nomi non sono più
  compatibili con la versione precedente.

**v1.2.0 — Security hardening**
- Vedi `SECURITY.md` per il report completo. In sintesi: introdotto un
  "run token" firmato (HMAC-SHA256) che lega ogni invio di punteggio a
  una partita realmente iniziata, con scadenza, controllo di
  plausibilità proporzionale al tempo di gioco e utilizzo singolo —
  chiude la falla che permetteva di inviare punteggi falsi con una
  semplice richiesta POST diretta.
- Aggiunto rate limiting (per IP, con hash salato) su tutti e tre gli
  endpoint API.
- Tetto di plausibilità del punteggio non più fisso (999999) ma
  proporzionale al tempo di gioco effettivo, con soglie separate per
  Easy/Hard.
- Aggiunti header di sicurezza (X-Frame-Options, Referrer-Policy) alle
  risposte API e una Content-Security-Policy nell'HTML.
- Verificato (nessuna modifica necessaria): le query sono già tutte
  parametrizzate (nessun rischio SQL injection), il nome giocatore
  nella classifica è già correttamente sanificato in output (nessun
  rischio XSS), gli errori del database non espongono mai dettagli
  interni al client.
- **Prima di andare in produzione**: seguire la checklist in fondo a
  `SECURITY.md` (cambiare `DB_PASS` e `SCORE_SIGNING_SECRET` in
  `api/config.php`, servire solo via HTTPS, disabilitare il directory
  listing su `/api/`).

**v1.1.0**
- Corretta la stringa "Punteggio inviato" rimasta in italiano nella
  schermata di fine partita ("Score submitted ✓").
- **Segmenti di nuovo solidi** (con una certa trasparenza) al posto del
  gradiente a più livelli della v1.0.1. Ogni segmento ha ora un
  **pallino completamente opaco esattamente al centro**, che indica il
  punto preciso dove il colpo vale di più — molto più chiaro e
  immediato del gradiente precedente.
- **Nuovo segmento bonus: Bomba (arancione)** — entrandoci nella corsia
  giusta, fa detonare ed eliminare tutti gli ostacoli rossi
  attualmente presenti sul tracciato, con un effetto particellare da
  esplosione in corrispondenza di ciascuno.
- Rimosse le spiegazioni del funzionamento dalla schermata iniziale;
  aggiunto un pulsante **Quick Guide** sotto "Play" che apre un modale
  con lo stesso contenuto, aggiornato con il nuovo bonus bomba.
- Aggiornata la Guida completa (in Settings) con la sezione dedicata
  alla bomba e la descrizione corretta del pallino di precisione.

**v1.0.1**
- Corretto il titolo nello splash: "Circlix" ora sta sempre su una riga
  sola (prima andava a capo dopo "Circ").
- Semplificati i pulsanti Easy/Hard: mostrano solo il ritmo (smooth /
  ruthless pace), il dettaglio delle vite è ora nella nuova Guida.
- Aggiunto un pulsante **Guide** nel modale Settings (sotto Sound), che
  apre un modale con la spiegazione completa e dettagliata di ogni
  elemento del gioco: corsie, ostacoli, bersagli, vita bonus, segmento
  rallenta, segmento vita doppia, difficoltà, classifica.
- **Gradiente di precisione sui segmenti**: ogni segmento (bersaglio,
  rallenta, vita doppia) è ora disegnato con più livelli sovrapposti,
  via via più stretti e più opachi verso il centro. Il risultato è un
  alone che è più "pieno"/luminoso al centro e sfuma verso i bordi —
  in corrispondenza esatta con la regola di punteggio (colpire il
  centro vale di più che sfiorare il bordo), reso finalmente intuitivo
  a colpo d'occhio.
- Rimossa la dicitura "Production Ready" dal tag versione in splash e
  dalla voce di changelog v1.0.

**v1.0.0**
- Rinominato il gioco in **Circlix**.
- Corretti i pulsanti di difficoltà nello splash, che riportavano il
  numero di vite sbagliato (mostravano ancora i valori della v0.3).
  Ora: Easy "4 lives (max 8)", Hard "2 lives (max 4)".
- Aggiunto un pulsante **Settings** al posto del vecchio toggle audio in
  splash. Apre un modale con: interruttore audio, pulsante Changelog
  (apre lo storico versioni in un secondo modale), link "Support
  development" (sputlab.com/donate) e link "More Apps & Games"
  (sputlab.com), più la scritta "Made with love by sputlab.com"
  in fondo.
- **Tradotta interamente l'interfaccia in inglese** (HUD, overlay,
  splash, messaggi di stato, messaggi di errore delle API PHP) per
  raggiungere un pubblico più ampio. Questo README resta in italiano.

**v0.5**
- **Ribilanciamento globale della velocità**: la rampa di difficoltà
  saliva troppo in fretta — oltre il x2,5 il gioco diventava
  ingiocabile in entrambe le modalità. Ora ci vuole molto più tempo per
  arrivarci: circa 5 minuti in Easy (`rampRate` da 0,012 a 0,005) e
  circa 4 minuti in Hard (da 0,022 a 0,010), invece di ~2 minuti.
  `maxSpeed` resta invariato: cambia solo quanto lentamente ci si arriva.
- **Segmento "rallenta" (blu)**: comparsa ridotta di oltre metà (Easy
  0,12 → 0,05, Hard 0,10 → 0,04) — ne apparivano troppi.
- **Segmento "vita doppia" (viola)**: reso ancora più raro (Easy
  0,02 → 0,008, Hard 0,015 → 0,006).
- **Nuovo — countdown del bonus rallenta**: mentre l'effetto è attivo,
  al centro del cerchio appare un anello che si svuota con i secondi
  rimanenti, così è chiaro quando finirà.
- **Nuovo — feedback visivo su ogni raccolta**: oltre al suono, ora ogni
  bersaglio/bonus raccolto mostra un testo fluttuante (`+80`, `RALLENTA`,
  `+2 VITE`, `+1 VITA`) e un piccolo scoppio di particelle nella
  posizione del pallino. Anche gli ostacoli colpiti mostrano un `-1`.

**v0.4**
- Vite: Easy parte con 4 (tetto 8), Hard parte con 2 (tetto 4).
- Nuovo segmento "rallenta" (blu): riduce temporaneamente la velocità.
- Nuovo segmento "vita doppia" (viola, raro): +2 vite in un colpo.
- La corsia attuale del pallino viene evidenziata con un alone ambra.

**v0.3**
- **Fix critico di rendering**: i segmenti rossi/verdi venivano disegnati
  con la convenzione angolare nativa di `ctx.arc()` (0 rad = ore 3),
  mentre la posizione del giocatore era calcolata con una convenzione
  "da orologio" (0 rad = ore 12). Le due cose non erano allineate: i
  segmenti apparivano ruotati di 90° rispetto a dove il pallino passa
  davvero. Corretto allineando entrambe le convenzioni.
- UI: pulsanti pausa/audio spostati agli angoli inferiori dello schermo.
  Indicatore vite reso più prominente.
- Vita bonus ogni tanti bersagli colpiti, con suono e pulsazione dedicati.

**v0.2**
- Fix del lookahead di spawn (creava sovrapposizioni visive "esca").
- Feedback sonoro sintetizzato via Web Audio API.

**v0.1** — build iniziale di test.

## Struttura del progetto

```
circlix/
├── index.html              Markup: splash, HUD, canvas, overlay
├── manifest.json           Web App Manifest per installazione PWA
├── sw.js                   Service Worker per caching e supporto offline
├── LICENSE                 Licenza MIT
├── README.md               Documentazione del progetto (Inglese)
├── README.it.md            Documentazione del progetto (Italiano)
├── SECURITY.md             Report e architettura di sicurezza
├── VERSION                 Versione corrente
├── css/
│   └── style.css           Stile (palette grafite + accenti ambra/corallo/teal)
├── js/
│   ├── game.js             Motore di gioco (canvas, fisica, input, HUD)
│   ├── sound.js            Feedback sonoro sintetizzato Web Audio API
│   ├── leaderboard.js      Client fetch verso le API
│   └── pwa.js              Registrazione e gestione Service Worker PWA
├── icons/
│   ├── favicon.svg         Icona vettoriale SVG
│   ├── icon-192.png        Icona PWA 192×192
│   ├── icon-512.png        Icona PWA alta risoluzione 512×512
│   ├── icon-maskable-192.png Icona adattiva maskable 192×192
│   ├── icon-maskable-512.png Icona adattiva maskable 512×512
│   └── apple-touch-icon.png Icona per schermata home Apple iOS (180×180)
└── api/
    ├── config.example.php  Template configurazione MySQL & secret (versionato)
    ├── config.php          Credenziali reali (ignorato da git)
    ├── schema.sql          Schema tabelle circlix_scores, circlix_run_tokens_used, circlix_rate_limit
    ├── start_run.php       POST generazione run token firmato HMAC
    ├── get_scores.php      GET classifica per difficoltà
    └── submit_score.php    POST invio nuovo punteggio con validazione token
```

## Setup

1. **Database**
   ```sql
   CREATE DATABASE circlix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'circlix_user'@'localhost' IDENTIFIED BY 'una-password-sicura';
   GRANT ALL PRIVILEGES ON circlix.* TO 'circlix_user'@'localhost';
   FLUSH PRIVILEGES;
   ```
   Poi importa lo schema:
   ```bash
   mysql -u circlix_user -p circlix < api/schema.sql
   ```

2. **Configurazione**
   Copia il file di configurazione template e compila le credenziali reali:
   ```bash
   cp api/config.example.php api/config.php
   ```
   Apri `api/config.php` e imposta `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`.
   Genera una chiave univoca per `SCORE_SIGNING_SECRET`, ad esempio con:
   ```bash
   php -r "echo bin2hex(random_bytes(32));"
   ```

3. **Deploy**
   Copia l'intera cartella su un host con PHP 8+ ed estensione PDO MySQL
   abilitata (praticamente ogni hosting condiviso standard va bene). Non
   serve build step: è tutto statico + PHP puro.

4. **Verifica rapida**
   - Apri `index.html` nel browser (tramite web server locale/remoto con PHP, non via `file://`, altrimenti
     le chiamate `fetch` alle API falliscono).
   - Prova `api/get_scores.php?difficulty=easy` direttamente nel browser:
     deve rispondere `{"ok":true,"difficulty":"easy","scores":[]}`.

## Come si gioca

- Un solo comando: **tap / click / Spazio** cambia corsia (interna ↔ esterna).
- I segmenti **rossi** sono ostacoli: cambia corsia per evitarli.
- I segmenti **verdi** sono bersagli: portati sulla loro corsia per
  guadagnare punti (più preciso il passaggio al centro del segmento, più
  punti).
- I segmenti **blu** rallentano temporaneamente la corsa.
- I segmenti **viola** assegnano +2 vite.
- I segmenti **arancioni** (bomba) eliminano tutti gli ostacoli rossi presenti con un'esplosione.
- La velocità angolare cresce in continuazione: facile da imparare, difficile
  da padroneggiare.
- **Easy**: 4 vite (max 8), rampa di velocità morbida, finestre di reazione larghe.
- **Hard**: 2 vite (max 4), rampa più ripida, finestre di reazione strette.

## Sicurezza

Vedi [SECURITY.md](SECURITY.md) per l'analisi dettagliata e la checklist di hardening:
- Run token firmati (HMAC-SHA256) per prevenire submit fraudolenti
- Rate limiting per IP con hash salato
- Tetto di plausibilità del punteggio dinamico in base al tempo di gioco
- Query parametrizzate e sanificazione output contro SQL injection ed XSS

