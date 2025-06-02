/**
 * Saiki Storage Layer
 *
 * A unified storage system that provides:
 * - Multiple storage backends (Memory, File, SQLite, Redis, PostgreSQL, S3)
 * - High-level storage patterns (Session, User, Global, Message stores)
 * - Automatic path resolution and configuration
 * - Graceful fallbacks and error handling
 *
 * Usage examples:
 *
 * // Get the global storage manager (auto-initialized)
 * const storage = await getStorageManager();
 *
 * // Use pattern-based storage
 * await storage.user.set('user123', 'preferences', { theme: 'dark' });
 * await storage.session.set('session456', 'tempData', someObject, 3600000); // 1 hour TTL
 * await storage.messages.addMessage('conversation789', { content: 'Hello!' });
 *
 * // Custom initialization
 * const customStorage = await StorageManager.create({
 *   cache: { type: 'redis', connectionString: 'redis://localhost:6379' },
 *   persistent: { type: 'postgres', connectionString: 'postgres://...' }
 * });
 */

// Main storage manager
export {
    StorageManager,
    getStorageManager,
    resetStorageManager,
    setStorageManager,
} from './manager.js';

// Storage backends
export {
    type StorageBackend,
    type StorageBackendConfig,
    type StorageBackends,
    type StorageContext,
    StorageError,
    StorageConnectionError,
    StorageNotFoundError,
} from './backend/types.js';

export {
    createStorageBackend,
    createStorageBackends,
    disconnectStorageBackends,
    getDefaultStorageConfig,
} from './backend/factory.js';

export { MemoryStorageBackend } from './backend/memory.js';
export { FileStorageBackend } from './backend/file.js';
export { SQLiteStorageBackend } from './backend/sqlite.js';

// Storage patterns
export { SessionStore } from './patterns/session-store.js';
export { UserStore } from './patterns/user-store.js';
export { GlobalStore } from './patterns/global-store.js';
export { MessageStore } from './patterns/message-store.js';

// Path resolution utilities
export { StoragePathResolver } from './path-resolver.js';

// Re-export commonly used patterns for convenience
export type {
    // For applications that want to use these interfaces directly
    StorageBackend as IStorageBackend,
    StorageBackendConfig as IStorageBackendConfig,
    StorageContext as IStorageContext,
};

/**
 * Quick start helper - creates a storage manager with sensible defaults
 */
export async function createStorage(options?: {
    environment?: 'development' | 'testing' | 'production';
    customConfig?: Record<string, any>;
    context?: StorageContext;
}): Promise<StorageManager> {
    const { environment, customConfig, context } = options || {};

    // Override environment if specified
    if (environment) {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = environment;

        try {
            const manager = await StorageManager.create(customConfig, context);
            return manager;
        } finally {
            // Restore original environment
            if (originalEnv) {
                process.env.NODE_ENV = originalEnv;
            } else {
                delete process.env.NODE_ENV;
            }
        }
    }

    return StorageManager.create(customConfig, context);
}

/**
 * Create a storage manager optimized for testing
 */
export function createTestStorage(): Promise<StorageManager> {
    return StorageManager.createForTesting();
}
