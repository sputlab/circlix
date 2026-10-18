# Circlix — Security Assessment

Data: 13 agosto 2026 · Versione valutata: v1.1.0 → v1.2.0

Questo documento riassume una revisione di sicurezza mirata ad abusi,
cheat e usi malevoli del codice (client HTML/JS + backend PHP/MySQL).
Non è un penetration test formale, ma copre l'intera superficie
d'attacco realistica per un'app di queste dimensioni: API pubbliche,
gestione input utente, XSS, injection, abuso della leaderboard.

## Sintesi

| # | Problema | Severità | Stato |
|---|----------|----------|-------|
| 1 | Chiunque poteva inviare un punteggio arbitrario via POST diretta, senza aver mai giocato | **Alta** | ✅ Corretto |
| 2 | Nessun rate limiting su nessun endpoint (spam/flood della leaderboard) | **Alta** | ✅ Corretto |
| 3 | Tetto di plausibilità del punteggio troppo permissivo (999999, fisso) | Media | ✅ Corretto |
| 4 | Nessun header di sicurezza (clickjacking, MIME sniffing) | Media | ✅ Corretto (parziale, vedi nota CSP) |
| 5 | `window.CCLeaderboard` esposto globalmente in console — chiunque può chiamare le funzioni manualmente | Media | ⚠️ Mitigato, non eliminabile lato client |
| 6 | Messaggi di errore del database potenzialmente verbosi | Bassa | ✅ Verificato: già sicuro |
| 7 | XSS tramite nome giocatore nella leaderboard | Bassa | ✅ Verificato: già sicuro (escaping presente) |
| 8 | SQL injection | — | ✅ Verificato: query parametrizzate ovunque, nessun rischio |
| 9 | Directory listing su `/api/` | Bassa | 📋 Da configurare lato hosting |
| 10 | Gameplay non server-authoritative (rischio residuo strutturale) | Media | 📋 Documentato, fuori scope per questa release |

Legenda: ✅ risolto in questa release · ⚠️ mitigato ma non eliminabile · 📋 richiede azione lato hosting o è un limite architetturale noto

---

## 1. Invio punteggi falsi (il problema più serio)

**Prima:** `api/submit_score.php` accettava `{player_name, score, difficulty}`
e li inseriva a DB dopo controlli solo di forma (tipo, range 0–999999).
Chiunque — senza mai aprire il gioco — poteva eseguire:

```
curl -X POST https://tuosito.it/api/submit_score.php \
  -H "Content-Type: application/json" \
  -d '{"player_name":"Cheater","score":999999,"difficulty":"hard"}'
```

e comparire in cima alla classifica globale.

**Fix implementato — "run token" firmato:**
- Nuovo endpoint `api/start_run.php`: chiamato quando la partita inizia,
  restituisce un token firmato (HMAC-SHA256) che lega `{difficoltà,
  timestamp di partenza}`.
- `api/submit_score.php` ora **richiede** questo token e:
  - verifica la firma (`hash_equals`, a prova di timing attack);
  - verifica che non sia scaduto (max 45 minuti di vita);
  - verifica che la difficoltà dichiarata combaci con quella del token;
  - verifica che il punteggio sia plausibile **per il tempo
    effettivamente trascorso** dall'inizio della partita (vedi punto 3);
  - lo consuma: ogni token è utilizzabile **una sola volta**
    (tabella `circlix_run_tokens_used`, chiave primaria sull'hash del token
    — un secondo tentativo con lo stesso token fallisce a livello di
    database, non solo applicativo).

Testato end-to-end (partita legittima, invio diretto senza token, token
rubato/riusato, token manomesso, token con difficoltà non corrispondente,
token scaduto): tutti gli scenari di abuso vengono correttamente
respinti — dettaglio dei test in fondo al documento.

## 2. Rate limiting

**Prima:** nessuno, su nessuno dei tre endpoint. Uno script poteva
inondare `submit_score.php` o `get_scores.php` con migliaia di
richieste al minuto.

