import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../logger/index.js';
import type {
    StorageProvider,
    CollectionStorageProvider,
    SessionStorageProvider,
    StorageContext,
} from '../types.js';
import { StoragePathResolver } from '../path-resolver.js';

/**
 * File-based storage provider with atomic writes
 */
export class FileStorageProvider<T = any> implements StorageProvider<T> {
    private filePath: string;
    private writeQueue: Promise<void> = Promise.resolve();

    constructor(
        private config: any,
        private context: StorageContext,
        private namespace: string
    ) {
        this.filePath = '';
        this.initialize();
    }

    private async initialize(): Promise<void> {
        const options = this.config || {};
        const filename = `${this.namespace}.${options.format || 'json'}`;
        this.filePath = await StoragePathResolver.resolveStoragePath(
            this.context,
            'data',
            filename
        );
    }

    async get(key: string): Promise<T | undefined> {
        await this.ensureInitialized();

        try {
            const data = await this.readData();
            return data[key] || undefined;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return undefined;
            }
            throw error;
        }
    }

    async set(key: string, value: T, ttl?: number): Promise<void> {
        await this.ensureInitialized();

        this.writeQueue = this.writeQueue.then(async () => {
            const data = await this.readData();
            // For file storage, we ignore TTL for now (could be implemented with metadata)
            data[key] = value;
            await this.writeData(data);
        });

        return this.writeQueue;
    }

    async delete(key: string): Promise<boolean> {
        await this.ensureInitialized();

        let existed = false;
        this.writeQueue = this.writeQueue.then(async () => {
            const data = await this.readData();
            existed = key in data;
            delete data[key];
            await this.writeData(data);
        });

        await this.writeQueue;
        return existed;
    }

    async has(key: string): Promise<boolean> {
        await this.ensureInitialized();

        try {
            const data = await this.readData();
            return key in data;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return false;
            }
            throw error;
        }
    }

    async keys(): Promise<string[]> {
        await this.ensureInitialized();

        try {
            const data = await this.readData();
            return Object.keys(data);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    async clear(): Promise<void> {
        await this.ensureInitialized();

        this.writeQueue = this.writeQueue.then(async () => {
            await this.writeData({});
        });

        return this.writeQueue;
    }

    async close(): Promise<void> {
        await this.writeQueue;
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.filePath) {
            await this.initialize();
        }
    }

    private async readData(): Promise<Record<string, T>> {
        try {
            const content = await fs.readFile(this.filePath, 'utf-8');
            return JSON.parse(content);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return {};
            }
            throw error;
        }
    }

    private async writeData(data: Record<string, T>): Promise<void> {
        // Create backup if enabled
        const options = this.config || {};
        if (options.backup) {
            try {
                await fs.access(this.filePath);
                await fs.copyFile(this.filePath, `${this.filePath}.backup`);
            } catch {
                // File doesn't exist yet, no backup needed
            }
        }

        // Ensure directory exists
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });

        // Atomic write using temporary file
        const tempPath = `${this.filePath}.tmp`;
        const content = JSON.stringify(data, null, 2);

        await fs.writeFile(tempPath, content, 'utf-8');
        await fs.rename(tempPath, this.filePath);

        logger.debug(`File storage updated: ${this.filePath}`);
    }
}

/**
 * File-based collection storage provider (JSONL format)
 */
export class FileCollectionStorageProvider<T = any> implements CollectionStorageProvider<T> {
    private filePath: string;
    private writeQueue: Promise<void> = Promise.resolve();

    constructor(
        private context: StorageContext,
        private namespace: string,
        private options: {
            maxSize?: number;
            backup?: boolean;
        } = {}
    ) {
        this.filePath = '';
        this.initialize();
    }

    private async initialize(): Promise<void> {
        const filename = `${this.namespace}.jsonl`;
        this.filePath = await StoragePathResolver.resolveStoragePath(
            this.context,
            'collections',
            filename
        );
    }

    async getAll(): Promise<T[]> {
        await this.ensureInitialized();

        try {
            const content = await fs.readFile(this.filePath, 'utf-8');
            return content
                .trim()
                .split('\n')
                .filter((line) => line.trim())
                .map((line) => JSON.parse(line));
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    async add(item: T): Promise<void> {
        await this.ensureInitialized();

        this.writeQueue = this.writeQueue.then(async () => {
            // Enforce max size if specified
            if (this.options.maxSize) {
                const items = await this.getAll();
                if (items.length >= this.options.maxSize) {
                    items.shift(); // Remove oldest item
                    items.push(item);
                    await this.writeAll(items);
                    return;
                }
            }

            // Append to file
            const line = JSON.stringify(item) + '\n';
            await fs.appendFile(this.filePath, line, 'utf-8');
        });

        return this.writeQueue;
    }

    async remove(predicate: (item: T) => boolean): Promise<number> {
        await this.ensureInitialized();

        let removedCount = 0;
        this.writeQueue = this.writeQueue.then(async () => {
            const items = await this.getAll();
            const initialLength = items.length;
            const filtered = items.filter((item) => !predicate(item));
            removedCount = initialLength - filtered.length;
            await this.writeAll(filtered);
        });

        await this.writeQueue;
        return removedCount;
    }

    async find(predicate: (item: T) => boolean): Promise<T[]> {
        const items = await this.getAll();
        return items.filter(predicate);
    }

    async clear(): Promise<void> {
        await this.ensureInitialized();

        this.writeQueue = this.writeQueue.then(async () => {
            await this.writeAll([]);
        });

        return this.writeQueue;
    }

    async count(): Promise<number> {
        const items = await this.getAll();
        return items.length;
    }

    async close(): Promise<void> {
        await this.writeQueue;
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.filePath) {
            await this.initialize();
        }
    }

    private async writeAll(items: T[]): Promise<void> {
        // Create backup if enabled
        if (this.options.backup) {
            try {
                await fs.access(this.filePath);
                await fs.copyFile(this.filePath, `${this.filePath}.backup`);
            } catch {
                // File doesn't exist yet, no backup needed
            }
        }

        // Ensure directory exists
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });

