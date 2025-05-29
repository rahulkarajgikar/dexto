/**
 * Saiki Storage Factory
 *
 * This module provides factory functions for creating storage providers and managers.
 * It handles the complexity of configuration parsing, path resolution, and provider instantiation.
 *
 * Key components:
 * - StorageManager: Central hub for accessing different storage types
 * - Factory functions: Create providers based on configuration
 * - Path resolution: Automatic .saiki/ vs ~/.saiki/ selection
 */

import { MemoryStorageProvider } from './providers/memory.js';
import { FileStorageProvider } from './providers/file.js';
import { SQLiteStorageProvider } from './providers/sqlite.js';
import { StoragePathResolver } from './path-resolver.js';
import { logger } from '../logger/index.js';
import type {
    StorageProvider,
    CollectionStorageProvider,
    SessionStorageProvider,
    StorageContext,
    StorageProviderConfig,
} from './types.js';
import type { StorageConfig } from '../config/schemas.js';

export interface StorageInfo {
    type: 'memory' | 'file' | 'sqlite';
    location?: string;
    context: StorageContext;
}

/**
 * Central manager for all storage providers in Saiki.
 * Provides type-safe access to different storage backends configured per use case.
 */
export class StorageManager {
    private providers: Map<string, StorageProvider> = new Map();
    private collectionProviders: Map<string, CollectionStorageProvider> = new Map();
    private sessionProviders: Map<string, SessionStorageProvider> = new Map();

    constructor(
        private config: StorageConfig,
        private context: StorageContext
    ) {}

    /**
     * Get a key-value storage provider for the specified use case.
     */
    async getProvider<T = any>(key: string): Promise<StorageProvider<T>> {
        if (!this.providers.has(key)) {
            const storageConfig = this.getStorageConfigForKey(key);
            const provider = await createStorageProvider<T>(storageConfig, this.context, key);
            this.providers.set(key, provider);
        }
        return this.providers.get(key)! as StorageProvider<T>;
    }

    /**
     * Get a collection storage provider for the specified use case.
     */
    async getCollectionProvider<T = any>(key: string): Promise<CollectionStorageProvider<T>> {
        if (!this.collectionProviders.has(key)) {
            const storageConfig = this.getStorageConfigForKey(key);
            const provider = await createCollectionStorageProvider<T>(
                storageConfig,
                this.context,
                key
            );
            this.collectionProviders.set(key, provider);
        }
        return this.collectionProviders.get(key)! as CollectionStorageProvider<T>;
    }

    /**
     * Get a session storage provider for the specified use case.
     */
    async getSessionProvider<T = any>(key: string): Promise<SessionStorageProvider<T>> {
        if (!this.sessionProviders.has(key)) {
            const storageConfig = this.getStorageConfigForKey(key);
            const provider = await createSessionStorageProvider<T>(
                storageConfig,
                this.context,
                key
            );
            this.sessionProviders.set(key, provider);
        }
        return this.sessionProviders.get(key)! as SessionStorageProvider<T>;
    }

    /**
     * Get storage configuration for a specific key, falling back to default.
     */
    private getStorageConfigForKey(key: string): StorageProviderConfig {
        // Check if it's a built-in key
        if (key in this.config && key !== 'default' && key !== 'custom') {
            const config = this.config[key as keyof StorageConfig];
            return { type: config.type, ...config } as StorageProviderConfig;
        }

        // Check custom configurations
        if (this.config.custom && key in this.config.custom) {
            const config = this.config.custom[key];
            return { type: config.type, ...config } as StorageProviderConfig;
        }

        // Fall back to default
        const defaultConfig = this.config.default;
        return { type: defaultConfig.type, ...defaultConfig } as StorageProviderConfig;
    }

    /**
     * Get information about the storage setup for debugging.
     */
    getStorageInfo(): StorageInfo {
        const defaultConfig = this.config.default;
        return {
            type: defaultConfig.type as 'memory' | 'file' | 'sqlite',
            location: this.context.storageRoot,
            context: this.context,
        };
    }

    /**
     * Close all storage providers and cleanup resources.
     */
    async close(): Promise<void> {
        const allProviders = [
            ...this.providers.values(),
            ...this.collectionProviders.values(),
            ...this.sessionProviders.values(),
        ];

        await Promise.all(allProviders.map((provider) => provider.close()));

        this.providers.clear();
        this.collectionProviders.clear();
        this.sessionProviders.clear();

        logger.debug('All storage providers closed');
    }
}

/**
 * Create a storage manager from agent configuration
 */
export async function createStorageManager(
    storageConfig: StorageConfig = {
        default: { type: 'memory' },
        history: { type: 'memory' },
        allowedTools: { type: 'memory' },
        userInfo: { type: 'memory' },
        toolCache: { type: 'memory' },
        sessions: { type: 'memory' },
    },
    contextOptions: {
        isDevelopment?: boolean;
        projectRoot?: string;
        forceGlobal?: boolean;
        customRoot?: string;
    } = {}
): Promise<StorageManager> {
    const context = await StoragePathResolver.createContext(contextOptions);

    logger.debug('Creating storage manager', {
        storageConfig,
        context,
    });

    return new StorageManager(storageConfig, context);
}

