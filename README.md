# Calendar Sync

<p align="center">
  <img src="docs/assets/calendar-sync-cover.png" alt="Calendar Sync cover image showing two calendar systems synchronized through a secure cloud" width="100%" />
</p>

<p align="center">
  <strong>A production-minded Apple CalDAV / iCloud to Google Calendar synchronization daemon.</strong>
</p>

<p align="center">
  <a href="https://nodejs.org/"><img alt="Node.js 18+" src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white"></a>
  <a href="https://developers.google.com/calendar"><img alt="Google Calendar API" src="https://img.shields.io/badge/Google%20Calendar-API-4285F4?logo=googlecalendar&logoColor=white"></a>
  <img alt="CalDAV" src="https://img.shields.io/badge/CalDAV-iCloud-0A84FF">
  <img alt="PM2 ready" src="https://img.shields.io/badge/PM2-ready-2B037A">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-green.svg"></a>
</p>

Calendar Sync is a bidirectional background service that keeps Apple Calendar
through CalDAV/iCloud and Google Calendar aligned. It preserves core event
metadata, supports multiple calendar pairs, resolves conflicts deterministically,
and is ready to run as a long-lived PM2 process.

This project was built by **Mattia Beltrami**, a Computer Engineering student at
**Politecnico di Milano**, as part of a personal portfolio focused on practical,
well-engineered automation tools.

## Highlights

- **Bidirectional sync** between Apple CalDAV/iCloud calendars and Google Calendar.
- **Multiple calendar mappings** through parallel Apple and Google calendar lists.
- **Conflict handling** based on the most recently modified event, with Apple as
  the deterministic tie-breaker.
- **Event fidelity** for title, description, location, start/end time, all-day
  events, categories, color metadata, and links.
- **Deletion propagation** using persisted sync state to detect events removed on
  either side.
- **PM2-friendly runtime** for always-on deployment.
- **Typed TypeScript codebase** with focused unit tests for calendar parsing and
  conflict behavior.

## How It Works

Calendar Sync periodically reads a configurable time window from both providers,
normalizes events into a shared internal shape, and compares matching events by
UID. Each Apple calendar URL is paired with the Google calendar ID in the same
position of the configuration lists.

When an event exists on both sides, the service compares the normalized payload
and updates the older copy. When an event exists only on one side, persisted state
is used to decide whether the event is new and should be copied, or whether it was
deleted on the opposite side and should be removed.

```text
Apple Calendar / iCloud (CalDAV)
             |
             v
      Calendar Sync daemon
             |
             v
Google Calendar API
```

## Tech Stack

- **Runtime:** Node.js 18+
- **Language:** TypeScript
- **Apple side:** CalDAV via `tsdav` and `ical.js`
- **Google side:** Google Calendar API via `googleapis`
- **Logging:** `pino`
- **Process manager:** PM2
- **Testing:** Vitest

## Quick Start

```bash
npm install
cp .env.example .env
npm run build
npm start
```

For development:

```bash
npm run dev
```

For tests:

```bash
npm test
```

## Configuration

Create a `.env` file from `.env.example` and fill in the required values.

| Variable | Description |
| --- | --- |
| `APPLE_CALDAV_URL` | Apple CalDAV base URL. Defaults to `https://caldav.icloud.com`. |
| `APPLE_USERNAME` | Apple ID used for CalDAV authentication. |
| `APPLE_APP_PASSWORD` | Apple app-specific password. |
| `APPLE_CALENDAR_URLS` | Comma-separated CalDAV calendar URLs. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google service account email. |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google service account private key, with escaped `\n` line breaks. |
| `GOOGLE_CALENDAR_IDS` | Comma-separated Google calendar IDs. |
| `SYNC_INTERVAL_MINUTES` | Minutes between sync cycles. Defaults to `5`. |
| `SYNC_WINDOW_DAYS` | Past and future event window to scan. Defaults to `180`. |
| `TZ` | Timezone used for timed events. Defaults to `UTC`. |
| `LOG_LEVEL` | Pino log level. Defaults to `info`. |

Calendar mappings are positional:

```text
APPLE_CALENDAR_URLS[0] <-> GOOGLE_CALENDAR_IDS[0]
APPLE_CALENDAR_URLS[1] <-> GOOGLE_CALENDAR_IDS[1]
```

## Running With PM2

```bash
npm run build
pm2 start dist/index.js --name calendar-sync
pm2 save
```

Useful PM2 commands:

```bash
pm2 logs calendar-sync
pm2 restart calendar-sync
pm2 stop calendar-sync
```

## Google Calendar Setup

1. Create or select a Google Cloud project.
2. Enable the Google Calendar API.
3. Create a service account.
4. Generate a JSON key and copy the service account email/private key into `.env`.
5. Share each target Google Calendar with the service account email and grant
   write permissions.

## Apple Calendar Setup

1. Create an Apple app-specific password for the Apple ID.
2. Find the CalDAV calendar URLs for the calendars you want to sync.
3. Add those URLs to `APPLE_CALENDAR_URLS` in the same order as the matching
   Google calendar IDs.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

The code is organized around provider clients, shared event types, normalization
utilities, and a sync service that owns conflict resolution and propagation.

```text
src/
  clients/      Provider integrations
  sync/         Sync orchestration and conflict logic
  utils/        iCalendar parsing and persisted sync state
  config.ts     Environment-based configuration
  index.ts      Runtime bootstrap
```

## Portfolio Note

Calendar Sync is designed as a practical systems project rather than a toy demo:
it handles real provider APIs, long-running process concerns, deterministic
conflict behavior, and stateful synchronization. It represents the kind of
engineering Mattia Beltrami is interested in building: reliable automation that
turns a daily workflow problem into maintainable software.

## License

MIT. See [LICENSE](LICENSE).