**Fix:** nuova funzione `cc_rate_limit_check()` in `config.php`,
basata su una tabella `circlix_rate_limit` che conta le richieste per IP
(hash SHA-256 salato, mai l'IP in chiaro) in una finestra temporale.
Applicata a tutti e tre gli endpoint:
- `start_run.php`: 40 richieste/ora per IP
- `submit_score.php`: 30 richieste/ora per IP
- `get_scores.php`: 120 richieste/ora per IP (più permissivo, è solo lettura)

Verificato con un test di flood reale: le prime 40 richieste a
`start_run.php` passano, dalla 41ª in poi il server risponde `429 Too
Many Requests`.

**Limite noto:** il limite è per-IP. Utenti dietro lo stesso NAT/proxy
condividono il conteggio (falsi positivi rari ma possibili); un
attaccante con molti IP diversi può comunque distribuire il carico.
Per una protezione più forte servirebbe un livello a monte (Cloudflare,
un WAF, o simili) — fuori dallo scope di questa release.

## 3. Tetto di plausibilità del punteggio

**Prima:** un valore fisso e molto alto (`999999`), uguale per
entrambe le difficoltà, senza alcun legame con quanto tempo fosse
effettivamente durata la partita.

**Fix:** due livelli:
- Un tetto assoluto più realistico (`200000`, comunque generoso) come
  primo filtro economico.
- Un tetto **proporzionale al tempo trascorso**, calcolato dal run
  token: `punteggio_max = secondi_trascorsi × punti_al_secondo_massimi
  + margine`. I valori di punti/secondo (40 per Easy, 65 per Hard) sono
  stati calibrati generosamente sopra la velocità di punteggio di un
  giocatore molto abile, così da non penalizzare mai una partita reale,
  ma da rendere impossibile dichiarare punteggi enormi per partite
  durate pochi secondi.

## 4. Header di sicurezza

**Aggiunti** a tutte le risposte delle API (`cc_send_json_headers()`):
- `X-Content-Type-Options: nosniff` (già presente)
- `X-Frame-Options: DENY` (nuovo — impedisce di incorporare le risposte
  API in un iframe altrui)
- `Referrer-Policy: no-referrer` (nuovo)

**Aggiunto** a `index.html`, un tag `<meta http-equiv="Content-Security-Policy">`
che limita script/stili/font/connessioni alla sola origine del sito
(più Google Fonts per i font). Nessuno script inline è presente nel
codice, quindi la policy è già `script-src 'self'` senza eccezioni.

**Limite noto:** una CSP via `<meta>` non può impostare la direttiva
`frame-ancestors` (serve un header HTTP vero, non un tag nella pagina),
quindi la pagina di gioco in sé non è ancora protetta da clickjacking
lato browser. Da aggiungere lato server — vedi checklist di deploy in
fondo.

## 5. `window.CCLeaderboard` esposto globalmente

Chiunque apra la console del browser può digitare
`CCLeaderboard.submitScore(...)` a mano. Questo **non è eliminabile**
lato client in un'app senza autenticazione: qualunque codice JS
eseguito nel browser dell'utente può, per definizione, chiamare le
stesse funzioni che chiamerebbe l'interfaccia. Il run-token descritto
al punto 1 è la mitigazione corretta per questa categoria di problema:
anche chiamando `submitScore` a mano, serve comunque un token valido,
emesso dal server, consumabile una sola volta, con un punteggio
plausibile per il tempo trascorso — la console non dà nessun vantaggio
in più rispetto a giocare normalmente.

## 6–8. Verificati, già sicuri

- **Messaggi di errore DB**: il blocco `catch (PDOException $e)` in
  `cc_get_pdo()` non espone mai `$e->getMessage()` al client (che
  potrebbe rivelare host, nome DB o dettagli dello schema) — restituisce
  sempre lo stesso messaggio generico.
- **XSS via nome giocatore**: `game.js` passa sempre `r.player_name`
  attraverso `escapeHtml()` (implementata con `textContent`, non
  concatenazione di stringhe) prima di inserirlo nell'HTML della
  classifica. Un nome tipo `<script>alert(1)</script>` viene mostrato
  come testo letterale, non eseguito. Confermato leggendo il codice.
- **SQL injection**: ogni query usa `PDO::prepare()` con parametri
  bindati (mai concatenazione di stringhe nell'SQL), e
  `PDO::ATTR_EMULATE_PREPARES` è disattivato (prepared statement nativi
  lato MySQL, non solo simulati lato PHP). Nessun punto d'ingresso per
  injection identificato.

## 9. Directory listing su `/api/`

Non controllabile da codice PHP — dipende dalla configurazione del
web server. Se il directory listing è abilitato e manca un file
indice, chiunque visiti `/api/` vedrebbe l'elenco dei file (non il
codice sorgente, se PHP è configurato correttamente, ma comunque
informazione utile a un attaccante). Vedi checklist di deploy.

## 10. Gameplay non server-authoritative (rischio residuo)

Il punteggio è calcolato interamente nel browser e comunicato al
server solo al game-over. Anche con tutte le protezioni sopra, un
attaccante sufficientemente motivato che studi il formato del token
potrebbe comunque:
- giocare una partita vera (o simularne la durata) per ottenere un
  token valido e non scaduto;
- inviare un punteggio "gonfiato ma plausibile" per quella durata
  (es. dichiarare il punteggio massimo teorico invece di quello
  realmente ottenuto).

Le mitigazioni attuali alzano notevolmente la barriera (niente più
"un curl e sei primo in classifica"), ma non eliminano del tutto la
possibilità di un punteggio gonfiato entro i limiti plausibili. Una
protezione completa richiederebbe rendere il server autoritativo sul
gameplay stesso — ad esempio facendo inviare al server il log completo
degli eventi di gioco (cambi corsia, timestamp) e ricalcolando il
punteggio server-side, oppure eseguendo la simulazione di gioco anche
lato server. È un cambio architetturale sostanziale, ragionevole da
valutare solo se la classifica dovesse diventare un elemento
competitivo/con premi; per un gioco casual con classifica "for fun"
le protezioni attuali sono un compromesso adeguato.

---

## Checklist di deploy (da fare prima di andare live)

- [ ] Cambiare `DB_PASS` in `api/config.php` con una password reale.
- [ ] Cambiare `SCORE_SIGNING_SECRET` in `api/config.php` con un
      segreto lungo e casuale — **mai** riutilizzare il placeholder.
      Generarlo con: `php -r "echo bin2hex(random_bytes(32));"`
- [ ] Servire il sito **solo su HTTPS**.
- [ ] Disabilitare il directory listing su `/api/` (Apache:
      `Options -Indexes` in un `.htaccess` dentro `api/`; Nginx:
      `autoindex off;`).
- [ ] Se possibile, aggiungere a livello di web server (non solo via
      meta tag) gli header `X-Frame-Options: DENY` e una CSP con
      `frame-ancestors 'none'` per proteggere anche `index.html` dal
      clickjacking.
- [ ] Programmare una pulizia periodica (es. cron settimanale) delle
      righe più vecchie di `RUN_TOKEN_MAX_AGE_SECONDS` in
      `circlix_run_tokens_used` e delle righe obsolete in `circlix_rate_limit`,
      per evitare che crescano indefinitamente.

---

## Test eseguiti

Verifica funzionale end-to-end (server PHP reale + database SQLite di
prova, isolato dal database di produzione):

1. Flusso legittimo (`start_run` → attesa → `submit_score` con
   punteggio plausibile) → **accettato**, punteggio comparso in
   classifica.
2. `submit_score` diretto senza alcun token → **respinto**
   (`Missing or invalid run token.`).
3. Token valido riutilizzato due volte → prima accettata, seconda
   **respinta** (`This run token has already been used.`).
4. Token valido ma punteggio implausibile per il tempo trascorso
   (1 secondo di gioco, punteggio dichiarato 50000) → **respinto**
   (`Score not plausible for this run.`).
5. Token con payload manomesso → **respinto** (`Invalid run token.`).
6. Token per Easy, invio dichiarato come Hard → **respinto**
   (`Run token does not match difficulty.`).
7. Token con timestamp forzato a un'ora fa (oltre il limite di 45
   minuti) → **respinto** (`Run token expired.`).
8. Flood di 45 richieste a `start_run.php` (limite configurato: 40/ora)
   → le prime 40 rispondono `200`, dalla 41ª in poi `429`.

Tutti gli scenari si sono comportati come previsto.
