import { describe, it, expect } from 'vitest';
import { createStorageManager } from './factory.js';

describe('Storage System Integration', () => {
    it('should create and use storage manager with memory provider', async () => {
        const config = { default: { type: 'memory' as const } };
        const manager = await createStorageManager(config);

        // Get a storage provider
        const provider = await manager.getProvider('test');

        // Test basic operations
        await provider.set('key1', 'value1');
        const result = await provider.get('key1');
        expect(result).toBe('value1');

        // Test existence
        expect(await provider.has('key1')).toBe(true);
        expect(await provider.has('nonexistent')).toBe(false);

        // Test deletion
        const deleted = await provider.delete('key1');
        expect(deleted).toBe(true);
        expect(await provider.has('key1')).toBe(false);
    });

    it('should create collection provider', async () => {
        const config = { default: { type: 'memory' as const } };
        const manager = await createStorageManager(config);

        const provider = await manager.getCollectionProvider('test-collection');

        // Test collection operations
        await provider.add('item1');
        await provider.add('item2');

        const items = await provider.getAll();
        expect(items).toEqual(['item1', 'item2']);

        // Test filtering
        const filtered = await provider.find((item) => item === 'item1');
        expect(filtered).toEqual(['item1']);
    });

    it('should create session provider', async () => {
        const config = { default: { type: 'memory' as const } };
        const manager = await createStorageManager(config);

        const provider = await manager.getSessionProvider('test-session');

        // Test session operations
        await provider.setSession('session1', 'data1');
        const result = await provider.getSession('session1');
        expect(result).toBe('data1');

        // Test TTL operations
        await provider.setSession('session2', 'data2', 100); // 100ms TTL
        expect(await provider.hasSession('session2')).toBe(true);
    });

    it('should handle different storage configurations', async () => {
        const config = {
            default: { type: 'memory' as const },
            sessions: { type: 'memory' as const },
            cache: { type: 'memory' as const },
        };

        const manager = await createStorageManager(config);

        // Test that different namespaces work
        const defaultProvider = await manager.getProvider('default-test');
        const sessionProvider = await manager.getSessionProvider('session-test');

        await defaultProvider.set('key', 'default-value');
        await sessionProvider.setSession('session', 'session-value');

        expect(await defaultProvider.get('key')).toBe('default-value');
        expect(await sessionProvider.getSession('session')).toBe('session-value');
    });
});
