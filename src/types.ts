export type Provider = 'apple' | 'google';

export interface CalendarEvent {
  uid: string;
  provider: Provider;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  lastModified: Date;
  url?: string;
  categories?: string[];
  color?: string;
  syncHash?: string;
  raw?: {
    id?: string;
    url?: string;
    etag?: string;
  };
}

export interface CalendarMapping {
  id: string;
  appleCalendarUrl: string;
  googleCalendarId: string;
}

export interface SyncWindow {
  start: Date;
  end: Date;
}
