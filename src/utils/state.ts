import fs from 'fs';
import path from 'path';

export interface SyncRecord {
  appleHash?: string | null;
  googleHash?: string | null;
  appleUrl?: string | null;
  googleId?: string | null;
  appleMtime?: number | null;
  googleMtime?: number | null;
  appleSeenAt?: number | null;
  googleSeenAt?: number | null;
  updatedAt: number;
}

export interface SyncState {
  [mappingId: string]: {
    [uid: string]: SyncRecord;
  };
}

const STATE_PATH = path.join(process.cwd(), 'data', 'sync-state.json');

export function loadState(): SyncState {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf-8');
    return JSON.parse(raw) as SyncState;
  } catch {
    return {};
  }
}

export function saveState(state: SyncState) {
  const dir = path.dirname(STATE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}
