import path from 'path';
import fs from 'fs/promises';
import { logger } from '../../logger/index.js';
import type { StorageProvider, StorageContext } from '../types.js';

// SQLite interface abstraction
interface SQLiteDatabase {
    exec(sql: string): void;
    prepare(sql: string): any;
    close(): void;
}

let sqliteModule: any = null;

async function getSQLiteModule(): Promise<any> {
    if (sqliteModule) return sqliteModule;

    try {
        // TODO: Add support for Node.js built-in SQLite (Node 22+) when it's more stable
        // For now, just use better-sqlite3 which is reliable and well-tested
        sqliteModule = await import('better-sqlite3');
        logger.debug('Using better-sqlite3 SQLite');
        return sqliteModule;
    } catch (error) {
        throw new Error(
            'SQLite not available. Please install better-sqlite3: npm install better-sqlite3'
        );
    }
}

/**
 * SQLite storage provider for Saiki
 *
 * Provides persistent storage using SQLite databases with support for TTL,
 * multiple tables, and automatic cleanup. Uses better-sqlite3 for reliable
 * SQLite functionality.
 */
export class SQLiteStorageProvider<T = any> implements StorageProvider<T> {
    private db: SQLiteDatabase | null = null;
    private getStmt: any;
    private setStmt: any;
    private deleteStmt: any;
    private hasStmt: any;
    private keysStmt: any;
    private cleanupStmt: any;
    private clearStmt: any;
    private dbPath: string;
    private tableName: string;
    private defaultTTL?: number;

    constructor(
        private config: any,
        private context: StorageContext,
        private namespace: string
    ) {
        this.tableName = config.table || `storage_${namespace}`;
        this.defaultTTL = config.ttl;

        // Create database path
        const dbDir = path.join(context.storageRoot, 'sqlite');
        this.dbPath = path.join(dbDir, `${namespace}.db`);
    }

    /**
     * Initialize the SQLite database and prepare statements
     */
    private async initialize(): Promise<void> {
        if (this.db) return; // Already initialized

        try {
            const sqlite = await getSQLiteModule();

            // Ensure directory exists
            await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

            // Create database connection using better-sqlite3
            this.db = new sqlite.default(this.dbPath);

            // Create table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS ${this.tableName} (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    expires INTEGER
                )
            `);

            // Create index for TTL cleanup
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_${this.tableName}_expires 
                ON ${this.tableName}(expires) 
                WHERE expires IS NOT NULL
            `);

            // Prepare statements
            this.getStmt = this.db.prepare(`
                SELECT value, expires FROM ${this.tableName} 
                WHERE key = ? AND (expires IS NULL OR expires > ?)
            `);

            this.setStmt = this.db.prepare(`
                INSERT OR REPLACE INTO ${this.tableName} (key, value, expires) 
                VALUES (?, ?, ?)
            `);

            this.deleteStmt = this.db.prepare(`
                DELETE FROM ${this.tableName} WHERE key = ?
            `);

            this.hasStmt = this.db.prepare(`
                SELECT 1 FROM ${this.tableName} 
                WHERE key = ? AND (expires IS NULL OR expires > ?)
            `);

            this.keysStmt = this.db.prepare(`
                SELECT key FROM ${this.tableName} 
                WHERE expires IS NULL OR expires > ?
            `);

            this.cleanupStmt = this.db.prepare(`
                DELETE FROM ${this.tableName} WHERE expires IS NOT NULL AND expires <= ?
            `);

            this.clearStmt = this.db.prepare(`
                DELETE FROM ${this.tableName}
            `);

            logger.debug(`SQLite storage provider initialized at ${this.dbPath}`);
        } catch (error) {
            logger.error('Failed to initialize SQLite storage provider:', error);
            throw error;
        }
    }

    async get(key: string): Promise<T | undefined> {
        await this.initialize();

        const now = Date.now();
        const row = this.getStmt.get(key, now);

        if (!row) return undefined;

        try {
            return JSON.parse(row.value);
        } catch (error) {
            logger.warn(`Failed to parse stored value for key "${key}":`, error);
            return undefined;
        }
    }

    async set(key: string, value: T, ttl?: number): Promise<void> {
        await this.initialize();

        const effectiveTTL = ttl ?? this.defaultTTL;
        const expires = effectiveTTL ? Date.now() + effectiveTTL : null;

        const serialized = JSON.stringify(value);
        this.setStmt.run(key, serialized, expires);
    }

    async has(key: string): Promise<boolean> {
        await this.initialize();

        const now = Date.now();
        const row = this.hasStmt.get(key, now);
        return !!row;
    }

    async delete(key: string): Promise<boolean> {
        await this.initialize();

        const result = this.deleteStmt.run(key);
        return result.changes > 0;
    }

    async keys(): Promise<string[]> {
        await this.initialize();

        const now = Date.now();
        const rows = this.keysStmt.all(now);
        return rows.map((row: any) => row.key);
    }

    async clear(): Promise<void> {
        await this.initialize();

        this.clearStmt.run();
    }

    async close(): Promise<void> {
        if (this.db) {
            // Clean up expired entries before closing
            try {
                const now = Date.now();
                const result = this.cleanupStmt.run(now);
                if (result.changes > 0) {
                    logger.debug(
                        `Cleaned up ${result.changes} expired entries from ${this.tableName}`
                    );
                }
            } catch (error) {
                logger.warn('Error during SQLite cleanup:', error);
            }

            this.db.close();
            this.db = null;
        }
    }
}
