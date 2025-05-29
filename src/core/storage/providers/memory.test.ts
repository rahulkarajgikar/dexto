import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from './memory.js';
import type { StorageContext } from '../types.js';

describe('MemoryStorageProvider', () => {
    let provider: MemoryStorageProvider<string>;
    let context: StorageContext;

    beforeEach(() => {
        context = {
            storageRoot: '/tmp/test',
            isDevelopment: true,
            projectRoot: '/tmp/test/project',
            forceGlobal: false,
        };
        provider = new MemoryStorageProvider({}, context, 'test');
    });

    describe('basic operations', () => {
        it('should store and retrieve values', async () => {
            await provider.set('key1', 'value1');
            const result = await provider.get('key1');
            expect(result).toBe('value1');
        });

        it('should return undefined for non-existent keys', async () => {
            const result = await provider.get('nonexistent');
            expect(result).toBeUndefined();
        });

        it('should check key existence', async () => {
            await provider.set('key1', 'value1');
            expect(await provider.has('key1')).toBe(true);
            expect(await provider.has('nonexistent')).toBe(false);
        });

        it('should delete keys', async () => {
            await provider.set('key1', 'value1');
            expect(await provider.has('key1')).toBe(true);

            const deleted = await provider.delete('key1');
            expect(deleted).toBe(true);
            expect(await provider.has('key1')).toBe(false);
        });

        it('should return false when deleting non-existent keys', async () => {
            const deleted = await provider.delete('nonexistent');
            expect(deleted).toBe(false);
        });

        it('should list all keys', async () => {
            await provider.set('key1', 'value1');
            await provider.set('key2', 'value2');

            const keys = await provider.keys();
            expect(keys.sort()).toEqual(['key1', 'key2']);
        });

        it('should clear all data', async () => {
            await provider.set('key1', 'value1');
            await provider.set('key2', 'value2');

            await provider.clear();
            const keys = await provider.keys();
            expect(keys).toEqual([]);
        });
    });

    describe('TTL functionality', () => {
        it('should handle TTL expiration', async () => {
            const providerWithTTL = new MemoryStorageProvider(
                { ttl: 100 }, // 100ms TTL
                context,
                'test-ttl'
            );

            await providerWithTTL.set('key1', 'value1', 50); // 50ms TTL
            expect(await providerWithTTL.get('key1')).toBe('value1');

            // Wait for expiration
            await new Promise((resolve) => setTimeout(resolve, 60));
            expect(await providerWithTTL.get('key1')).toBeUndefined();
        });
    });
});
