import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import type { Store, Session, MemoryEntry, MemoryQuery } from '../core/types.js';
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
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT, -- JSON array of numbers
        tags TEXT, -- JSON array
        importance INTEGER,
        timestamp INTEGER NOT NULL,
        context_id TEXT,
        metadata TEXT -- JSON object
      );
    `);

    try {
      await this.db.exec('ALTER TABLE memories ADD COLUMN embedding TEXT');
    } catch {
      // Ignore if column already exists
    }

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
  }

  async createMemory(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<string> {
    if (!this.db) await this.load();

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const timestamp = Date.now();

    await this.db!.run(
      `INSERT INTO memories (id, type, content, embedding, tags, importance, timestamp, context_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      entry.type,
      entry.content,
      entry.embedding ? JSON.stringify(entry.embedding) : null,
      JSON.stringify(entry.tags ?? []),
      entry.importance ?? 0,
      timestamp,
      entry.contextId ?? null,
      JSON.stringify(entry.metadata ?? {})
    );

    return id;
  }

  async searchMemories(query: MemoryQuery): Promise<MemoryEntry[]> {
    if (!this.db) await this.load();

    let sql = 'SELECT * FROM memories WHERE 1=1';
    const params: unknown[] = [];

    if (query.type) {
      sql += ' AND type = ?';
      params.push(query.type);
    }

    if (query.content) {
      sql += ' AND content LIKE ?';
      params.push(`%${query.content}%`);
    }

    // Tag search in JSON array is tricky in standard sqlite without extensions
    // Simple naive check: LIKE '%"tag"%'
    if (query.tags && query.tags.length > 0) {
      for (const tag of query.tags) {
        sql += ' AND tags LIKE ?';
        // Use JSON.stringify to ensure we match the quoted string, avoiding partial matches
        // e.g. "apple" won't match "pineapple"
        const jsonTag = JSON.stringify(tag);
        // We strip the leading/trailing quotes from JSON.stringify because we're inside LIKE %...%
        // Actually, we WANT the quotes to ensure boundary.
        // JSON.stringify("apple") -> "apple"
        // So we search for %"apple"%
        params.push(`%${jsonTag}%`);
      }
    }

    // If query has embedding, we ignore default sort order and limit here,
    // because we need to fetch all candidates to compute similarity in memory
    // unless we combine it with other filters.
    // For now, if embedding is present, fetch ALL candidates matching other criteria
    // then sort by cosine similarity.

    if (!query.embedding) {
      sql += ' ORDER BY timestamp DESC';
      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
      }
    }

    const rows = await this.db!.all(sql, params);

    let entries = rows.map(row => ({
      id: row.id,
      type: row.type as MemoryEntry['type'],
      content: row.content,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      tags: JSON.parse(row.tags || '[]'),
      importance: row.importance,
      timestamp: row.timestamp,
      contextId: row.context_id,
      metadata: JSON.parse(row.metadata || '{}')
    }));

    if (query.embedding && query.embedding.length > 0) {
      entries = entries
        .map(entry => ({
          ...entry,
          similarity: this.cosineSimilarity(query.embedding!, entry.embedding)
        }))
        .filter(e => e.similarity > -2) // Keep all, sort below
        .sort((a, b) => b.similarity - a.similarity);

      if (query.limit) {
        entries = entries.slice(0, query.limit);
      }

      // Strip similarity for return type compatibility, or keep it if we change type
      // MemoryEntry doesn't have similarity, but it's fine to return extended objects usually.
    }

    return entries;
  }

  private cosineSimilarity(a: number[], b?: number[]): number {
    if (!b || a.length !== b.length) return -1;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async removeMemory(id: string): Promise<void> {
    if (!this.db) await this.load();
    await this.db!.run('DELETE FROM memories WHERE id = ?', id);
  }

  async exportMemories(): Promise<MemoryEntry[]> {
    if (!this.db) await this.load();
    const rows = await this.db!.all('SELECT * FROM memories ORDER BY timestamp ASC');
    return rows.map(row => ({
      id: row.id,
      type: row.type as MemoryEntry['type'],
      content: row.content,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      tags: JSON.parse(row.tags || '[]'),
      importance: row.importance,
      timestamp: row.timestamp,
      contextId: row.context_id,
      metadata: JSON.parse(row.metadata || '{}')
    }));
  }

  async consolidateMemories(): Promise<void> {
    if (!this.db) await this.load();
    // Basic consolidation: Prune low importance memories if count > 1000
    // Keep top 1000 by importance + recency
    const countResult = await this.db!.get('SELECT COUNT(*) as count FROM memories');
    if (countResult.count > 1000) {
        // Delete items with importance <= 1, keeping only newest if still needed
        // For simplicity: delete oldest memories with importance < 3
        await this.db!.run('DELETE FROM memories WHERE importance < 3 AND id NOT IN (SELECT id FROM memories ORDER BY timestamp DESC LIMIT 500)');
    }
  }
}