/**
 * Create a simple storage provider for one-off usage
 */
export async function createSimpleStorageProvider<T = any>(
    type: 'memory' | 'file' | 'sqlite',
    namespace: string,
    options: Record<string, any> = {}
): Promise<StorageProvider<T>> {
    const context = await StoragePathResolver.createContext({
        isDevelopment: process.env.NODE_ENV !== 'production',
    });

    const config: StorageProviderConfig = { type, ...options };
    return createStorageProvider<T>(config, context, namespace);
}

/**
 * Create a storage provider based on configuration
 */
async function createStorageProvider<T>(
    config: StorageProviderConfig,
    context: StorageContext,
    namespace: string
): Promise<StorageProvider<T>> {
    switch (config.type) {
        case 'memory':
            return new MemoryStorageProvider<T>(config, context, namespace);
        case 'file':
            return new FileStorageProvider<T>(config, context, namespace);
        case 'sqlite':
            return new SQLiteStorageProvider<T>(config, context, namespace);
        default:
            throw new Error(`Unknown storage type: ${(config as any).type}`);
    }
}

/**
 * Create a collection storage provider based on configuration
 */
async function createCollectionStorageProvider<T>(
    config: StorageProviderConfig,
    context: StorageContext,
    namespace: string
): Promise<CollectionStorageProvider<T>> {
    const provider = await createStorageProvider<T[]>(config, context, namespace);
    return new CollectionStorageAdapter<T>(provider);
}

/**
 * Create a session storage provider based on configuration
 */
async function createSessionStorageProvider<T>(
    config: StorageProviderConfig,
    context: StorageContext,
    namespace: string
): Promise<SessionStorageProvider<T>> {
    const provider = await createStorageProvider<{ data: T; expires?: number }>(
        config,
        context,
        namespace
    );
    return new SessionStorageAdapter<T>(provider);
}

/**
 * Adapter that wraps a StorageProvider to provide CollectionStorageProvider interface
 */
class CollectionStorageAdapter<T> implements CollectionStorageProvider<T> {
    constructor(private provider: StorageProvider<T[]>) {}

    async add(item: T): Promise<void> {
        const items = await this.getAll();
        items.push(item);
        await this.provider.set('items', items);
    }

    async getAll(): Promise<T[]> {
        return (await this.provider.get('items')) ?? [];
    }

    async find(predicate: (item: T) => boolean): Promise<T[]> {
        const items = await this.getAll();
        return items.filter(predicate);
    }

    async remove(predicate: (item: T) => boolean): Promise<number> {
        const items = await this.getAll();
        const initialLength = items.length;
        const filtered = items.filter((item) => !predicate(item));
        await this.provider.set('items', filtered);
        return initialLength - filtered.length;
    }

    async clear(): Promise<void> {
        await this.provider.set('items', []);
    }

    async count(): Promise<number> {
        const items = await this.getAll();
        return items.length;
    }

    async close(): Promise<void> {
        await this.provider.close();
    }
}

/**
 * Adapter that wraps a StorageProvider to provide SessionStorageProvider interface
 */
class SessionStorageAdapter<T> implements SessionStorageProvider<T> {
    constructor(private provider: StorageProvider<{ data: T; expires?: number }>) {}

    async setSession(sessionId: string, data: T, ttl?: number): Promise<void> {
        const expires = ttl ? Date.now() + ttl : undefined;
        await this.provider.set(sessionId, { data, expires });
    }

    async getSession(sessionId: string): Promise<T | undefined> {
        const stored = await this.provider.get(sessionId);
        if (!stored) return undefined;

        if (stored.expires && Date.now() > stored.expires) {
            await this.provider.delete(sessionId);
            return undefined;
        }

        return stored.data;
    }

    async hasSession(sessionId: string): Promise<boolean> {
        const data = await this.getSession(sessionId);
        return data !== undefined;
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        return await this.provider.delete(sessionId);
    }

    async getActiveSessions(): Promise<string[]> {
        const keys = await this.provider.keys();
        const active: string[] = [];

        for (const key of keys) {
            if (await this.hasSession(key)) {
                active.push(key);
            }
        }

        return active;
    }

    async cleanupExpired(): Promise<number> {
        const keys = await this.provider.keys();
        let cleaned = 0;

        for (const key of keys) {
            const stored = await this.provider.get(key);
            if (stored?.expires && Date.now() > stored.expires) {
                await this.provider.delete(key);
                cleaned++;
            }
        }

        return cleaned;
    }

    async clear(): Promise<void> {
        await this.provider.clear();
    }

    async close(): Promise<void> {
        await this.provider.close();
    }
}