        // Write all items as JSONL
        const content =
            items.map((item) => JSON.stringify(item)).join('\n') + (items.length > 0 ? '\n' : '');

        const tempPath = `${this.filePath}.tmp`;
        await fs.writeFile(tempPath, content, 'utf-8');
        await fs.rename(tempPath, this.filePath);

        logger.debug(`Collection storage updated: ${this.filePath}`);
    }
}

/**
 * File-based session storage provider
 */
export class FileSessionStorageProvider<T = any> implements SessionStorageProvider<T> {
    private basePath: string;

    constructor(
        private context: StorageContext,
        private namespace: string,
        private options: {
            sessionTTL?: number;
            backup?: boolean;
        } = {}
    ) {
        this.basePath = '';
        this.initialize();
    }

    private async initialize(): Promise<void> {
        this.basePath = await StoragePathResolver.resolveStoragePath(
            this.context,
            'sessions',
            this.namespace
        );
    }

    async getSession(sessionId: string): Promise<T | undefined> {
        await this.ensureInitialized();

        const sessionPath = path.join(this.basePath, `${sessionId}.json`);

        try {
            const content = await fs.readFile(sessionPath, 'utf-8');
            const sessionData = JSON.parse(content);

            // Check TTL if set
            if (sessionData.expires && Date.now() > sessionData.expires) {
                await this.deleteSession(sessionId);
                return undefined;
            }

            return sessionData.data;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return undefined;
            }
            throw error;
        }
    }

    async setSession(sessionId: string, data: T, ttl?: number): Promise<void> {
        await this.ensureInitialized();

        const sessionPath = path.join(this.basePath, `${sessionId}.json`);
        const effectiveTTL = ttl ?? this.options.sessionTTL;
        const sessionData = {
            data,
            created: Date.now(),
            expires: effectiveTTL ? Date.now() + effectiveTTL : undefined,
        };

        // Create backup if enabled
        if (this.options.backup) {
            try {
                await fs.access(sessionPath);
                await fs.copyFile(sessionPath, `${sessionPath}.backup`);
            } catch {
                // File doesn't exist yet, no backup needed
            }
        }

        // Ensure directory exists
        await fs.mkdir(this.basePath, { recursive: true });

        // Atomic write
        const tempPath = `${sessionPath}.tmp`;
        await fs.writeFile(tempPath, JSON.stringify(sessionData, null, 2), 'utf-8');
        await fs.rename(tempPath, sessionPath);

        logger.debug(`Session storage updated: ${sessionPath}`);
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        await this.ensureInitialized();

        const sessionPath = path.join(this.basePath, `${sessionId}.json`);

        try {
            await fs.unlink(sessionPath);
            return true;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return false;
            }
            throw error;
        }
    }

    async hasSession(sessionId: string): Promise<boolean> {
        const data = await this.getSession(sessionId);
        return data !== undefined;
    }

    async getActiveSessions(): Promise<string[]> {
        await this.ensureInitialized();

        try {
            const files = await fs.readdir(this.basePath);
            const sessions: string[] = [];

            for (const file of files) {
                if (file.endsWith('.json') && !file.endsWith('.backup')) {
                    const sessionId = file.replace('.json', '');
                    // Check if session is still valid
                    if (await this.hasSession(sessionId)) {
                        sessions.push(sessionId);
                    }
                }
            }

            return sessions;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    async cleanupExpired(): Promise<number> {
        const allSessions = await this.getActiveSessions();
        let cleaned = 0;

        for (const sessionId of allSessions) {
            const sessionPath = path.join(this.basePath, `${sessionId}.json`);
            try {
                const content = await fs.readFile(sessionPath, 'utf-8');
                const sessionData = JSON.parse(content);

                if (sessionData.expires && Date.now() > sessionData.expires) {
                    await fs.unlink(sessionPath);
                    cleaned++;
                }
            } catch {
                // Ignore errors, file might have been deleted already
            }
        }

        return cleaned;
    }

    async clear(): Promise<void> {
        await this.ensureInitialized();

        try {
            const files = await fs.readdir(this.basePath);
            await Promise.all(
                files
                    .filter((file) => file.endsWith('.json'))
                    .map((file) => fs.unlink(path.join(this.basePath, file)))
            );
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    async close(): Promise<void> {
        // No cleanup needed for file storage
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.basePath) {
            await this.initialize();
        }
    }
}
