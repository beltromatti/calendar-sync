import { Logger } from 'pino';
import crypto from 'crypto';
import { AppleCalDAVClient } from '../clients/appleClient';
import { GoogleCalendarClient } from '../clients/googleClient';
import { AppConfig } from '../config';
import { CalendarEvent, CalendarMapping, SyncWindow } from '../types';
import { loadState, saveState, SyncRecord, SyncState } from '../utils/state';

type ComparableEvent = {
  title: string;
  description?: string;
  location?: string;
  start: number | string;
  end: number | string;
  allDay: boolean;
  categories?: string[];
  color?: string;
};

export class SyncService {
  constructor(
    private readonly appleClient: AppleCalDAVClient,
    private readonly googleClient: GoogleCalendarClient,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {}

  async syncOnce(): Promise<void> {
    const window = buildWindow(this.config.syncWindowDays);
    const state = loadState();
    this.logger.info(
      { start: window.start.toISOString(), end: window.end.toISOString() },
      'Starting sync pass',
    );

    const [appleEvents, googleEvents] = await Promise.all([
      this.appleClient.listEvents(this.config.apple.calendarUrls, window),
      this.googleClient.listEvents(this.config.google.calendarIds, window),
    ]);

    for (const mapping of this.config.mappings) {
      await this.syncCalendarPair(mapping, appleEvents, googleEvents, state);
    }

    saveState(state);
  }

  private async syncCalendarPair(
    mapping: CalendarMapping,
    appleEvents: CalendarEvent[],
    googleEvents: CalendarEvent[],
    state: SyncState,
  ) {
    if (!state[mapping.id]) state[mapping.id] = {};
    const mappingState = state[mapping.id];

    const appleByUid = new Map<string, CalendarEvent>();
    const googleByUid = new Map<string, CalendarEvent>();

    const appleForCal = appleEvents.filter((ev) => ev.calendarId === mapping.appleCalendarUrl);
    const googleForCal = googleEvents.filter((ev) => ev.calendarId === mapping.googleCalendarId);

    appleForCal.forEach((ev) => appleByUid.set(ev.uid, ev));
    googleForCal.forEach((ev) => googleByUid.set(ev.uid, ev));

    const allUids = new Set<string>([...appleByUid.keys(), ...googleByUid.keys()]);

    for (const uid of allUids) {
      const appleEvent = appleByUid.get(uid);
      const googleEvent = googleByUid.get(uid);
      const prev = mappingState[uid];

      if (appleEvent && googleEvent) {
        await this.resolveConflict(mapping, appleEvent, googleEvent);
        const hash = computeSignature(appleEvent);
        mappingState[uid] = {
          appleHash: hash,
          googleHash: hash,
          appleUrl: appleEvent.raw?.url,
          googleId: googleEvent.raw?.id,
          appleMtime: appleEvent.lastModified.getTime(),
          googleMtime: googleEvent.lastModified.getTime(),
          appleSeenAt: Date.now(),
          googleSeenAt: Date.now(),
          updatedAt: Date.now(),
        };
        continue;
      }

      if (appleEvent && !googleEvent) {
        const appleHash = computeSignature(appleEvent);
        const existedOnGoogle = prev?.googleHash;
        const googleSeenAt = prev?.googleSeenAt || 0;

        if (existedOnGoogle && appleEvent.lastModified.getTime() <= googleSeenAt) {
          await this.deleteAppleEvent(mapping, appleEvent);
          mappingState[uid] = {
            appleHash: null,
            googleHash: null,
            appleMtime: appleEvent.lastModified.getTime(),
            googleMtime: prev?.googleMtime || null,
            appleSeenAt: Date.now(),
            googleSeenAt,
            updatedAt: Date.now(),
          };
        } else {
          await this.copyAppleToGoogle(mapping, appleEvent);
          mappingState[uid] = {
            appleHash: appleHash,
            googleHash: appleHash,
            appleUrl: appleEvent.raw?.url,
            googleId: undefined,
            appleMtime: appleEvent.lastModified.getTime(),
            googleMtime: appleEvent.lastModified.getTime(),
            appleSeenAt: Date.now(),
            googleSeenAt: Date.now(),
            updatedAt: Date.now(),
          };
        }
        continue;
      }

      if (!appleEvent && googleEvent) {
        const googleHash = computeSignature(googleEvent);
        const existedOnApple = prev?.appleHash;
        const appleSeenAt = prev?.appleSeenAt || 0;

        if (existedOnApple && googleEvent.lastModified.getTime() <= appleSeenAt) {
          await this.deleteGoogleEvent(mapping, googleEvent, prev);
          mappingState[uid] = {
            appleHash: null,
            googleHash: null,
            appleMtime: prev?.appleMtime || null,
            googleMtime: googleEvent.lastModified.getTime(),
            appleSeenAt,
            googleSeenAt: Date.now(),
            updatedAt: Date.now(),
          };
        } else {
          await this.copyGoogleToApple(mapping, googleEvent);
          mappingState[uid] = {
            appleHash: googleHash,
            googleHash: googleHash,
            appleUrl: undefined,
            googleId: googleEvent.raw?.id,
            appleMtime: googleEvent.lastModified.getTime(),
            googleMtime: googleEvent.lastModified.getTime(),
            appleSeenAt: Date.now(),
            googleSeenAt: Date.now(),
            updatedAt: Date.now(),
          };
        }
      }
    }
  }

  private async resolveConflict(
    mapping: CalendarMapping,
    appleEvent: CalendarEvent,
    googleEvent: CalendarEvent,
  ) {
    if (eventsEqual(appleEvent, googleEvent)) {
      this.logger.debug({ uid: appleEvent.uid, mapping: mapping.id }, 'Events already in sync, skipping');
      return;
    }

    const winner = pickWinner(appleEvent, googleEvent);
    if (winner === 'apple') {
      await this.copyAppleToGoogle(mapping, appleEvent, googleEvent.raw);
    } else {
      await this.copyGoogleToApple(mapping, googleEvent, appleEvent.raw);
    }
  }

  private async copyAppleToGoogle(
    mapping: CalendarMapping,
    source: CalendarEvent,
    targetRaw?: CalendarEvent['raw'],
  ) {
    const payload: CalendarEvent = {
      ...source,
      provider: 'google',
      calendarId: mapping.googleCalendarId,
      raw: targetRaw,
      syncHash: source.syncHash || computeSignature(source),
    };

    try {
      await this.googleClient.upsertEvent(payload);
      this.logger.info({ uid: payload.uid, mapping: mapping.id }, 'Apple -> Google sync applied');
    } catch (err) {
      this.logger.error({ err, uid: payload.uid, mapping: mapping.id }, 'Failed to sync Apple -> Google');
    }
  }

  private async copyGoogleToApple(
    mapping: CalendarMapping,
    source: CalendarEvent,
    targetRaw?: CalendarEvent['raw'],
  ) {
    const payload: CalendarEvent = {
      ...source,
      provider: 'apple',
      calendarId: mapping.appleCalendarUrl,
      raw: targetRaw,
      syncHash: source.syncHash || computeSignature(source),
    };

    try {
      await this.appleClient.upsertEvent(payload);
      this.logger.info({ uid: payload.uid, mapping: mapping.id }, 'Google -> Apple sync applied');
    } catch (err) {
      this.logger.error({ err, uid: payload.uid, mapping: mapping.id }, 'Failed to sync Google -> Apple');
    }
  }

  private async deleteAppleEvent(mapping: CalendarMapping, event: CalendarEvent) {
    if (!event.raw?.url) {
      this.logger.warn({ uid: event.uid, mapping: mapping.id }, 'Cannot delete Apple event without URL');
      return;
    }
    try {
      await this.appleClient.deleteEvent(mapping.appleCalendarUrl, event.raw.url, event.raw.etag);
      this.logger.info({ uid: event.uid, mapping: mapping.id }, 'Deleted Apple event (missing on Google)');
    } catch (err) {
      this.logger.error({ err, uid: event.uid, mapping: mapping.id }, 'Failed to delete Apple event');
    }
  }

  private async deleteGoogleEvent(mapping: CalendarMapping, event: CalendarEvent, prev?: SyncRecord) {
    const eventId = event.raw?.id || prev?.googleId;
    if (!eventId) {
      this.logger.warn({ uid: event.uid, mapping: mapping.id }, 'Cannot delete Google event without id');
      return;
    }
    try {
      await this.googleClient.deleteEvent(mapping.googleCalendarId, eventId);
      this.logger.info({ uid: event.uid, mapping: mapping.id }, 'Deleted Google event (missing on Apple)');
    } catch (err) {
      this.logger.error({ err, uid: event.uid, mapping: mapping.id }, 'Failed to delete Google event');
    }
  }
}

export function pickWinner(appleEvent: CalendarEvent, googleEvent: CalendarEvent): 'apple' | 'google' {
  const appleUpdated = appleEvent.lastModified?.getTime() || 0;
  const googleUpdated = googleEvent.lastModified?.getTime() || 0;
  if (appleUpdated === googleUpdated) return 'apple';
  return appleUpdated > googleUpdated ? 'apple' : 'google';
}

export function buildWindow(days: number): SyncWindow {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  return { start, end };
}

export function eventsEqual(a: CalendarEvent, b: CalendarEvent): boolean {
  const sigA = a.syncHash || computeSignature(a);
  const sigB = b.syncHash || computeSignature(b);
  return sigA === sigB;
}

export function computeSignature(ev: CalendarEvent): string {
  const payload = {
    title: ev.title || '',
    description: ev.description || '',
    location: ev.location || '',
    start: normalizeTime(ev.start, ev.allDay),
    end: normalizeTime(ev.end, ev.allDay),
    allDay: ev.allDay,
    categories: ev.categories ? [...ev.categories].map((c) => c.toLowerCase()).sort() : [],
    color: ev.color?.toLowerCase() || '',
  };

  const json = JSON.stringify(payload);
  return crypto.createHash('sha1').update(json).digest('hex');
}

function normalizeTime(date: Date, allDay: boolean): string | number {
  if (allDay) {
    return date.toISOString().slice(0, 10);
  }
  return date.getTime();
}
