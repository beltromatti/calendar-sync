import { createDAVClient } from 'tsdav';
import { Logger } from 'pino';
import { AppConfig } from '../config';
import { CalendarEvent, SyncWindow } from '../types';
import { eventToICS, parseIcsToEvents } from '../utils/ical';

type DavClientInstance = Awaited<ReturnType<typeof createDAVClient>>;

export class AppleCalDAVClient {
  public readonly provider = 'apple';
  private client?: DavClientInstance;

  constructor(private readonly config: AppConfig['apple'], private readonly logger: Logger) {}

  async init() {
    this.client = await createDAVClient({
      serverUrl: this.config.serverUrl,
      credentials: {
        username: this.config.username,
        password: this.config.password,
      },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
  }

  async deleteEvent(calendarId: string, url: string, etag?: string) {
    const client = this.ensureClient();
    await client.deleteCalendarObject({
      calendarObject: {
        url,
        etag,
      },
    });
  }

  private ensureClient(): DavClientInstance {
    if (!this.client) {
      throw new Error('Apple CalDAV client not initialized');
    }
    return this.client;
  }

  async listEvents(calendarUrls: string[], window: SyncWindow): Promise<CalendarEvent[]> {
    const client = this.ensureClient();
    const timeRange = { start: window.start.toISOString(), end: window.end.toISOString() };
    const allEvents: CalendarEvent[] = [];

    await Promise.all(
      calendarUrls.map(async (calendarUrl) => {
        try {
          const calendar = { url: calendarUrl };
          const objects = await client.fetchCalendarObjects({ calendar, timeRange });
          const events = objects.flatMap((obj) =>
            parseIcsToEvents(String(obj.data || ''), calendarUrl, { url: obj.url, etag: obj.etag }),
          );
          allEvents.push(...events);
        } catch (err) {
          this.logger.error({ err, calendarUrl }, 'Failed to fetch Apple CalDAV events');
        }
      }),
    );

    return allEvents;
  }

  async upsertEvent(event: CalendarEvent): Promise<void> {
    const client = this.ensureClient();
    const calendar = { url: event.calendarId };
    const data = eventToICS(event);

    if (event.raw?.url) {
      await client.updateCalendarObject({
        calendarObject: {
          url: event.raw.url,
          data,
          etag: event.raw.etag,
        },
      });
    } else {
      await client.createCalendarObject({
        calendar,
        filename: `${event.uid}.ics`,
        iCalString: data,
      });
    }
  }
}
