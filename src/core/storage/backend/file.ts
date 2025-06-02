import { promises as fs } from 'fs';
import * as path from 'path';
import {
    StorageBackend,
    StorageBackendConfig,
    StorageContext,
    StorageError,
    StorageConnectionError,
} from './types.js';
import { StoragePathResolver } from '../path-resolver.js';
import { logger } from '../../logger/index.js';

interface FileEntry<T> {
    value: T;
    expiresAt?: number;
    createdAt: number;
    updatedAt: number;
}

interface FileListEntry<T> {
    items: T[];
    expiresAt?: number;
    createdAt: number;
    updatedAt: number;
}

/**
 * File-based storage backend that stores data as JSON files.
 * Uses the existing StoragePathResolver for local path management.
 */
export class FileStorageBackend implements StorageBackend {
    private basePath!: string;
    private connected = false;
    private readonly config: StorageBackendConfig;
    private readonly context?: StorageContext;

    constructor(config: StorageBackendConfig, context?: StorageContext) {
        this.config = config;
        this.context = context;
    }

    async connect(): Promise<void> {
        try {
            if (this.config.path) {
                // Use explicit path if provided
                this.basePath = this.config.path;
            } else if (this.context) {
                // Use path resolver for automatic path resolution
                this.basePath = await StoragePathResolver.resolveStoragePath(this.context, 'data');
            } else {
                throw new StorageConnectionError(
                    'No path provided and no context available for path resolution'
                );
            }

            // Ensure base directory exists
            await fs.mkdir(this.basePath, { recursive: true });

            this.connected = true;
            logger.debug(`File storage connected to: ${this.basePath}`);
        } catch (error) {
            throw new StorageConnectionError(`Failed to connect to file storage: ${error}`);
        }
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    isConnected(): boolean {
        return this.connected;
    }

    getBackendType(): string {
        return 'file';
    }

    getBackendInfo(): Record<string, any> {
        return {
            type: 'file',
            basePath: this.basePath,
            connected: this.connected,
        };
    }

    // Basic key-value operations
    async get<T>(key: string): Promise<T | undefined> {
        try {
            const filePath = this.getFilePath(key);
            const content = await fs.readFile(filePath, 'utf-8');
            const entry: FileEntry<T> = JSON.parse(content);

            // Check if expired
            if (entry.expiresAt && Date.now() > entry.expiresAt) {
                await this.delete(key);
                return undefined;
            }

            return entry.value;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return undefined;
            }
            throw new StorageError(
                `Failed to read key ${key}: ${error.message}`,
                'READ_ERROR',
                error
            );
        }
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        try {
            const filePath = this.getFilePath(key);
            const now = Date.now();
            const entry: FileEntry<T> = {
                value,
                expiresAt: ttl ? now + ttl : undefined,
                createdAt: now,
                updatedAt: now,
            };

            // Ensure directory exists
            await fs.mkdir(path.dirname(filePath), { recursive: true });

            await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
        } catch (error: any) {
            throw new StorageError(
                `Failed to write key ${key}: ${error.message}`,
                'WRITE_ERROR',
                error
            );
        }
    }

