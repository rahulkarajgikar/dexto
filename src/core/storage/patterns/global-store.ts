import { StorageBackend } from '../backend/types.js';

/**
 * Global storage pattern for agent-wide shared data.
 * No scoping (global to entire agent instance).
 * Uses persistent backend for durability across restarts.
 * Careful about concurrent access and provides atomic operations.
 */
export class GlobalStore {
    constructor(private backend: StorageBackend) {}

    /**
     * Get a global value by key
     */
    async get<T>(key: string): Promise<T | undefined> {
        const scopedKey = this.getScopedKey(key);
        return await this.backend.get<T>(scopedKey);
    }

    /**
     * Set a global value by key with optional TTL
     */
    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        const scopedKey = this.getScopedKey(key);
        await this.backend.set(scopedKey, value, ttl);
    }

    /**
     * Delete a global key
     */
    async delete(key: string): Promise<void> {
        const scopedKey = this.getScopedKey(key);
        await this.backend.delete(scopedKey);
    }

    /**
     * Check if a global key exists
     */
    async has(key: string): Promise<boolean> {
        const scopedKey = this.getScopedKey(key);
        return await this.backend.has(scopedKey);
    }

    /**
     * Get all global keys and values
     */
    async getAll<T>(): Promise<Record<string, T>> {
        const pattern = this.getScopedKey('*');
        const keys = await this.backend.keys(pattern);
        const values = await this.backend.mget<T>(keys);

        const result: Record<string, T> = {};
        keys.forEach((scopedKey, index) => {
            const value = values[index];
            if (value !== undefined) {
                const shortKey = this.unscopeKey(scopedKey);
                result[shortKey] = value;
            }
        });

        return result;
    }

    /**
     * Set multiple global key-value pairs
     */
    async setMultiple<T>(data: Record<string, T>): Promise<void> {
        const entries: [string, T][] = Object.entries(data).map(([key, value]) => [
            this.getScopedKey(key),
            value,
        ]);

        await this.backend.mset(entries);
    }

    /**
     * Get all global keys matching a pattern
     */
    async getKeys(pattern: string = '*'): Promise<string[]> {
        const scopedPattern = this.getScopedKey(pattern);
        const keys = await this.backend.keys(scopedPattern);
        return keys.map((key) => this.unscopeKey(key));
    }

    /**
     * Delete all global keys matching a pattern
     */
    async deletePattern(pattern: string): Promise<void> {
        const scopedPattern = this.getScopedKey(pattern);
        await this.backend.deletePattern(scopedPattern);
    }

    /**
     * Clear all global data
     */
    async clear(): Promise<void> {
        await this.deletePattern('*');
    }

    // Atomic operations for counters and flags
    /**
     * Increment a global counter atomically
     */
    async increment(key: string, by: number = 1): Promise<number> {
        const scopedKey = this.getScopedKey(key);
        return await this.backend.incr(scopedKey, by);
    }

    /**
     * Decrement a global counter atomically
     */
    async decrement(key: string, by: number = 1): Promise<number> {
        const scopedKey = this.getScopedKey(key);
        return await this.backend.decr(scopedKey, by);
    }

    /**
     * Get counter value (defaults to 0 if not set)
     */
    async getCounter(key: string): Promise<number> {
        return (await this.get<number>(key)) || 0;
    }

    /**
     * Set counter value
     */
    async setCounter(key: string, value: number): Promise<void> {
        await this.set(key, value);
    }

    /**
     * Reset counter to 0
     */
    async resetCounter(key: string): Promise<void> {
        await this.setCounter(key, 0);
    }

    // Configuration management
    /**
     * Get a configuration value with a default
     */
    async getConfig<T>(key: string, defaultValue: T): Promise<T> {
        const value = await this.get<T>(`config:${key}`);
        return value !== undefined ? value : defaultValue;
    }

    /**
     * Set a configuration value
     */
    async setConfig<T>(key: string, value: T): Promise<void> {
        await this.set(`config:${key}`, value);
    }

    /**
     * Get all configuration values
     */
    async getAllConfig<T>(): Promise<Record<string, T>> {
        const pattern = 'config:*';
        const scopedPattern = this.getScopedKey(pattern);
        const keys = await this.backend.keys(scopedPattern);
        const values = await this.backend.mget<T>(keys);

        const result: Record<string, T> = {};
        keys.forEach((scopedKey, index) => {
            const value = values[index];
            if (value !== undefined) {
                const fullKey = this.unscopeKey(scopedKey);
                const configKey = fullKey.replace('config:', '');
                result[configKey] = value;
            }
        });

        return result;
    }

    /**
     * Delete a configuration value
     */
    async deleteConfig(key: string): Promise<void> {
        await this.delete(`config:${key}`);
    }

    // Feature flags
    /**
     * Check if a feature flag is enabled
     */
    async isFeatureEnabled(featureName: string): Promise<boolean> {
        return (await this.get<boolean>(`feature:${featureName}`)) || false;
    }

    /**
     * Enable a feature flag
     */
    async enableFeature(featureName: string): Promise<void> {
        await this.set(`feature:${featureName}`, true);
    }

    /**
     * Disable a feature flag
     */
    async disableFeature(featureName: string): Promise<void> {
        await this.set(`feature:${featureName}`, false);
    }

    /**
     * Toggle a feature flag
     */
    async toggleFeature(featureName: string): Promise<boolean> {
        const current = await this.isFeatureEnabled(featureName);
        const newValue = !current;
        await this.set(`feature:${featureName}`, newValue);
        return newValue;
    }

    /**
     * Get all feature flags
     */
    async getAllFeatures(): Promise<Record<string, boolean>> {
        const pattern = 'feature:*';
        const scopedPattern = this.getScopedKey(pattern);
        const keys = await this.backend.keys(scopedPattern);
        const values = await this.backend.mget<boolean>(keys);

        const result: Record<string, boolean> = {};
        keys.forEach((scopedKey, index) => {
            const value = values[index];
            if (value !== undefined) {
                const fullKey = this.unscopeKey(scopedKey);
                const featureName = fullKey.replace('feature:', '');
                result[featureName] = value;
            }
        });

        return result;
    }

    // Rate limiting utilities
    /**
     * Increment a rate limit counter with TTL
     */
    async incrementRateLimit(key: string, ttlMs: number): Promise<number> {
        const rateLimitKey = `ratelimit:${key}`;
        const current = await this.getCounter(rateLimitKey);

        if (current === 0) {
            // First request, set with TTL
            await this.set(rateLimitKey, 1, ttlMs);
            return 1;
        } else {
            // Subsequent request, increment
            return await this.increment(rateLimitKey);
        }
    }

    /**
     * Check rate limit status
     */
    async getRateLimit(key: string): Promise<number> {
        return await this.getCounter(`ratelimit:${key}`);
    }

    /**
     * Reset rate limit
     */
    async resetRateLimit(key: string): Promise<void> {
        await this.delete(`ratelimit:${key}`);
    }

    // Analytics and metrics
    /**
     * Record a metric event
     */
    async recordMetric(metricName: string, value: number = 1): Promise<void> {
        const timestamp = Date.now();
        const dayKey = this.getDayKey(timestamp);
        await this.increment(`metrics:${metricName}:${dayKey}`, value);
        await this.increment(`metrics:${metricName}:total`, value);
    }

    /**
     * Get metric for a specific day
     */
    async getMetric(metricName: string, date?: Date): Promise<number> {
        const dayKey = this.getDayKey(date?.getTime() || Date.now());
        return await this.getCounter(`metrics:${metricName}:${dayKey}`);
    }

    /**
     * Get total metric across all time
     */
    async getTotalMetric(metricName: string): Promise<number> {
        return await this.getCounter(`metrics:${metricName}:total`);
    }

    // Private utility methods
    private getScopedKey(key: string): string {
        return `global:${key}`;
    }

    private unscopeKey(scopedKey: string): string {
        const prefix = 'global:';
        return scopedKey.startsWith(prefix) ? scopedKey.slice(prefix.length) : scopedKey;
    }

    private getDayKey(timestamp: number): string {
        const date = new Date(timestamp);
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }
}
