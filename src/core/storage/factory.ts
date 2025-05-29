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
} from './types.js';
import type { StorageConfig } from '../config/schemas.js';

export interface StorageInfo {
    type: 'memory' | 'file' | 'sqlite' | 'redis' | 'database' | 's3';
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
     * Get a storage provider for key-value storage
     */
    async getProvider<T = any>(key: string): Promise<StorageProvider<T>> {
        if (!this.providers.has(key)) {
            const providerConfig = this.getStorageConfigForKey(key);
            const provider = await createStorageProvider<T>(providerConfig, this.context, key);
            this.providers.set(key, provider as StorageProvider);
        }
        return this.providers.get(key) as StorageProvider<T>;
    }

    /**
     * Get a collection storage provider for array/list storage
     */
    async getCollectionProvider<T = any>(key: string): Promise<CollectionStorageProvider<T>> {
        if (!this.collectionProviders.has(key)) {
            const providerConfig = this.getStorageConfigForKey(key);
            const provider = await createCollectionStorageProvider<T>(
                providerConfig,
                this.context,
                key
            );
            this.collectionProviders.set(key, provider);
        }
        return this.collectionProviders.get(key) as CollectionStorageProvider<T>;
    }

    /**
     * Get a session storage provider for TTL-based storage
     */
    async getSessionProvider<T = any>(key: string): Promise<SessionStorageProvider<T>> {
        if (!this.sessionProviders.has(key)) {
            const providerConfig = this.getStorageConfigForKey(key);
            const provider = await createSessionStorageProvider<T>(
                providerConfig,
                this.context,
                key
            );
            this.sessionProviders.set(key, provider);
        }
        return this.sessionProviders.get(key) as SessionStorageProvider<T>;
    }

    /**
     * Get storage configuration for a specific key
     */
    private getStorageConfigForKey(key: string): NonNullable<StorageConfig[keyof StorageConfig]> {
        // Try exact key match first
        if (this.config[key]) {
            return this.config[key];
        }

        // Try custom.* keys
        if (key.startsWith('custom.')) {
            const customKey = key.substring(7); // Remove 'custom.' prefix
            if (this.config.custom && this.config.custom[customKey]) {
                return this.config.custom[customKey];
            }
        }

        // Fall back to default
        if (!this.config.default) {
            throw new Error(
                `No storage configuration found for key '${key}' and no default configuration`
            );
        }

        return this.config.default;
    }

    /**
     * Get information about the storage setup
     */
    getStorageInfo(): StorageInfo {
        const defaultConfig = this.config.default || { type: 'memory' };
        return {
            type: defaultConfig.type as any,
            location: this.context.storageRoot || this.context.connectionString,
            context: this.context,
        };
    }

    /**
     * Close all storage providers
     */
    async close(): Promise<void> {
        await Promise.all([
            ...Array.from(this.providers.values()).map((p) => p.close()),
            ...Array.from(this.collectionProviders.values()).map((p) => p.close()),
            ...Array.from(this.sessionProviders.values()).map((p) => p.close()),
        ]);
    }
}

/**
 * Create a storage manager with automatic context detection
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
        connectionString?: string;
        connectionOptions?: Record<string, any>;
    } = {}
): Promise<StorageManager> {
    let context: StorageContext;

    // Check if any storage config needs remote connection
    const needsRemoteConnection = Object.values(storageConfig).some((config) => {
        if (config && typeof config === 'object' && 'type' in config) {
            // Extract the type from the config object
            const configType = typeof config.type === 'string' ? config.type : 'memory';
            return !StoragePathResolver.needsPathResolution(configType);
        }
        return false;
    });

    if (needsRemoteConnection && contextOptions.connectionString) {
        // Use remote context for remote storage backends
        context = StoragePathResolver.createRemoteContext(contextOptions.connectionString, {
            isDevelopment: contextOptions.isDevelopment,
            projectRoot: contextOptions.projectRoot,
            connectionOptions: contextOptions.connectionOptions,
        });
    } else {
        // Use local context for local storage backends
        context = await StoragePathResolver.createLocalContext({
            isDevelopment: contextOptions.isDevelopment,
            projectRoot: contextOptions.projectRoot,
            forceGlobal: contextOptions.forceGlobal,
            customRoot: contextOptions.customRoot,
        });
    }

    logger.debug('Creating storage manager', {
        storageConfig,
        context,
        needsRemoteConnection,
    });

    return new StorageManager(storageConfig, context);
}

/**
 * Create a simple storage provider for one-off usage
 */
export async function createSimpleStorageProvider<T = any>(
    type: 'memory' | 'file' | 'sqlite' | 'redis' | 'database' | 's3',
    namespace: string,
    options: any = {}
): Promise<StorageProvider<T>> {
    let context: StorageContext;

    if (StoragePathResolver.needsPathResolution(type)) {
        context = await StoragePathResolver.createLocalContext({
            isDevelopment: process.env.NODE_ENV !== 'production',
        });
    } else {
        // For remote storage, require connection string in options
        if (!('url' in options) || !options.url) {
            throw new Error(`Remote storage type '${type}' requires url in options`);
        }
        context = StoragePathResolver.createRemoteContext(options.url as string, {
            isDevelopment: process.env.NODE_ENV !== 'production',
        });
    }

    const config = { type, ...options };
    return createStorageProvider<T>(
        config as NonNullable<StorageConfig[keyof StorageConfig]>,
        context,
        namespace
    );
}

/**
 * Create a storage provider based on configuration
 */
async function createStorageProvider<T>(
    config: NonNullable<StorageConfig[keyof StorageConfig]>,
    context: StorageContext,
    namespace: string
): Promise<StorageProvider<T>> {
    // Extract type from config (Zod has already normalized it)
    if (typeof config !== 'object' || !config || !('type' in config)) {
        throw new Error('Invalid storage configuration - missing type');
    }

    switch (config.type) {
        case 'memory':
            return new MemoryStorageProvider<T>(config, context, namespace);
        case 'file':
            return new FileStorageProvider<T>(config, context, namespace);
        case 'sqlite':
            return new SQLiteStorageProvider<T>(config, context, namespace);
        case 'redis':
            // TODO: Implement RedisStorageProvider
            throw new Error('Redis storage provider not yet implemented');
        case 'database':
            // TODO: Implement DatabaseStorageProvider
            throw new Error('Database storage provider not yet implemented');
        case 's3':
            // TODO: Implement S3StorageProvider
            throw new Error('S3 storage provider not yet implemented');
        default:
            throw new Error(`Unknown storage type: ${(config as any).type}`);
    }
}

/**
 * Create a collection storage provider based on configuration
 */
async function createCollectionStorageProvider<T>(
    config: NonNullable<StorageConfig[keyof StorageConfig]>,
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
    config: NonNullable<StorageConfig[keyof StorageConfig]>,
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