    async delete(key: string): Promise<void> {
        try {
            const filePath = this.getFilePath(key);
            await fs.unlink(filePath);
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                throw new StorageError(
                    `Failed to delete key ${key}: ${error.message}`,
                    'DELETE_ERROR',
                    error
                );
            }
        }
    }

    async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== undefined;
    }

    // Batch operations
    async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
        return Promise.all(keys.map((key) => this.get<T>(key)));
    }

    async mset<T>(entries: [string, T][]): Promise<void> {
        await Promise.all(entries.map(([key, value]) => this.set(key, value)));
    }

    // Pattern operations
    async keys(pattern: string): Promise<string[]> {
        try {
            const regex = this.patternToRegex(pattern);
            const result: string[] = [];

            // Read all files in the base directory recursively
            const files = await this.getAllFiles(this.basePath);

            for (const file of files) {
                const key = this.filePathToKey(file);
                if (regex.test(key)) {
                    // Check if not expired
                    const hasValue = await this.has(key);
                    if (hasValue) {
                        result.push(key);
                    }
                }
            }

            return result;
        } catch (error: any) {
            throw new StorageError(
                `Failed to list keys with pattern ${pattern}: ${error.message}`,
                'PATTERN_ERROR',
                error
            );
        }
    }

    async deletePattern(pattern: string): Promise<void> {
        const keys = await this.keys(pattern);
        await Promise.all(keys.map((key) => this.delete(key)));
    }

    // List operations (stored as special files)
    async lpush<T>(key: string, value: T): Promise<void> {
        try {
            const listPath = this.getListFilePath(key);
            let listEntry: FileListEntry<T>;

            try {
                const content = await fs.readFile(listPath, 'utf-8');
                listEntry = JSON.parse(content);

                // Check if expired
                if (listEntry.expiresAt && Date.now() > listEntry.expiresAt) {
                    listEntry.items = [];
                    listEntry.expiresAt = undefined;
                }
            } catch (error: any) {
                if (error.code === 'ENOENT') {
                    listEntry = {
                        items: [],
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    };
                } else {
                    throw error;
                }
            }

            listEntry.items.unshift(value);
            listEntry.updatedAt = Date.now();

            // Ensure directory exists
            await fs.mkdir(path.dirname(listPath), { recursive: true });

            await fs.writeFile(listPath, JSON.stringify(listEntry, null, 2), 'utf-8');
        } catch (error: any) {
            throw new StorageError(
                `Failed to push to list ${key}: ${error.message}`,
                'LIST_ERROR',
                error
            );
        }
    }

    async lrange<T>(key: string, start: number, end: number): Promise<T[]> {
        try {
            const listPath = this.getListFilePath(key);
            const content = await fs.readFile(listPath, 'utf-8');
            const listEntry: FileListEntry<T> = JSON.parse(content);

            // Check if expired
            if (listEntry.expiresAt && Date.now() > listEntry.expiresAt) {
                await fs.unlink(listPath);
                return [];
            }

            const items = listEntry.items;
            const len = items.length;
            const startIdx = start < 0 ? Math.max(0, len + start) : Math.min(start, len);
            const endIdx = end < 0 ? Math.max(0, len + end + 1) : Math.min(end + 1, len);

            return items.slice(startIdx, endIdx);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw new StorageError(
                `Failed to read list ${key}: ${error.message}`,
                'LIST_ERROR',
                error
            );
        }
    }

    async ltrim(key: string, start: number, end: number): Promise<void> {
        try {
            const listPath = this.getListFilePath(key);
            const content = await fs.readFile(listPath, 'utf-8');
            const listEntry: FileListEntry<any> = JSON.parse(content);

            // Check if expired
            if (listEntry.expiresAt && Date.now() > listEntry.expiresAt) {
                await fs.unlink(listPath);
                return;
            }

            const items = listEntry.items;
            const len = items.length;
            const startIdx = start < 0 ? Math.max(0, len + start) : Math.min(start, len);
            const endIdx = end < 0 ? Math.max(0, len + end + 1) : Math.min(end + 1, len);

            listEntry.items = items.slice(startIdx, endIdx);
            listEntry.updatedAt = Date.now();

            await fs.writeFile(listPath, JSON.stringify(listEntry, null, 2), 'utf-8');
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                throw new StorageError(
                    `Failed to trim list ${key}: ${error.message}`,
                    'LIST_ERROR',
                    error
                );
            }
        }
    }

    async llen(key: string): Promise<number> {
        try {
            const listPath = this.getListFilePath(key);
            const content = await fs.readFile(listPath, 'utf-8');
            const listEntry: FileListEntry<any> = JSON.parse(content);

            // Check if expired
            if (listEntry.expiresAt && Date.now() > listEntry.expiresAt) {
                await fs.unlink(listPath);
                return 0;
            }

            return listEntry.items.length;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return 0;
            }
            throw new StorageError(
                `Failed to get list length ${key}: ${error.message}`,
                'LIST_ERROR',
                error
            );
        }
    }

    // Atomic operations (using file-based counters)
    async incr(key: string, by: number = 1): Promise<number> {
        // Simple file-based counter (not truly atomic, but good enough for file backend)
        const current = (await this.get<number>(key)) || 0;
        const newValue = current + by;
        await this.set(key, newValue);
        return newValue;
    }

    async decr(key: string, by: number = 1): Promise<number> {
        return this.incr(key, -by);
    }

    // Utility methods
    private getFilePath(key: string): string {
        // Convert key to safe file path
        const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
        return path.join(this.basePath, 'keys', `${safeKey}.json`);
    }

    private getListFilePath(key: string): string {
        const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
        return path.join(this.basePath, 'lists', `${safeKey}.json`);
    }

    private filePathToKey(filePath: string): string {
        const relativePath = path.relative(path.join(this.basePath, 'keys'), filePath);
        return path.basename(relativePath, '.json');
    }

    private async getAllFiles(dir: string): Promise<string[]> {
        const files: string[] = [];

        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const subFiles = await this.getAllFiles(fullPath);
                    files.push(...subFiles);
                } else if (entry.isFile() && entry.name.endsWith('.json')) {
                    files.push(fullPath);
                }
            }
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        return files;
    }

    private patternToRegex(pattern: string): RegExp {
        // Convert glob-style pattern to regex
        const escaped = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');

        return new RegExp(`^${escaped}$`);
    }
}
