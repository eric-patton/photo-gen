import { DEFAULT_SETTINGS, type Settings } from '@photo-gen/shared';
import { getDb } from '../db/db';

export function getSettings(): Settings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const stored: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.key in DEFAULT_SETTINGS) stored[row.key] = JSON.parse(row.value);
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function patchSettings(patch: Partial<Settings>): Settings {
  const db = getDb();
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      upsert.run(key, JSON.stringify(value));
    }
  })();
  return getSettings();
}
