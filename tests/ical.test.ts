import { describe, expect, it } from 'vitest';
import { eventToICS, parseIcsToEvents } from '../src/utils/ical';
import { CalendarEvent } from '../src/types';

describe('ICAL conversion', () => {
  it('roundtrips basic fields and categories', () => {
    const source: CalendarEvent = {
      uid: 'abc-123',
      provider: 'apple',
      calendarId: 'cal-1',
      title: 'Sync Meeting',
      description: 'Discuss sync edge cases',
      location: 'Online',
      start: new Date('2024-02-01T00:00:00Z'),
      end: new Date('2024-02-02T00:00:00Z'),
      allDay: true,
      lastModified: new Date('2024-01-15T12:00:00Z'),
      categories: ['engineering', 'sync'],
      color: '#ff0000',
      url: 'https://example.com/event',
    };

    const ics = eventToICS(source);
    const [parsed] = parseIcsToEvents(ics, source.calendarId);

    expect(parsed.title).toBe(source.title);
    expect(parsed.description).toBe(source.description);
    expect(parsed.allDay).toBe(true);
    expect(parsed.categories).toEqual(source.categories);
    expect(parsed.color).toBe(source.color);
    expect(parsed.url).toBe(source.url);
    expect(parsed.start.toISOString().slice(0, 10)).toBe('2024-02-01');
  });
});
