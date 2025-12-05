import dotenv from 'dotenv';
import { CalendarMapping } from './types';

dotenv.config();

export interface AppConfig {
  timezone: string;
  syncIntervalMinutes: number;
  syncWindowDays: number;
  logLevel: string;
  apple: {
    serverUrl: string;
    username: string;
    password: string;
    calendarUrls: string[];
  };
  google: {
    serviceAccountEmail: string;
    serviceAccountKey: string;
    calendarIds: string[];
  };
  mappings: CalendarMapping[];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function loadConfig(): AppConfig {
  const appleCalendarUrls = parseList(process.env.APPLE_CALENDAR_URLS);
  const googleCalendarIds = parseList(process.env.GOOGLE_CALENDAR_IDS);

  if (!appleCalendarUrls.length) {
    throw new Error('APPLE_CALENDAR_URLS must list at least one CalDAV calendar URL.');
  }

  if (!googleCalendarIds.length) {
    throw new Error('GOOGLE_CALENDAR_IDS must list at least one Google Calendar ID.');
  }

  const pairCount = Math.min(appleCalendarUrls.length, googleCalendarIds.length);
  const mappings: CalendarMapping[] = [];

  for (let i = 0; i < pairCount; i += 1) {
    mappings.push({
      id: `pair-${i + 1}`,
      appleCalendarUrl: appleCalendarUrls[i],
      googleCalendarId: googleCalendarIds[i],
    });
  }

  if (appleCalendarUrls.length !== googleCalendarIds.length) {
    console.warn(
      `Calendar list lengths differ (apple=${appleCalendarUrls.length}, google=${googleCalendarIds.length}); pairing only the first ${pairCount} entries.`,
    );
  }

  return {
    timezone: process.env.TZ || 'UTC',
    syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES || 5),
    syncWindowDays: Number(process.env.SYNC_WINDOW_DAYS || 180),
    logLevel: process.env.LOG_LEVEL || 'info',
    apple: {
      serverUrl: process.env.APPLE_CALDAV_URL || 'https://caldav.icloud.com',
      username: requireEnv('APPLE_USERNAME'),
      password: requireEnv('APPLE_APP_PASSWORD'),
      calendarUrls: appleCalendarUrls,
    },
    google: {
      serviceAccountEmail: requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      serviceAccountKey: requireEnv('GOOGLE_SERVICE_ACCOUNT_KEY').replace(/\\n/g, '\n'),
      calendarIds: googleCalendarIds,
    },
    mappings,
  };
}
