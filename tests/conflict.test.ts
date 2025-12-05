import { describe, expect, it } from 'vitest';
import { buildWindow, pickWinner } from '../src/sync/syncService';
import { CalendarEvent } from '../src/types';

function makeEvent(lastModified: string): CalendarEvent {
  return {
    uid: '1',
    provider: 'apple',
    calendarId: 'cal',
    title: 'test',
    start: new Date('2024-01-01T00:00:00Z'),
    end: new Date('2024-01-01T01:00:00Z'),
    allDay: false,
    lastModified: new Date(lastModified),
  };
}

describe('pickWinner', () => {
  it('prefers the most recently modified event', () => {
    const apple = makeEvent('2024-01-02T00:00:00Z');
    const google = makeEvent('2024-01-01T00:00:00Z');
    google.provider = 'google';

    expect(pickWinner(apple, google)).toBe('apple');
  });

  it('prefers google when it is newer', () => {
    const apple = makeEvent('2024-01-01T00:00:00Z');
    const google = makeEvent('2024-01-03T00:00:00Z');
    google.provider = 'google';

    expect(pickWinner(apple, google)).toBe('google');
  });

  it('falls back to apple when timestamps tie', () => {
    const apple = makeEvent('2024-01-02T00:00:00Z');
    const google = makeEvent('2024-01-02T00:00:00Z');
    google.provider = 'google';

    expect(pickWinner(apple, google)).toBe('apple');
  });
});

describe('buildWindow', () => {
  it('expands window by days on both sides', () => {
    const days = 10;
    const before = new Date();
    const window = buildWindow(days);
    const after = new Date();

    expect(window.start.getTime()).toBeLessThanOrEqual(before.getTime() - days * 24 * 60 * 60 * 1000 + 5000);
    expect(window.end.getTime()).toBeGreaterThanOrEqual(after.getTime() + (days - 1) * 24 * 60 * 60 * 1000 - 5000);
  });
});
