# Calendar Sync Service

Daemon che tiene sincronizzati bidirezionalmente i calendari Apple (CalDAV/iCloud) e Google Calendar mantenendo titoli, note, posizioni, eventi all-day, categorie e colori. Pronto per lanciare con PM2: basta riempire le variabili ambiente e avviare.

## Setup rapido

1. `npm install`
2. Copia `.env.example` in `.env` e compila i valori.
3. `npm run build`
4. `node dist/index.js` (oppure `pm2 start dist/index.js --name calendar-sync` dopo il build)

## Variabili ambiente (`.env`)

- `APPLE_CALDAV_URL` – base CalDAV (default: `https://caldav.icloud.com`)
- `APPLE_USERNAME` – Apple ID
- `APPLE_APP_PASSWORD` – password specifica per l’app
- `APPLE_CALENDAR_URLS` – lista di URL CalDAV dei calendari da sincronizzare, separati da virgola (nell’ordine in cui verranno abbinati ai calendari Google)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` – email del service account
- `GOOGLE_SERVICE_ACCOUNT_KEY` – private key del service account, con `\n` escape nelle nuove righe
- `GOOGLE_CALENDAR_IDS` – lista di calendarId Google, separati da virgola, in ordine parallelo a `APPLE_CALENDAR_URLS`
- `SYNC_INTERVAL_MINUTES` – ogni quanto eseguire un ciclo di sync (default 5)
- `SYNC_WINDOW_DAYS` – finestra di eventi passati/futuri da considerare (default 180)
- `TZ` – timezone usata per gli eventi con orario (default `UTC`)
- `LOG_LEVEL` – livello log pino (default `info`)

> I calendari sono abbinati per indice: il primo Apple con il primo Google, e così via.

## Strategie di sincronizzazione

- Bidirezionale: Apple e Google sono entrambi fonti di verità.
- Conflitti: vince l’evento modificato più di recente; se gli orari di modifica coincidono, prevale Apple.
- Campi sincronizzati: titolo, descrizione/note, luogo, date/ora o all-day, categorie, colore (mappato su Google se presente), link.
- Categorie e colore su Google sono mantenuti anche in `extendedProperties.private` per preservare i dati quando non esiste un mapping diretto.

## Avvio con PM2

```bash
npm run build
pm2 start dist/index.js --name calendar-sync
pm2 save
```

## Sviluppo e test

- Modalità dev: `npm run dev`
- Test unitari: `npm test`

## Note

- Richiede Node.js 18+.
- Il service account Google deve avere permessi di scrittura sui calendarId indicati.
- Per Apple/iCloud serve una password specifica per app e gli URL CalDAV dei calendari da sincronizzare.
