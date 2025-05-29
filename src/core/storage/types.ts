/**
 * Saiki Storage System Types
 *
 * This module defines the core interfaces for Saiki's unified storage layer.
 * The storage system provides three main interfaces for different data patterns:
 *
 * 1. **StorageProvider<T>** - Key-value storage for simple data
 * 2. **CollectionStorageProvider<T>** - Collection-based storage for lists/arrays
 * 3. **SessionStorageProvider<T>** - Session-specific storage with TTL support
 *
 * All providers support multiple backends (memory, file, SQLite) and automatic
 * path resolution between .saiki/ (development) and ~/.saiki/ (production).
 */

// Import storage configuration types from Zod schemas
import type { StorageConfig } from '../config/schemas.js';
export type { StorageConfig };

/**
 * Type-safe storage keys extracted from StorageConfig
 * Automatically includes all keys defined in the StorageConfig schema plus custom.* pattern
 */
export type StorageKey =
    | keyof Omit<StorageConfig, 'custom'> // All predefined keys except 'custom'
    | `custom.${string}`; // Custom keys pattern

/**
 * Helper type to validate storage keys at compile time
 */
export type ValidateStorageKey<T extends string> = T extends StorageKey ? T : never;

/**
 * Individual storage provider configuration for a specific functionality
 * This represents the actual storage mechanism for a specific functionality like conversation history, etc.
 * Whereas StorageConfig is the overall configuration for the entire application, AnyStorageProviderConfig is the configuration for a specific functionality.
 */
export type AnyStorageProviderConfig = NonNullable<StorageConfig[keyof StorageConfig]>;

/**
 * Context information for storage path resolution and configuration.
 * For local storage providers (memory, file, sqlite), includes path resolution.
 * For remote storage providers (redis, database), includes connection info.
 */
export interface StorageContext {
    /** Whether running in development mode */
    isDevelopment: boolean;
    /** Project root directory (if in development) */
    projectRoot?: string;

    // Local storage fields (for file-based backends)
    /** Root directory for storage (e.g., /path/to/.saiki or /path/to/.saiki) - only for local storage */
    storageRoot?: string;
    /** Whether to force global storage (~/.saiki) regardless of mode - only for local storage */
    forceGlobal?: boolean;
    /** Custom storage root override - only for local storage */
    customRoot?: string;

    // Remote storage fields
    /** Connection string for remote storage (e.g., redis://localhost:6379, postgres://...) */
    connectionString?: string;
    /** Additional connection options for remote storage - TODO: Define exact types when implementing specific backends */
    connectionOptions?: any;
}

/**
 * Basic key-value storage interface.
 * Use this for simple data like user preferences, settings, or caching.
 */
export interface StorageProvider<T = any> {
    /** Get a value by key */
    get(key: string): Promise<T | undefined>;

    /** Set a value by key */
    set(key: string, value: T, ttl?: number): Promise<void>;

    /** Check if a key exists */
    has(key: string): Promise<boolean>;

    /** Delete a key */
    delete(key: string): Promise<boolean>;

    /** Get all keys */
    keys(): Promise<string[]>;

    /** Clear all data */
    clear(): Promise<void>;

    /** Close the storage provider */
    close(): Promise<void>;
}

/**
 * Collection-based storage interface.
 * Use this for lists of items like conversation history, logs, or analytics.
 */
export interface CollectionStorageProvider<T = any> {
    /** Add an item to the collection */
    add(item: T): Promise<void>;

    /** Get all items in the collection */
    getAll(): Promise<T[]>;

    /** Find items matching a predicate */
    find(predicate: (item: T) => boolean): Promise<T[]>;

    /** Remove items matching a predicate */
    remove(predicate: (item: T) => boolean): Promise<number>;

    /** Clear all items */
    clear(): Promise<void>;

    /** Get the number of items */
    count(): Promise<number>;

    /** Close the storage provider */
    close(): Promise<void>;
}

/**
 * Session-specific storage interface.
 * Use this for session data with automatic cleanup and TTL support.
 * Useful for storing session data. Defining T defines the type of data this object will help you store.
 */
export interface SessionStorageProvider<T = any> {
    /** Set session data */
    setSession(sessionId: string, data: T, ttl?: number): Promise<void>;

    /** Get session data */
    getSession(sessionId: string): Promise<T | undefined>;

    /** Check if session exists */
    hasSession(sessionId: string): Promise<boolean>;

    /** Delete a session */
    deleteSession(sessionId: string): Promise<boolean>;

    /** Get all active session IDs */
    getActiveSessions(): Promise<string[]>;

    /** Clean up expired sessions */
    cleanupExpired(): Promise<number>;

    /** Clear all sessions */
    clear(): Promise<void>;

    /** Close the storage provider */
    close(): Promise<void>;
}

/**
 * Storage factory interface
 */
export interface StorageFactory {
    createProvider<T>(
        config: AnyStorageProviderConfig,
        context: StorageContext,
        namespace?: string
    ): Promise<StorageProvider<T>>;

    createCollectionProvider<T>(
        config: AnyStorageProviderConfig,
        context: StorageContext,
        namespace?: string
    ): Promise<CollectionStorageProvider<T>>;

    createSessionProvider<T>(
        config: AnyStorageProviderConfig,
        context: StorageContext,
        namespace?: string
    ): Promise<SessionStorageProvider<T>>;
}
