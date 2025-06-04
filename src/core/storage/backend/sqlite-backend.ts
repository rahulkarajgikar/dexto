import Database = require('better-sqlite3');
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import type { DatabaseBackend } from './database-backend.js';
import type { BackendConfig } from './types.js';

export interface SQLiteBackendConfig extends BackendConfig {
    type: 'sqlite';
    path: string;
    options?: {
        timeout?: number;
        verbose?: boolean;
    };
}

/**
 * SQLite storage backend for local development and production.
 * Implements the DatabaseBackend interface with proper schema and connection handling.
 */
export class SQLiteBackend implements DatabaseBackend {
    private db: Database.Database | null = null;
    private connected = false;

    constructor(private config: SQLiteBackendConfig) {}

    async connect(): Promise<void> {
        if (this.connected) return;

        // Ensure directory exists
        const dir = dirname(this.config.path);
        mkdirSync(dir, { recursive: true });

        // Open database
        this.db = new Database(this.config.path);
        this.db.pragma('journal_mode = WAL'); // Better performance for concurrent access
        this.db.pragma('synchronous = NORMAL'); // Balance between safety and performance

        // Create tables
        this.createTables();
        this.connected = true;
    }

    async disconnect(): Promise<void> {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        this.connected = false;
    }

    isConnected(): boolean {
        return this.connected && this.db !== null;
    }

    getBackendType(): string {
        return 'sqlite';
    }

    // Core operations
    async get<T>(key: string): Promise<T | undefined> {
        this.checkConnection();
        const row = this.db!.prepare('SELECT value FROM kv WHERE key = ?').get(key) as
            | { value: string }
            | undefined;
        return row ? JSON.parse(row.value) : undefined;
    }

    async set<T>(key: string, value: T): Promise<void> {
        this.checkConnection();
        const serialized = JSON.stringify(value);
        this.db!.prepare('INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)').run(
            key,
            serialized,
            Date.now()
        );
    }

    async delete(key: string): Promise<void> {
        this.checkConnection();
        this.db!.prepare('DELETE FROM kv WHERE key = ?').run(key);
        this.db!.prepare('DELETE FROM lists WHERE key = ?').run(key);
    }

    // List operations
    async list(prefix: string): Promise<string[]> {
        this.checkConnection();

        // Get keys from both tables
        const kvKeys = this.db!.prepare('SELECT key FROM kv WHERE key LIKE ?').all(
            `${prefix}%`
        ) as { key: string }[];
        const listKeys = this.db!.prepare('SELECT DISTINCT key FROM lists WHERE key LIKE ?').all(
            `${prefix}%`
        ) as { key: string }[];

        const allKeys = new Set([
            ...kvKeys.map((row) => row.key),
            ...listKeys.map((row) => row.key),
        ]);

        return Array.from(allKeys).sort();
    }

    async append<T>(key: string, item: T): Promise<void> {
        this.checkConnection();
        const serialized = JSON.stringify(item);
        this.db!.prepare('INSERT INTO lists (key, item, created_at) VALUES (?, ?, ?)').run(
            key,
            serialized,
            Date.now()
        );
    }

    async getRange<T>(key: string, start: number, count: number): Promise<T[]> {
        this.checkConnection();
        const rows = this.db!.prepare(
            'SELECT item FROM lists WHERE key = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).all(key, count, start) as { item: string }[];

        return rows.map((row) => JSON.parse(row.item));
    }

    // Schema management
    private createTables(): void {
        // Key-value store for settings, user data, etc.
        this.db!.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

        // List storage for messages, activities, etc.
        this.db!.exec(`
      CREATE TABLE IF NOT EXISTS lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        item TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

        // Indexes for performance
        this.db!.exec('CREATE INDEX IF NOT EXISTS idx_kv_key ON kv(key)');
        this.db!.exec('CREATE INDEX IF NOT EXISTS idx_lists_key ON lists(key)');
        this.db!.exec('CREATE INDEX IF NOT EXISTS idx_lists_created_at ON lists(key, created_at)');
    }

    private checkConnection(): void {
        if (!this.connected || !this.db) {
            throw new Error('SQLiteBackend not connected');
        }
    }

    // Maintenance operations
    async vacuum(): Promise<void> {
        this.checkConnection();
        this.db!.exec('VACUUM');
    }

    async getStats(): Promise<{
        kvCount: number;
        listCount: number;
        dbSize: number;
    }> {
        this.checkConnection();

        const kvCount = this.db!.prepare('SELECT COUNT(*) as count FROM kv').get() as {
            count: number;
        };
        const listCount = this.db!.prepare('SELECT COUNT(*) as count FROM lists').get() as {
            count: number;
        };
        const dbSize = this.db!.prepare(
            'SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()'
        ).get() as { size: number };

        return {
            kvCount: kvCount.count,
            listCount: listCount.count,
            dbSize: dbSize.size,
        };
    }
}
