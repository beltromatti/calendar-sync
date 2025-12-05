import ICAL from 'ical.js';
import { CalendarEvent } from '../types';

export function parseIcsToEvents(
  icsData: string,
  calendarId: string,
  raw?: { url?: string; etag?: string },
): CalendarEvent[] {
  const jcalData = ICAL.parse(icsData);
  const vcalendar = new ICAL.Component(jcalData);
  const vevents = vcalendar.getAllSubcomponents('vevent');

  return vevents.map((component) => {
    const event = new ICAL.Event(component);
    const sourceUid = component.getFirstPropertyValue('x-src-uid') as string | undefined;
    const sourceUpdated = component.getFirstPropertyValue('x-src-updated') as string | undefined;
    const syncHash = component.getFirstPropertyValue('x-sync-hash') as string | undefined;
    const uid = sourceUid || event.uid;
    const start = event.startDate.toJSDate();
    const end = event.endDate.toJSDate();
    const allDay = event.startDate.isDate;
    const lastModifiedProp = component.getFirstPropertyValue('last-modified') as ICAL.Time | undefined;
    const lastModifiedFromProp = lastModifiedProp ? lastModifiedProp.toJSDate() : undefined;
    const lastModified = sourceUpdated ? new Date(sourceUpdated) : lastModifiedFromProp || new Date();
    const categoriesProp = component.getFirstProperty('categories');
    const categoriesValues = categoriesProp ? categoriesProp.getValues() : undefined;
    const categories = categoriesValues
      ? (Array.isArray(categoriesValues) ? categoriesValues : [categoriesValues])
          .flatMap((c) => String(c).split(','))
          .map((c) => c.trim())
          .filter(Boolean)
      : undefined;
    const urlVal = component.getFirstPropertyValue('url') as string | undefined;
    const color = (component.getFirstPropertyValue('color') as string | undefined) || undefined;

    return {
      uid,
      provider: 'apple',
      calendarId,
      title: event.summary || '',
      description: event.description || undefined,
      location: event.location || undefined,
      start,
      end,
      allDay,
      lastModified,
      url: urlVal,
      categories,
      color,
      syncHash,
      raw,
    };
  });
}

export function eventToICS(event: CalendarEvent): string {
  const vcalendar = new ICAL.Component(['vcalendar', [], []]);
  vcalendar.addPropertyWithValue('prodid', '-//Calendar Sync//EN');
  vcalendar.addPropertyWithValue('version', '2.0');

  const vevent = new ICAL.Component('vevent');
  const icalEvent = new ICAL.Event(vevent);

  icalEvent.uid = event.uid;
  icalEvent.summary = event.title;
  icalEvent.description = event.description || '';
  icalEvent.location = event.location || '';
  const startTime = ICAL.Time.fromJSDate(event.start);
  const endTime = ICAL.Time.fromJSDate(event.end);
  if (event.allDay) {
    startTime.isDate = true;
    endTime.isDate = true;
  }
  icalEvent.startDate = startTime;
  icalEvent.endDate = endTime;
  const lm = event.lastModified || new Date();
  vevent.updatePropertyWithValue('last-modified', ICAL.Time.fromJSDate(lm));
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date()));
  vevent.updatePropertyWithValue('x-src-uid', event.uid);
  vevent.updatePropertyWithValue('x-src-updated', lm.toISOString());
  if (event.syncHash) vevent.updatePropertyWithValue('x-sync-hash', event.syncHash);
  if (event.url) vevent.updatePropertyWithValue('url', event.url);
  if (event.categories?.length) {
    vevent.addPropertyWithValue('categories', event.categories.join(','));
  }
  if (event.color) {
    vevent.addPropertyWithValue('color', event.color);
  }

  vcalendar.addSubcomponent(vevent);
  return vcalendar.toString();
}
