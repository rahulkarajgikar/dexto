import { StorageBackend } from '../backend/types.js';

/**
 * Session-scoped storage pattern.
 * Automatically scopes keys to session ID and provides session lifecycle management.
 * Uses cache backend (Redis/Memory) for performance and automatic cleanup.
 */
export class SessionStore {
    constructor(private backend: StorageBackend) {}

    /**
     * Get a value for a specific session and key
     */
    async get<T>(sessionId: string, key: string): Promise<T | undefined> {
        const scopedKey = this.getScopedKey(sessionId, key);
        return await this.backend.get<T>(scopedKey);
    }

    /**
     * Set a value for a specific session and key with optional TTL
     */
    async set<T>(sessionId: string, key: string, value: T, ttl?: number): Promise<void> {
        const scopedKey = this.getScopedKey(sessionId, key);
        await this.backend.set(scopedKey, value, ttl);
    }

    /**
     * Delete a specific key from a session
     */
    async delete(sessionId: string, key: string): Promise<void> {
        const scopedKey = this.getScopedKey(sessionId, key);
        await this.backend.delete(scopedKey);
    }

    /**
     * Check if a session has a specific key
     */
    async has(sessionId: string, key: string): Promise<boolean> {
        const scopedKey = this.getScopedKey(sessionId, key);
        return await this.backend.has(scopedKey);
    }

    /**
     * Get all keys and values for a session
     */
    async getAll<T>(sessionId: string): Promise<Record<string, T>> {
        const pattern = this.getScopedKey(sessionId, '*');
        const keys = await this.backend.keys(pattern);
        const values = await this.backend.mget<T>(keys);

        const result: Record<string, T> = {};
        keys.forEach((scopedKey, index) => {
            const value = values[index];
            if (value !== undefined) {
                const shortKey = this.unscopeKey(sessionId, scopedKey);
                result[shortKey] = value;
            }
        });

        return result;
    }

    /**
     * Set multiple key-value pairs for a session
     */
    async setMultiple<T>(sessionId: string, data: Record<string, T>, ttl?: number): Promise<void> {
        const entries: [string, T][] = Object.entries(data).map(([key, value]) => [
            this.getScopedKey(sessionId, key),
            value,
        ]);

        await this.backend.mset(entries);

        // If TTL is specified, we need to set it for each key individually
        // since mset doesn't support TTL
        if (ttl) {
            const promises = Object.keys(data).map((key) =>
                this.backend.set(this.getScopedKey(sessionId, key), data[key], ttl)
            );
            await Promise.all(promises);
        }
    }

    /**
     * Clear all data for a specific session
     */
    async clearSession(sessionId: string): Promise<void> {
        const pattern = this.getScopedKey(sessionId, '*');
        await this.backend.deletePattern(pattern);
    }

    /**
     * Get all active session IDs
     */
    async getActiveSessions(): Promise<string[]> {
        const pattern = 'session:*';
        const keys = await this.backend.keys(pattern);

        const sessionIds = new Set<string>();
        keys.forEach((key) => {
            const match = key.match(/^session:([^:]+):/);
            if (match) {
                sessionIds.add(match[1]);
            }
        });

        return Array.from(sessionIds);
    }

    /**
     * Get the number of keys in a session
     */
    async getSessionSize(sessionId: string): Promise<number> {
        const pattern = this.getScopedKey(sessionId, '*');
        const keys = await this.backend.keys(pattern);
        return keys.length;
    }

    /**
     * Increment a counter for a session
     */
    async increment(sessionId: string, key: string, by: number = 1): Promise<number> {
        const scopedKey = this.getScopedKey(sessionId, key);
        return await this.backend.incr(scopedKey, by);
    }

    /**
     * Decrement a counter for a session
     */
    async decrement(sessionId: string, key: string, by: number = 1): Promise<number> {
        const scopedKey = this.getScopedKey(sessionId, key);
        return await this.backend.decr(scopedKey, by);
    }

    /**
     * Touch a session (update its last activity time)
     */
    async touch(sessionId: string, ttl?: number): Promise<void> {
        const now = Date.now();
        await this.set(sessionId, '_lastActivity', now, ttl);
    }

    /**
     * Get the last activity time for a session
     */
    async getLastActivity(sessionId: string): Promise<number | undefined> {
        return await this.get<number>(sessionId, '_lastActivity');
    }

    /**
     * Check if a session exists (has any data)
     */
    async sessionExists(sessionId: string): Promise<boolean> {
        const size = await this.getSessionSize(sessionId);
        return size > 0;
    }

    // Private utility methods
    private getScopedKey(sessionId: string, key: string): string {
        return `session:${sessionId}:${key}`;
    }

    private unscopeKey(sessionId: string, scopedKey: string): string {
        const prefix = `session:${sessionId}:`;
        return scopedKey.startsWith(prefix) ? scopedKey.slice(prefix.length) : scopedKey;
    }
}
