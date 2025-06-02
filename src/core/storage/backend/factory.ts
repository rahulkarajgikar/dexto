import {
    StorageBackend,
    StorageBackendConfig,
    StorageBackends,
    StorageContext,
    StorageConnectionError,
} from './types.js';
import { MemoryStorageBackend } from './memory.js';
import { logger } from '../../logger/index.js';

/**
 * Create a single storage backend based on configuration
 */
export async function createStorageBackend(
    config: string | StorageBackendConfig,
    context?: StorageContext
): Promise<StorageBackend> {
    // Normalize config to object form
    const normalizedConfig = normalizeBackendConfig(config);

    try {
        let backend: StorageBackend;

        switch (normalizedConfig.type) {
            case 'memory':
                backend = new MemoryStorageBackend({
                    maxSize: normalizedConfig.maxSize,
                    cleanupIntervalMs: 30000,
                });
                break;

            case 'file':
                const { FileStorageBackend } = await import('./file.js');
                backend = new FileStorageBackend(normalizedConfig, context);
                break;

            case 'sqlite':
                const { SQLiteStorageBackend } = await import('./sqlite.js');
                backend = new SQLiteStorageBackend(normalizedConfig, context);
                break;

            case 'redis':
                // TODO: Implement Redis backend
                logger.warn('Redis backend not implemented yet, falling back to memory');
                backend = new MemoryStorageBackend();
                break;

            case 'postgres':
                // TODO: Implement PostgreSQL backend
                logger.warn('PostgreSQL backend not implemented yet, falling back to memory');
                backend = new MemoryStorageBackend();
                break;

            case 's3':
                // TODO: Implement S3 backend
                logger.warn('S3 backend not implemented yet, falling back to memory');
                backend = new MemoryStorageBackend();
                break;

            default:
                throw new StorageConnectionError(
                    `Unknown backend type: ${(normalizedConfig as any).type}`
                );
        }

        // Connect to the backend
        await backend.connect();
        logger.debug(`Connected to ${normalizedConfig.type} storage backend`);

        return backend;
    } catch (error) {
        logger.warn(
            `Failed to create ${normalizedConfig.type} backend, falling back to memory:`,
            error
        );

        // Graceful fallback to memory
        const memoryBackend = new MemoryStorageBackend();
        await memoryBackend.connect();
        return memoryBackend;
    }
}

/**
 * Create the standard collection of storage backends with intelligent defaults
 */
export async function createStorageBackends(
    config: Record<string, string | StorageBackendConfig> = {},
    context?: StorageContext
): Promise<StorageBackends> {
    const backends: Partial<StorageBackends> = {};

    // Create backends from config
    for (const [name, backendConfig] of Object.entries(config)) {
        try {
            backends[name as keyof StorageBackends] = await createStorageBackend(
                backendConfig,
                context
            );
        } catch (error) {
            logger.warn(`Failed to create '${name}' backend:`, error);
        }
    }

    // Apply intelligent defaults with graceful fallback
    const result: StorageBackends = {
        cache: backends.cache || new MemoryStorageBackend({ maxSize: 5000 }),
        persistent: backends.persistent || new MemoryStorageBackend({ maxSize: 20000 }),
        files: backends.files,
    };

    // Ensure cache and persistent backends are connected
    if (!result.cache.isConnected()) {
        await result.cache.connect();
    }
    if (!result.persistent.isConnected()) {
        await result.persistent.connect();
    }

    logger.info('Storage backends initialized:', {
        cache: result.cache.getBackendType(),
        persistent: result.persistent.getBackendType(),
        files: result.files?.getBackendType() || 'none',
    });

    return result;
}

/**
 * Normalize backend configuration to standard object form
 */
function normalizeBackendConfig(config: string | StorageBackendConfig): StorageBackendConfig {
    if (typeof config === 'string') {
        // Handle URL-style config
        if (config.includes('://')) {
            const url = new URL(config);
            switch (url.protocol.replace(':', '')) {
                case 'redis':
                    return { type: 'redis', connectionString: config };
                case 'postgres':
                case 'postgresql':
                    return { type: 'postgres', connectionString: config };
                case 'file':
                    return { type: 'file', path: url.pathname };
                case 's3':
                    return { type: 's3', connectionString: config };
                default:
                    throw new StorageConnectionError(`Unknown protocol: ${url.protocol}`);
            }
        }

        // Handle simple string types
        return { type: config as any };
    }

    return config;
}

/**
 * Get default storage backend configuration for common scenarios
 */
export function getDefaultStorageConfig(
    scenario: 'development' | 'testing' | 'production'
): Record<string, StorageBackendConfig> {
    switch (scenario) {
        case 'development':
            return {
                cache: { type: 'memory' },
                persistent: { type: 'file' },
            };

        case 'testing':
            return {
                cache: { type: 'memory' },
                persistent: { type: 'memory' },
            };

        case 'production':
            return {
                cache: {
                    type: 'redis',
                    connectionString: process.env.REDIS_URL || 'redis://localhost:6379',
                },
                persistent: { type: 'postgres', connectionString: process.env.DATABASE_URL || '' },
                files: { type: 's3', connectionString: process.env.S3_BUCKET_URL || '' },
            };

        default:
            return {
                cache: { type: 'memory' },
                persistent: { type: 'memory' },
            };
    }
}

/**
 * Cleanup and disconnect all backends
 */
export async function disconnectStorageBackends(backends: StorageBackends): Promise<void> {
    const promises: Promise<void>[] = [];

    if (backends.cache) {
        promises.push(backends.cache.disconnect());
    }

    if (backends.persistent) {
        promises.push(backends.persistent.disconnect());
    }

    if (backends.files) {
        promises.push(backends.files.disconnect());
    }

    await Promise.all(promises);
    logger.debug('All storage backends disconnected');
}
