import { StorageBackend, StorageError } from './types.js';

interface MemoryEntry<T> {
    value: T;
    expiresAt?: number;
}

interface MemoryListEntry<T> {
    items: T[];
    expiresAt?: number;
}

/**
 * In-memory storage backend that stores all data in memory.
 * Data is lost when the process restarts.
 * Includes TTL support with automatic cleanup.
 */
export class MemoryStorageBackend implements StorageBackend {
    private data = new Map<string, MemoryEntry<any>>();
    private lists = new Map<string, MemoryListEntry<any>>();
    private counters = new Map<string, number>();
    private connected = false;
    private cleanupInterval?: NodeJS.Timeout;
    private readonly maxSize: number;

    constructor(options: { maxSize?: number; cleanupIntervalMs?: number } = {}) {
        this.maxSize = options.maxSize || 10000; // Default max 10k entries

        // Start cleanup interval (default every 30 seconds)
        const cleanupIntervalMs = options.cleanupIntervalMs || 30000;
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpired();
        }, cleanupIntervalMs);
    }

    async connect(): Promise<void> {
        this.connected = true;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        this.data.clear();
        this.lists.clear();
        this.counters.clear();
    }

    isConnected(): boolean {
        return this.connected;
    }

    getBackendType(): string {
        return 'memory';
    }

    getBackendInfo(): Record<string, any> {
        return {
            type: 'memory',
            entries: this.data.size,
            lists: this.lists.size,
            counters: this.counters.size,
            maxSize: this.maxSize,
            connected: this.connected,
        };
    }

    // Basic key-value operations
    async get<T>(key: string): Promise<T | undefined> {
        const entry = this.data.get(key);
        if (!entry) return undefined;

        // Check if expired
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.data.delete(key);
            return undefined;
        }

        return entry.value as T;
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        // Check size limit
        if (this.data.size >= this.maxSize && !this.data.has(key)) {
            throw new StorageError(
                `Memory storage limit reached (${this.maxSize} entries)`,
                'SIZE_LIMIT_EXCEEDED'
            );
        }

        const expiresAt = ttl ? Date.now() + ttl : undefined;
        this.data.set(key, { value, expiresAt });
    }

    async delete(key: string): Promise<void> {
        this.data.delete(key);
        this.lists.delete(key);
        this.counters.delete(key);
    }

    async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== undefined;
    }

    // Batch operations
    async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
        return Promise.all(keys.map((key) => this.get<T>(key)));
    }

    async mset<T>(entries: [string, T][]): Promise<void> {
        for (const [key, value] of entries) {
            await this.set(key, value);
        }
    }

    // Pattern operations
    async keys(pattern: string): Promise<string[]> {
        const regex = this.patternToRegex(pattern);
        const result: string[] = [];

        for (const key of this.data.keys()) {
            if (regex.test(key)) {
                // Check if not expired
                const hasValue = await this.has(key);
                if (hasValue) {
                    result.push(key);
                }
            }
        }

        return result;
    }

    async deletePattern(pattern: string): Promise<void> {
        const keys = await this.keys(pattern);
        for (const key of keys) {
            await this.delete(key);
        }
    }

    // List operations
    async lpush<T>(key: string, value: T): Promise<void> {
        let listEntry = this.lists.get(key);
        if (!listEntry) {
            listEntry = { items: [] };
            this.lists.set(key, listEntry);
        }

        // Check if expired
        if (listEntry.expiresAt && Date.now() > listEntry.expiresAt) {
            listEntry.items = [];
            listEntry.expiresAt = undefined;
        }

        listEntry.items.unshift(value);
    }

    async lrange<T>(key: string, start: number, end: number): Promise<T[]> {
        const listEntry = this.lists.get(key);
        if (!listEntry) return [];

        // Check if expired
        if (listEntry.expiresAt && Date.now() > listEntry.expiresAt) {
            this.lists.delete(key);
            return [];
        }

        const items = listEntry.items as T[];

        // Convert negative indices to positive
        const len = items.length;
        const startIdx = start < 0 ? Math.max(0, len + start) : Math.min(start, len);
        const endIdx = end < 0 ? Math.max(0, len + end + 1) : Math.min(end + 1, len);

        return items.slice(startIdx, endIdx);
    }

    async ltrim(key: string, start: number, end: number): Promise<void> {
        const listEntry = this.lists.get(key);
        if (!listEntry) return;

        // Check if expired
        if (listEntry.expiresAt && Date.now() > listEntry.expiresAt) {
            this.lists.delete(key);
            return;
        }

        const items = listEntry.items;
        const len = items.length;
        const startIdx = start < 0 ? Math.max(0, len + start) : Math.min(start, len);
        const endIdx = end < 0 ? Math.max(0, len + end + 1) : Math.min(end + 1, len);

        listEntry.items = items.slice(startIdx, endIdx);
    }

    async llen(key: string): Promise<number> {
        const listEntry = this.lists.get(key);
        if (!listEntry) return 0;

        // Check if expired
        if (listEntry.expiresAt && Date.now() > listEntry.expiresAt) {
            this.lists.delete(key);
            return 0;
        }

        return listEntry.items.length;
    }

    // Atomic operations
    async incr(key: string, by: number = 1): Promise<number> {
        const current = this.counters.get(key) || 0;
        const newValue = current + by;
        this.counters.set(key, newValue);
        return newValue;
    }

    async decr(key: string, by: number = 1): Promise<number> {
        return this.incr(key, -by);
    }

    // Utility methods
    private patternToRegex(pattern: string): RegExp {
        // Convert glob-style pattern to regex
        // * matches any sequence of characters
        // ? matches any single character
        const escaped = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
            .replace(/\*/g, '.*') // * becomes .*
            .replace(/\?/g, '.'); // ? becomes .

        return new RegExp(`^${escaped}$`);
    }

    private cleanupExpired(): void {
        const now = Date.now();

        // Cleanup regular entries
        for (const [key, entry] of this.data.entries()) {
            if (entry.expiresAt && now > entry.expiresAt) {
                this.data.delete(key);
            }
        }

        // Cleanup list entries
        for (const [key, listEntry] of this.lists.entries()) {
            if (listEntry.expiresAt && now > listEntry.expiresAt) {
                this.lists.delete(key);
            }
        }
    }
}
