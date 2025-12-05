import { calendar_v3, google } from 'googleapis';
import { Logger } from 'pino';
import { AppConfig } from '../config';
import { CalendarEvent, SyncWindow } from '../types';

type ColorMaps = {
  byId: Map<string, string>;
  byHex: Map<string, string>;
};

export class GoogleCalendarClient {
  public readonly provider = 'google';
  private calendar: calendar_v3.Calendar;
  private colors?: ColorMaps;

  constructor(
    private readonly config: AppConfig['google'],
    private readonly timezone: string,
    private readonly logger: Logger,
  ) {
    const auth = new google.auth.JWT({
      email: config.serviceAccountEmail,
      key: config.serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  async init() {
    this.colors = await this.loadColors();
  }

  private async ensureColors(): Promise<ColorMaps> {
    if (!this.colors) {
      this.colors = await this.loadColors();
    }
    return this.colors;
  }

  private async loadColors(): Promise<ColorMaps> {
    try {
      const res = await this.calendar.colors.get();
      const eventColors = res.data.event || {};
      const byId = new Map<string, string>();
      const byHex = new Map<string, string>();
      Object.entries(eventColors).forEach(([id, value]) => {
        const hex = (value.background || value.foreground || '').toLowerCase();
        if (hex) {
          byId.set(id, hex);
          if (!byHex.has(hex)) {
            byHex.set(hex, id);
          }
        }
      });
      return { byId, byHex };
    } catch (err) {
      this.logger.warn({ err }, 'Unable to load Google Calendar color definitions');
      return { byId: new Map(), byHex: new Map() };
    }
  }

  async listEvents(calendarIds: string[], window: SyncWindow): Promise<CalendarEvent[]> {
    const timeMin = window.start.toISOString();
    const timeMax = window.end.toISOString();
    const events: CalendarEvent[] = [];

    await Promise.all(
      calendarIds.map(async (calendarId) => {
        try {
          const res = await this.calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            showDeleted: false,
            maxResults: 2500,
            orderBy: 'updated',
          });
          const items = res.data.items || [];
          items.forEach((item) => events.push(this.toCalendarEvent(item, calendarId)));
        } catch (err) {
          this.logger.error({ err, calendarId }, 'Failed to fetch Google events');
        }
      }),
    );

    return events;
  }

  private toCalendarEvent(event: calendar_v3.Schema$Event, calendarId: string): CalendarEvent {
    const { start, end } = normalizeGoogleDate(event);
    const updated = event.updated || event.created || new Date().toISOString();
    const categories = parseCategories(event.extendedProperties?.private?.['x-categories']);
    const color = this.extractColor(event);
    const srcUid = (event.extendedProperties?.private?.['x-src-uid'] as string | undefined) || undefined;
    const srcUpdated =
      (event.extendedProperties?.private?.['x-src-updated'] as string | undefined) || updated;
    const syncHash = (event.extendedProperties?.private?.['x-sync-hash'] as string | undefined) || undefined;
    const lastModified = new Date(srcUpdated);
    const uid = srcUid || event.iCalUID || event.id || `google-${updated}`;

    return {
      uid,
      provider: 'google',
      calendarId,
      title: event.summary || '',
      description: event.description || undefined,
      location: event.location || undefined,
      start,
      end,
      allDay: Boolean(event.start?.date),
      lastModified,
      url: event.htmlLink || undefined,
      categories,
      color: color || undefined,
      syncHash,
      raw: { id: event.id || undefined },
    };
  }

  private extractColor(event: calendar_v3.Schema$Event): string | undefined {
    const privateColor = event.extendedProperties?.private?.['x-color'];
    if (privateColor) return privateColor;

    if (event.colorId && this.colors?.byId.has(event.colorId)) {
      return this.colors.byId.get(event.colorId);
    }
    return undefined;
  }

  async upsertEvent(event: CalendarEvent): Promise<void> {
    const body = await this.toGoogleEvent(event);
    const calendarId = event.calendarId;
    const eventId = event.raw?.id;

    if (eventId) {
      await this.calendar.events.update({
        calendarId,
        eventId,
        requestBody: body,
        supportsAttachments: true,
      });
    } else {
      await this.calendar.events.insert({
        calendarId,
        requestBody: body,
        supportsAttachments: true,
      });
    }
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.calendar.events.delete({
      calendarId,
      eventId,
    });
  }

  private async toGoogleEvent(event: CalendarEvent): Promise<calendar_v3.Schema$Event> {
    const colors = await this.ensureColors();
    const extendedPrivate: Record<string, string> = {};

    extendedPrivate['x-src-uid'] = event.uid;
    extendedPrivate['x-src-updated'] = event.lastModified.toISOString();
    if (event.syncHash) extendedPrivate['x-sync-hash'] = event.syncHash;
    if (event.categories?.length) {
      extendedPrivate['x-categories'] = JSON.stringify(event.categories);
    }
    if (event.color) {
      extendedPrivate['x-color'] = event.color;
    }

    const body: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description,
      location: event.location,
      iCalUID: event.uid,
      start: event.allDay
        ? { date: formatDateOnly(event.start) }
        : { dateTime: event.start.toISOString(), timeZone: this.timezone },
      end: event.allDay
        ? { date: formatDateOnly(event.end) }
        : { dateTime: event.end.toISOString(), timeZone: this.timezone },
      extendedProperties: Object.keys(extendedPrivate).length ? { private: extendedPrivate } : undefined,
      status: 'confirmed',
      source: event.url ? { url: event.url, title: 'Synced' } : undefined,
      transparency: event.allDay ? 'transparent' : 'opaque',
    };

    if (event.color) {
      const colorId = colors.byHex.get(event.color.toLowerCase());
      if (colorId) {
        body.colorId = colorId;
      }
    }

    return body;
  }
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseCategories(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v));
    }
  } catch {
    // ignore
  }
  return undefined;
}

function normalizeGoogleDate(event: calendar_v3.Schema$Event): { start: Date; end: Date } {
  const startStr = event.start?.dateTime || (event.start?.date ? `${event.start.date}T00:00:00Z` : undefined);
  const endStr = event.end?.dateTime || (event.end?.date ? `${event.end.date}T00:00:00Z` : undefined);
  const nowIso = new Date().toISOString();
  return {
    start: new Date(startStr || nowIso),
    end: new Date(endStr || startStr || nowIso),
  };
}
