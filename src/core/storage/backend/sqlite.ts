import {
    StorageBackend,
    StorageBackendConfig,
    StorageContext,
    StorageError,
    StorageConnectionError,
} from './types.js';
import { StoragePathResolver } from '../path-resolver.js';
import { FileStorageBackend } from './file.js';
import { logger } from '../../logger/index.js';

/**
 * SQLite storage backend.
 * For now, this is a placeholder that falls back to file storage.
 * TODO: Implement actual SQLite backend using better-sqlite3 or similar.
 */
export class SQLiteStorageBackend implements StorageBackend {
    private backend: StorageBackend;
    private readonly config: StorageBackendConfig;
    private readonly context?: StorageContext;

    constructor(config: StorageBackendConfig, context?: StorageContext) {
        this.config = config;
        this.context = context;

        // For now, use file backend as fallback
        // TODO: Implement actual SQLite backend
        logger.warn('SQLite backend not fully implemented yet, falling back to file storage');
        this.backend = new FileStorageBackend({ ...config, type: 'file' }, context);
    }

    async connect(): Promise<void> {
        await this.backend.connect();
    }

    async disconnect(): Promise<void> {
        await this.backend.disconnect();
    }

    isConnected(): boolean {
        return this.backend.isConnected();
    }

    getBackendType(): string {
        return 'sqlite';
    }

    getBackendInfo(): Record<string, any> {
        return {
            type: 'sqlite',
            implementation: 'file-fallback',
            ...this.backend.getBackendInfo(),
        };
    }

    // Delegate all operations to the file backend for now
    async get<T>(key: string): Promise<T | undefined> {
        return this.backend.get<T>(key);
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        return this.backend.set<T>(key, value, ttl);
    }

    async delete(key: string): Promise<void> {
        return this.backend.delete(key);
    }

    async has(key: string): Promise<boolean> {
        return this.backend.has(key);
    }

    async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
        return this.backend.mget<T>(keys);
    }

    async mset<T>(entries: [string, T][]): Promise<void> {
        return this.backend.mset<T>(entries);
    }

    async keys(pattern: string): Promise<string[]> {
        return this.backend.keys(pattern);
    }

    async deletePattern(pattern: string): Promise<void> {
        return this.backend.deletePattern(pattern);
    }

    async lpush<T>(key: string, value: T): Promise<void> {
        return this.backend.lpush<T>(key, value);
    }

    async lrange<T>(key: string, start: number, end: number): Promise<T[]> {
        return this.backend.lrange<T>(key, start, end);
    }

    async ltrim(key: string, start: number, end: number): Promise<void> {
        return this.backend.ltrim(key, start, end);
    }

    async llen(key: string): Promise<number> {
        return this.backend.llen(key);
    }

    async incr(key: string, by?: number): Promise<number> {
        return this.backend.incr(key, by);
    }

    async decr(key: string, by?: number): Promise<number> {
        return this.backend.decr(key, by);
    }
}

// TODO: Implement actual SQLite backend
// This would use better-sqlite3 or similar and store data in SQLite tables:
// - keys table: (key, value, expires_at, created_at, updated_at)
// - lists table: (key, items, expires_at, created_at, updated_at)
// - counters table: (key, value)
