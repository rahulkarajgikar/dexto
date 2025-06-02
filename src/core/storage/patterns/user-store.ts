import { StorageBackend } from '../backend/types.js';

/**
 * User-scoped storage pattern.
 * Automatically scopes keys to user ID and provides persistent storage.
 * Uses persistent backend (Postgres/SQLite/File) for durability.
 */
export class UserStore {
    constructor(private backend: StorageBackend) {}

    /**
     * Get a value for a specific user and key
     */
    async get<T>(userId: string, key: string): Promise<T | undefined> {
        const scopedKey = this.getScopedKey(userId, key);
        return await this.backend.get<T>(scopedKey);
    }

    /**
     * Set a value for a specific user and key
     */
    async set<T>(userId: string, key: string, value: T): Promise<void> {
        const scopedKey = this.getScopedKey(userId, key);
        await this.backend.set(scopedKey, value);
    }

    /**
     * Delete a specific key for a user
     */
    async delete(userId: string, key: string): Promise<void> {
        const scopedKey = this.getScopedKey(userId, key);
        await this.backend.delete(scopedKey);
    }

    /**
     * Check if a user has a specific key
     */
    async has(userId: string, key: string): Promise<boolean> {
        const scopedKey = this.getScopedKey(userId, key);
        return await this.backend.has(scopedKey);
    }

    /**
     * Get all keys and values for a user
     */
    async getAll<T>(userId: string): Promise<Record<string, T>> {
        const pattern = this.getScopedKey(userId, '*');
        const keys = await this.backend.keys(pattern);
        const values = await this.backend.mget<T>(keys);

        const result: Record<string, T> = {};
        keys.forEach((scopedKey, index) => {
            const value = values[index];
            if (value !== undefined) {
                const shortKey = this.unscopeKey(userId, scopedKey);
                result[shortKey] = value;
            }
        });

        return result;
    }

    /**
     * Set multiple key-value pairs for a user
     */
    async setMultiple<T>(userId: string, data: Record<string, T>): Promise<void> {
        const entries: [string, T][] = Object.entries(data).map(([key, value]) => [
            this.getScopedKey(userId, key),
            value,
        ]);

        await this.backend.mset(entries);
    }

    /**
     * Clear all data for a specific user
     */
    async clearUser(userId: string): Promise<void> {
        const pattern = this.getScopedKey(userId, '*');
        await this.backend.deletePattern(pattern);
    }

    /**
     * Get all user IDs that have data
     */
    async getAllUsers(): Promise<string[]> {
        const pattern = 'user:*';
        const keys = await this.backend.keys(pattern);

        const userIds = new Set<string>();
        keys.forEach((key) => {
            const match = key.match(/^user:([^:]+):/);
            if (match) {
                userIds.add(match[1]);
            }
        });

        return Array.from(userIds);
    }

    /**
     * Get the number of keys a user has
     */
    async getUserDataSize(userId: string): Promise<number> {
        const pattern = this.getScopedKey(userId, '*');
        const keys = await this.backend.keys(pattern);
        return keys.length;
    }

    /**
     * Check if a user exists (has any data)
     */
    async userExists(userId: string): Promise<boolean> {
        const size = await this.getUserDataSize(userId);
        return size > 0;
    }

    // Collection operations for arrays/lists
    /**
     * Add an item to a collection (array) for a user
     */
    async addToCollection<T>(userId: string, key: string, item: T): Promise<void> {
        const items = (await this.get<T[]>(userId, key)) || [];
        if (!items.includes(item)) {
            items.push(item);
            await this.set(userId, key, items);
        }
    }

    /**
     * Remove an item from a collection (array) for a user
     */
    async removeFromCollection<T>(userId: string, key: string, item: T): Promise<void> {
        const items = (await this.get<T[]>(userId, key)) || [];
        const filtered = items.filter((i) => i !== item);
        if (filtered.length !== items.length) {
            await this.set(userId, key, filtered);
        }
    }

    /**
     * Get a collection (array) for a user
     */
    async getCollection<T>(userId: string, key: string): Promise<T[]> {
        return (await this.get<T[]>(userId, key)) || [];
    }

    /**
     * Set a collection (array) for a user
     */
    async setCollection<T>(userId: string, key: string, items: T[]): Promise<void> {
        await this.set(userId, key, items);
    }

    /**
     * Check if a collection contains an item
     */
    async collectionIncludes<T>(userId: string, key: string, item: T): Promise<boolean> {
        const items = await this.getCollection<T>(userId, key);
        return items.includes(item);
    }

    /**
     * Get the size of a collection
     */
    async getCollectionSize(userId: string, key: string): Promise<number> {
        const items = await this.getCollection(userId, key);
        return items.length;
    }

    /**
     * Clear a collection (set to empty array)
     */
    async clearCollection(userId: string, key: string): Promise<void> {
        await this.set(userId, key, []);
    }

    // Object operations for nested data
    /**
     * Update nested object properties for a user
     */
    async updateObject<T extends Record<string, any>>(
        userId: string,
        key: string,
        updates: Partial<T>
    ): Promise<void> {
        const current = (await this.get<T>(userId, key)) || ({} as T);
        const merged = { ...current, ...updates };
        await this.set(userId, key, merged);
    }

    /**
     * Deep merge nested object properties for a user
     */
    async deepMergeObject<T extends Record<string, any>>(
        userId: string,
        key: string,
        updates: any
    ): Promise<void> {
        const current = (await this.get<T>(userId, key)) || ({} as T);
        const merged = this.deepMerge(current, updates);
        await this.set(userId, key, merged);
    }

    /**
     * Get a property from a nested object
     */
    async getObjectProperty<T>(
        userId: string,
        key: string,
        propertyPath: string
    ): Promise<T | undefined> {
        const obj = await this.get<Record<string, any>>(userId, key);
        if (!obj) return undefined;

        return this.getNestedProperty(obj, propertyPath);
    }

    /**
     * Set a property in a nested object
     */
    async setObjectProperty<T>(
        userId: string,
        key: string,
        propertyPath: string,
        value: T
    ): Promise<void> {
        const obj = (await this.get<Record<string, any>>(userId, key)) || {};
        this.setNestedProperty(obj, propertyPath, value);
        await this.set(userId, key, obj);
    }

    // Private utility methods
    private getScopedKey(userId: string, key: string): string {
        return `user:${userId}:${key}`;
    }

    private unscopeKey(userId: string, scopedKey: string): string {
        const prefix = `user:${userId}:`;
        return scopedKey.startsWith(prefix) ? scopedKey.slice(prefix.length) : scopedKey;
    }

    private deepMerge(target: any, source: any): any {
        const result = { ...target };

        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }

        return result;
    }

    private getNestedProperty(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    private setNestedProperty(obj: any, path: string, value: any): void {
        const keys = path.split('.');
        const lastKey = keys.pop()!;
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);

        target[lastKey] = value;
    }
}
