// The only module that owns the SQLite connection. If better-sqlite3
// prebuilds ever fail on this machine, swap the import for node:sqlite here.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY_ROOT, SERVER_ROOT, ensureLibraryDirs } from '../config';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  ensureLibraryDirs();
  db = new Database(path.join(LIBRARY_ROOT, 'photo-gen.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

function migrate(db: Database.Database): void {
  const dir = path.join(SERVER_ROOT, 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  const current = db.pragma('user_version', { simple: true }) as number;
  for (const file of files) {
    const version = parseInt(file, 10);
    if (version <= current) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
    console.log(`[db] applied migration ${file}`);
  }
}
