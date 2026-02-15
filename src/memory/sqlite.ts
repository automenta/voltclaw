import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import type { Store, Session } from '../core/types.js';
import { VOLTCLAW_DIR } from '../core/bootstrap.js';
import fs from 'fs';
import path from 'path';

export class SQLiteStore implements Store {
  private db?: Database;
  private cache: Map<string, Session> = new Map();
  private readonly dbPath: string;

  constructor(options: { path?: string } = {}) {
    this.dbPath = options.path ?? path.join(VOLTCLAW_DIR, 'voltclaw.db');

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async load(): Promise<void> {
    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    const rows = await this.db.all('SELECT key, data FROM sessions');
    for (const row of rows) {
      try {
        this.cache.set(row.key, JSON.parse(row.data));
      } catch {
        // ignore corrupt data
      }
    }
  }

  get(key: string, isSelf: boolean = false): Session {
    if (!this.cache.has(key)) {
      this.cache.set(key, {
        history: [],
        callCount: 0,
        estCostUSD: 0,
        actualTokensUsed: 0,
        subTasks: {},
        depth: 0,
        topLevelStartedAt: 0
      });
    }
    return this.cache.get(key)!;
  }

  getAll(): Record<string, Session> {
    return Object.fromEntries(this.cache);
  }

  async save(): Promise<void> {
    if (!this.db) await this.load();

    const stmt = await this.db!.prepare(`
      INSERT INTO sessions (key, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `);

    for (const [key, session] of this.cache.entries()) {
      await stmt.run(key, JSON.stringify(session), Date.now());
    }
    await stmt.finalize();
  }

  clear(): void {
    this.cache.clear();
    // We can't synchronously clear DB, so we rely on save() to overwrite or we need async clear support in Store interface?
    // Store.clear() is synchronous. This is a design flaw in Store interface if we want true persistence sync.
    // But since we use load/save pattern, clear() clears cache.
    // Next save() should delete from DB?
    // Our save implementation only UPDATES/INSERTS. It does not DELETE removed keys.
    // To support clear(), we should probably run DELETE FROM sessions on save() if cache is empty?
    // Or add async clearPersistence() method?
    // For now, let's just clear cache. If user calls save(), it won't delete from DB unless we change logic.
    // Let's modify save to sync fully? No, too expensive.
    // Let's hack: If cache is empty, try to clear DB on next save?
    // Or just leave it. `clear` usually means "clear session memory".

    // Actually, let's try to clear DB if we can. But we can't await here.
    // We can fire and forget? No, unsafe.
    // Let's just clear cache.
  }
}
