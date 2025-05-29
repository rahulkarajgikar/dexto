import type {
    StorageProvider,
    CollectionStorageProvider,
    SessionStorageProvider,
    StorageContext,
} from '../types.js';

/**
 * In-memory storage provider with optional TTL support
 */
export class MemoryStorageProvider<T = any> implements StorageProvider<T> {
    private store = new Map<string, { value: T; expires?: number }>();
    private cleanupInterval?: NodeJS.Timeout;

    constructor(
        private config: any,
        private context: StorageContext,
        private namespace: string
    ) {
        const options = config || {};
        if (options.ttl) {
            // Clean up expired entries every minute
            this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
        }
    }

    async get(key: string): Promise<T | undefined> {
        const entry = this.store.get(key);
        if (!entry) return undefined;

        if (entry.expires && Date.now() > entry.expires) {
            this.store.delete(key);
            return undefined;
        }

        return entry.value;
    }

    async set(key: string, value: T, ttl?: number): Promise<void> {
        // Enforce max size if specified
        const maxSize = this.config?.maxSize;
        if (maxSize && this.store.size >= maxSize) {
            // Remove oldest entry (simple LRU)
            const firstKey = this.store.keys().next().value;
            if (firstKey) {
                this.store.delete(firstKey);
            }
        }

        const defaultTTL = this.config?.ttl;
        const effectiveTTL = ttl ?? defaultTTL;
        const expires = effectiveTTL ? Date.now() + effectiveTTL : undefined;
        this.store.set(key, { value, expires });
    }

    async delete(key: string): Promise<boolean> {
        return this.store.delete(key);
    }

    async has(key: string): Promise<boolean> {
        const entry = this.store.get(key);
        if (!entry) return false;

        if (entry.expires && Date.now() > entry.expires) {
            this.store.delete(key);
            return false;
        }

        return true;
    }

    async keys(): Promise<string[]> {
        this.cleanup();
        return Array.from(this.store.keys());
    }

    async clear(): Promise<void> {
        this.store.clear();
    }

    async close(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.expires && now > entry.expires) {
                this.store.delete(key);
            }
        }
    }
}

/**
 * In-memory collection storage provider
 */
export class MemoryCollectionStorageProvider<T = any> implements CollectionStorageProvider<T> {
    private items: T[] = [];

    constructor(
        private options: {
            maxSize?: number;
        } = {}
    ) {}

    async getAll(): Promise<T[]> {
        return [...this.items];
    }

    async add(item: T): Promise<void> {
        // Enforce max size if specified
        if (this.options.maxSize && this.items.length >= this.options.maxSize) {
            this.items.shift(); // Remove oldest item
        }
        this.items.push(item);
    }

    async remove(predicate: (item: T) => boolean): Promise<number> {
        const initialLength = this.items.length;
        this.items = this.items.filter((item) => !predicate(item));
        return initialLength - this.items.length;
    }

    async find(predicate: (item: T) => boolean): Promise<T[]> {
        return this.items.filter(predicate);
    }

    async clear(): Promise<void> {
        this.items = [];
    }

    async count(): Promise<number> {
        return this.items.length;
    }

    async close(): Promise<void> {
        // No cleanup needed for memory
    }
}

/**
 * In-memory session storage provider
 */
export class MemorySessionStorageProvider<T = any> implements SessionStorageProvider<T> {
    private sessions = new Map<string, { data: T; expires?: number }>();
    private cleanupInterval?: NodeJS.Timeout;

    constructor(
        private options: {
            sessionTTL?: number; // TTL in milliseconds
        } = {}
    ) {
        if (options.sessionTTL) {
            // Clean up expired sessions every 5 minutes
            this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
        }
    }

    async getSession(sessionId: string): Promise<T | undefined> {
        const entry = this.sessions.get(sessionId);
        if (!entry) return undefined;

        if (entry.expires && Date.now() > entry.expires) {
            this.sessions.delete(sessionId);
            return undefined;
        }

        return entry.data;
    }

    async setSession(sessionId: string, data: T, ttl?: number): Promise<void> {
        const effectiveTTL = ttl ?? this.options.sessionTTL;
        const expires = effectiveTTL ? Date.now() + effectiveTTL : undefined;
        this.sessions.set(sessionId, { data, expires });
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        return this.sessions.delete(sessionId);
    }

    async hasSession(sessionId: string): Promise<boolean> {
        const entry = this.sessions.get(sessionId);
        if (!entry) return false;

        if (entry.expires && Date.now() > entry.expires) {
            this.sessions.delete(sessionId);
            return false;
        }

        return true;
    }

    async getActiveSessions(): Promise<string[]> {
        this.cleanup();
        return Array.from(this.sessions.keys());
    }

    async cleanupExpired(): Promise<number> {
        const beforeCount = this.sessions.size;
        this.cleanup();
        return beforeCount - this.sessions.size;
    }

    async clear(): Promise<void> {
        this.sessions.clear();
    }

    async close(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [sessionId, entry] of this.sessions.entries()) {
            if (entry.expires && now > entry.expires) {
                this.sessions.delete(sessionId);
            }
        }
    }
}
