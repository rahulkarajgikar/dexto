/**
 * Core storage backend interface that all storage implementations must implement.
 * This provides a uniform API across different storage technologies (Memory, File, Redis, PostgreSQL, etc.)
 */
export interface StorageBackend {
    // Basic key-value operations
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;

    // Batch operations for efficiency
    mget<T>(keys: string[]): Promise<(T | undefined)[]>;
    mset<T>(entries: [string, T][]): Promise<void>;

    // Pattern-based operations
    keys(pattern: string): Promise<string[]>;
    deletePattern(pattern: string): Promise<void>;

    // List operations (for append-only data like chat history)
    lpush<T>(key: string, value: T): Promise<void>;
    lrange<T>(key: string, start: number, end: number): Promise<T[]>;
    ltrim(key: string, start: number, end: number): Promise<void>;
    llen(key: string): Promise<number>;

    // Atomic operations (for counters, rate limiting)
    incr(key: string, by?: number): Promise<number>;
    decr(key: string, by?: number): Promise<number>;

    // Connection management
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;

    // Optional: Backend-specific information
    getBackendType(): string;
    getBackendInfo?(): Record<string, any>;
}

/**
 * Configuration for storage backends
 */
export interface StorageBackendConfig {
    type: 'memory' | 'file' | 'sqlite' | 'redis' | 'postgres' | 's3';

    // For local backends (file, sqlite)
    path?: string;

    // For remote backends (redis, postgres)
    connectionString?: string;
    connectionOptions?: Record<string, any>;

    // Common options
    ttl?: number; // Default TTL in milliseconds
    maxSize?: number; // Max size for memory backend
    compression?: boolean; // Enable compression
}

/**
 * Storage context for path-based backends
 */
export interface StorageContext {
    isDevelopment: boolean;
    projectRoot?: string;
    workingDirectory?: string;
    storageRoot?: string;
    forceGlobal?: boolean;
    customRoot?: string;
    connectionString?: string;
    connectionOptions?: Record<string, any>;
}

/**
 * Collection of storage backends for different use cases
 */
export interface StorageBackends {
    cache: StorageBackend; // Fast, ephemeral (Redis, Memory)
    persistent: StorageBackend; // Durable, queryable (Postgres, SQLite, File)
    files?: StorageBackend; // Blob storage (S3, File system)
}

/**
 * Error types for storage operations
 */
export class StorageError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'StorageError';
    }
}

export class StorageConnectionError extends StorageError {
    constructor(message: string, cause?: Error) {
        super(message, 'CONNECTION_ERROR', cause);
        this.name = 'StorageConnectionError';
    }
}

export class StorageNotFoundError extends StorageError {
    constructor(key: string) {
        super(`Key not found: ${key}`, 'NOT_FOUND');
        this.name = 'StorageNotFoundError';
    }
}
