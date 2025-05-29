import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageManager, createStorageManager } from './factory.js';
import type { StorageContext } from './types.js';

// Mock the providers
vi.mock('./providers/memory.js');
vi.mock('./providers/file.js');
vi.mock('./providers/sqlite.js');

describe('StorageManager', () => {
    let context: StorageContext;
    let manager: StorageManager;

    beforeEach(() => {
        vi.clearAllMocks();
        context = {
            storageRoot: '/tmp/test-storage',
            isDevelopment: true,
            projectRoot: '/tmp/test-project',
            forceGlobal: false,
        };
        // Create manager with a proper config
        const config = { default: { type: 'memory' as const } };
        manager = new StorageManager(config, context);
    });

    describe('provider creation', () => {
        it('should create memory provider by default', async () => {
            const provider = await manager.getProvider('test');
            expect(provider).toBeDefined();
        });

        it('should create collection provider', async () => {
            const provider = await manager.getCollectionProvider('test-collection');
            expect(provider).toBeDefined();
        });

        it('should create session provider', async () => {
            const provider = await manager.getSessionProvider('test-session');
            expect(provider).toBeDefined();
        });
    });

    describe('provider caching', () => {
        it('should cache providers by namespace', async () => {
            const provider1 = await manager.getProvider('test');
            const provider2 = await manager.getProvider('test');
            expect(provider1).toBe(provider2);
        });

        it('should create different providers for different namespaces', async () => {
            const provider1 = await manager.getProvider('test1');
            const provider2 = await manager.getProvider('test2');
            expect(provider1).not.toBe(provider2);
        });
    });
});

describe('createStorageManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create storage manager with simple config', async () => {
        const config = {
            default: { type: 'memory' as const },
        };

        const manager = await createStorageManager(config);
        expect(manager).toBeInstanceOf(StorageManager);
    });

    it('should create storage manager with mixed config', async () => {
        const config = {
            default: { type: 'memory' as const },
            sessions: { type: 'memory' as const, ttl: 3600 },
        };

        const manager = await createStorageManager(config);
        expect(manager).toBeInstanceOf(StorageManager);
    });

    it('should create storage manager with custom context', async () => {
        const config = { default: { type: 'memory' as const } };
        const customContext = {
            storageRoot: '/tmp/custom-storage',
            isDevelopment: false,
            projectRoot: '/tmp/custom-project',
            forceGlobal: false,
        };

        const manager = await createStorageManager(config, customContext);
        expect(manager).toBeInstanceOf(StorageManager);
    });
});
