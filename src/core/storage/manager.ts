import { StorageBackends, StorageContext } from './backend/types.js';
import {
    createStorageBackends,
    disconnectStorageBackends,
    getDefaultStorageConfig,
} from './backend/factory.js';
import { SessionStore } from './patterns/session-store.js';
import { UserStore } from './patterns/user-store.js';
import { GlobalStore } from './patterns/global-store.js';
import { MessageStore } from './patterns/message-store.js';
import { StoragePathResolver } from './path-resolver.js';
import { logger } from '../logger/index.js';

/**
 * Main storage manager that provides unified access to all storage patterns.
 * Automatically configures backends based on environment and provides
 * pattern-based interfaces for common storage use cases.
 */
export class StorageManager {
    private backends!: StorageBackends;
    private _sessionStore!: SessionStore;
    private _userStore!: UserStore;
    private _globalStore!: GlobalStore;
    private _messageStore!: MessageStore;
    private initialized = false;

    /**
     * Initialize the storage manager with automatic configuration
     */
    async initialize(customConfig?: Record<string, any>, context?: StorageContext): Promise<void> {
        if (this.initialized) {
            logger.warn('StorageManager already initialized');
            return;
        }

        try {
            // Determine environment and get default config
            const env = process.env.NODE_ENV || 'development';
            const scenario =
                env === 'test' ? 'testing' : env === 'production' ? 'production' : 'development';

            let config = getDefaultStorageConfig(scenario);

            // Merge with custom config if provided
            if (customConfig) {
                config = { ...config, ...customConfig };
            }

            // Create storage context if not provided
            let storageContext = context;
            if (!storageContext) {
                storageContext = await StoragePathResolver.createLocalContextWithAutoDetection({
                    isDevelopment: env !== 'production',
                });
            }

            // Initialize backends
            this.backends = await createStorageBackends(config, storageContext);

            // Initialize pattern stores
            this._sessionStore = new SessionStore(this.backends.cache);
            this._userStore = new UserStore(this.backends.persistent);
            this._globalStore = new GlobalStore(this.backends.persistent);
            this._messageStore = new MessageStore(this.backends.persistent);

            this.initialized = true;

            logger.info('StorageManager initialized successfully', {
                environment: env,
                backends: {
                    cache: this.backends.cache.getBackendType(),
                    persistent: this.backends.persistent.getBackendType(),
                    files: this.backends.files?.getBackendType() || 'none',
                },
            });
        } catch (error) {
            logger.error('Failed to initialize StorageManager:', error);
            throw error;
        }
    }

    /**
     * Get session-scoped storage (fast, ephemeral)
     * Uses cache backend (Redis/Memory) with automatic TTL
     */
    get session(): SessionStore {
        this.ensureInitialized();
        return this._sessionStore;
    }

    /**
     * Get user-scoped storage (persistent)
     * Uses persistent backend (Postgres/SQLite/File)
     */
    get user(): UserStore {
        this.ensureInitialized();
        return this._userStore;
    }

    /**
     * Get global storage (persistent, agent-wide)
     * Uses persistent backend with careful concurrency handling
     */
    get global(): GlobalStore {
        this.ensureInitialized();
        return this._globalStore;
    }

    /**
     * Get message storage (append-only, optimized for chat history)
     * Uses persistent backend with list operations
     */
    get messages(): MessageStore {
        this.ensureInitialized();
        return this._messageStore;
    }

    /**
     * Get direct access to storage backends (advanced use)
     */
    get backends(): StorageBackends {
        this.ensureInitialized();
        return this.backends;
    }

    /**
     * Check if the storage manager is initialized
     */
    get isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get storage health information
     */
    async getHealthInfo(): Promise<{
        initialized: boolean;
        backends: Record<string, any>;
        connectivity: Record<string, boolean>;
    }> {
        if (!this.initialized) {
            return {
                initialized: false,
                backends: {},
                connectivity: {},
            };
        }

        const backends: Record<string, any> = {};
        const connectivity: Record<string, boolean> = {};

        if (this.backends.cache) {
            backends.cache = this.backends.cache.getBackendInfo?.() || {
                type: this.backends.cache.getBackendType(),
            };
            connectivity.cache = this.backends.cache.isConnected();
        }

        if (this.backends.persistent) {
            backends.persistent = this.backends.persistent.getBackendInfo?.() || {
                type: this.backends.persistent.getBackendType(),
            };
            connectivity.persistent = this.backends.persistent.isConnected();
        }

        if (this.backends.files) {
            backends.files = this.backends.files.getBackendInfo?.() || {
                type: this.backends.files.getBackendType(),
            };
            connectivity.files = this.backends.files.isConnected();
        }

        return {
            initialized: this.initialized,
            backends,
            connectivity,
        };
    }

    /**
     * Cleanup and disconnect all storage backends
     */
    async disconnect(): Promise<void> {
        if (!this.initialized) {
            return;
        }

        try {
            await disconnectStorageBackends(this.backends);
            this.initialized = false;
            logger.info('StorageManager disconnected successfully');
        } catch (error) {
            logger.error('Error during StorageManager disconnect:', error);
            throw error;
        }
    }

    /**
     * Reset all storage data (dangerous - use with caution)
     */
    async reset(): Promise<void> {
        this.ensureInitialized();

        logger.warn('Resetting all storage data - this is irreversible!');

        // Clear all pattern stores
        await this._globalStore.clear();

        // For cache backend, we can clear everything
        const cacheBackend = this.backends.cache;
        const allCacheKeys = await cacheBackend.keys('*');
        for (const key of allCacheKeys) {
            await cacheBackend.delete(key);
        }

        // For persistent backend, we need to be more careful
        // Only clear keys we recognize from our patterns
        const persistentBackend = this.backends.persistent;
        const patterns = ['global:*', 'user:*', 'messages:*'];

        for (const pattern of patterns) {
            await persistentBackend.deletePattern(pattern);
        }

        logger.warn('Storage reset completed');
    }

    /**
     * Create a new storage manager with custom configuration
     */
    static async create(
        customConfig?: Record<string, any>,
        context?: StorageContext
    ): Promise<StorageManager> {
        const manager = new StorageManager();
        await manager.initialize(customConfig, context);
        return manager;
    }

    /**
     * Create a storage manager for testing with in-memory backends
     */
    static async createForTesting(): Promise<StorageManager> {
        const testConfig = {
            cache: { type: 'memory' as const },
            persistent: { type: 'memory' as const },
        };

        return await StorageManager.create(testConfig);
    }

    // Private helper methods
    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error('StorageManager not initialized. Call initialize() first.');
        }
    }
}

// Export singleton instance for convenience
let globalInstance: StorageManager | null = null;

/**
 * Get the global storage manager instance (singleton pattern)
 * Initializes automatically on first access
 */
export async function getStorageManager(): Promise<StorageManager> {
    if (!globalInstance) {
        globalInstance = new StorageManager();
        await globalInstance.initialize();
    }
    return globalInstance;
}

/**
 * Reset the global storage manager instance
 * Useful for testing or configuration changes
 */
export async function resetStorageManager(): Promise<void> {
    if (globalInstance) {
        await globalInstance.disconnect();
        globalInstance = null;
    }
}

/**
 * Configure and set a custom global storage manager
 */
export async function setStorageManager(
    customConfig?: Record<string, any>,
    context?: StorageContext
): Promise<StorageManager> {
    await resetStorageManager();
    globalInstance = await StorageManager.create(customConfig, context);
    return globalInstance;
}
