import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { SQLiteStorageProvider } from './sqlite.js';
import { sampleUserSettings, sampleMessages, testContexts } from '../test-fixtures/sample-data.js';
import type { StorageContext } from '../types.js';

describe('SQLiteStorageProvider', () => {
    let provider: SQLiteStorageProvider<any>;
    let context: StorageContext;
    let testDbPath: string;

    beforeEach(() => {
        const testDir = '/tmp/saiki-sqlite-test';
        testDbPath = join(testDir, 'test.db');
        context = {
            ...testContexts.development,
            storageRoot: testDir,
        };
    });

    afterEach(async () => {
        // Cleanup: close provider and remove test database
        if (provider) {
            await provider.close();
        }
        if (existsSync(testDbPath)) {
            unlinkSync(testDbPath);
        }
    });

    describe('Basic Operations', () => {
        it('should store and retrieve data correctly', async () => {
            provider = new SQLiteStorageProvider({ type: 'sqlite' }, context, 'test-settings');

            await provider.set('user', sampleUserSettings);
            const retrieved = await provider.get('user');

            expect(retrieved).toEqual(sampleUserSettings);
        });

        it('should handle undefined for non-existent keys', async () => {
            provider = new SQLiteStorageProvider({ type: 'sqlite' }, context, 'test-empty');

            const result = await provider.get('nonexistent');
            expect(result).toBeUndefined();
        });

        it('should persist data across provider instances', async () => {
            const config = { type: 'sqlite' as const };

            // First provider - store data
            provider = new SQLiteStorageProvider(config, context, 'test-persistence');
            await provider.set('data', sampleUserSettings);
            await provider.close();

            // Second provider - retrieve data
            const provider2 = new SQLiteStorageProvider(config, context, 'test-persistence');
            const retrieved = await provider2.get('data');

            expect(retrieved).toEqual(sampleUserSettings);
            await provider2.close();
        });

        it('should handle complex data structures', async () => {
            provider = new SQLiteStorageProvider({ type: 'sqlite' }, context, 'test-complex');

            const complexData = {
                messages: sampleMessages,
                settings: sampleUserSettings,
                metadata: {
                    version: 1,
                    created: Date.now(),
                    nested: {
                        deep: {
                            value: 'test',
                        },
                    },
                },
            };

            await provider.set('complex', complexData);
            const retrieved = await provider.get('complex');

            expect(retrieved).toEqual(complexData);
        });
    });

    describe('Database Operations', () => {
        it('should handle multiple keys in same table', async () => {
            provider = new SQLiteStorageProvider({ type: 'sqlite' }, context, 'test-multi');

            await provider.set('key1', { value: 1 });
            await provider.set('key2', { value: 2 });
            await provider.set('key3', { value: 3 });

            const keys = await provider.keys();
            expect(keys.sort()).toEqual(['key1', 'key2', 'key3']);

            const val1 = await provider.get('key1');
            const val2 = await provider.get('key2');
            const val3 = await provider.get('key3');

            expect(val1).toEqual({ value: 1 });
            expect(val2).toEqual({ value: 2 });
            expect(val3).toEqual({ value: 3 });
        });

        it('should handle key existence checks correctly', async () => {
            provider = new SQLiteStorageProvider({ type: 'sqlite' }, context, 'test-exists');

            expect(await provider.has('nonexistent')).toBe(false);

            await provider.set('existing', { value: 'test' });
            expect(await provider.has('existing')).toBe(true);
        });

        it('should handle key deletion', async () => {
            provider = new SQLiteStorageProvider({ type: 'sqlite' }, context, 'test-delete');

            await provider.set('toDelete', { value: 'test' });
            expect(await provider.has('toDelete')).toBe(true);

            const deleted = await provider.delete('toDelete');
            expect(deleted).toBe(true);
            expect(await provider.has('toDelete')).toBe(false);

            // Deleting non-existent key should return false
            const deletedAgain = await provider.delete('toDelete');
            expect(deletedAgain).toBe(false);
        });

        it('should handle table clearing', async () => {
            provider = new SQLiteStorageProvider({ type: 'sqlite' }, context, 'test-clear');

            await provider.set('key1', { value: 1 });
            await provider.set('key2', { value: 2 });

            let keys = await provider.keys();
            expect(keys).toHaveLength(2);

            await provider.clear();

            keys = await provider.keys();
            expect(keys).toHaveLength(0);
        });
    });

    describe('TTL Functionality', () => {
        it('should handle TTL expiration', async () => {
            provider = new SQLiteStorageProvider({ type: 'sqlite' }, context, 'test-ttl');

            // Set with 100ms TTL
            await provider.set('tempKey', { value: 'temporary' }, 100);

            // Should exist immediately
            expect(await provider.has('tempKey')).toBe(true);

            // Wait for expiration
            await new Promise((resolve) => setTimeout(resolve, 150));

            // Should be expired and return undefined
            expect(await provider.get('tempKey')).toBeUndefined();
            expect(await provider.has('tempKey')).toBe(false);
        });

        it('should handle mixed TTL and permanent data', async () => {
            provider = new SQLiteStorageProvider({ type: 'sqlite' }, context, 'test-mixed-ttl');

            // Set permanent data
            await provider.set('permanent', { value: 'forever' });

            // Set temporary data
            await provider.set('temporary', { value: 'temp' }, 100);

            // Wait for temporary to expire
            await new Promise((resolve) => setTimeout(resolve, 150));

            // Permanent should still exist, temporary should not
            expect(await provider.get('permanent')).toEqual({ value: 'forever' });
            expect(await provider.get('temporary')).toBeUndefined();
        });

        it('should use default TTL from config', async () => {
            provider = new SQLiteStorageProvider(
                { type: 'sqlite', ttl: 100 }, // 100ms default TTL
                context,
                'test-default-ttl'
            );

            // Set data without explicit TTL - should use config default
            await provider.set('defaultTTL', { value: 'uses config ttl' });

            // Should exist immediately
            expect(await provider.get('defaultTTL')).toEqual({ value: 'uses config ttl' });

            // Wait for expiration
            await new Promise((resolve) => setTimeout(resolve, 150));

            // Should be expired due to config default TTL
            expect(await provider.get('defaultTTL')).toBeUndefined();
        });
    });

    describe('Error Handling', () => {
        it('should handle database creation in non-existent directory', async () => {
            const invalidContext = {
                ...context,
                storageRoot: '/tmp/nonexistent-sqlite-dir',
            };

            provider = new SQLiteStorageProvider(
                { type: 'sqlite' },
                invalidContext,
                'test-auto-create'
            );

            // Should create directory and work
            await provider.set('data', sampleUserSettings);
            const retrieved = await provider.get('data');
            expect(retrieved).toEqual(sampleUserSettings);
        });

        it('should handle concurrent operations', async () => {
            provider = new SQLiteStorageProvider({ type: 'sqlite' }, context, 'test-concurrent');

            // Perform multiple operations concurrently
            const operations = Array.from({ length: 10 }, (_, i) =>
                provider.set(`key${i}`, { value: i })
            );

            await Promise.all(operations);

            // Verify all operations succeeded
            const keys = await provider.keys();
            expect(keys).toHaveLength(10);

            // Verify data integrity
            for (let i = 0; i < 10; i++) {
                const value = await provider.get(`key${i}`);
                expect(value).toEqual({ value: i });
            }
        });
    });

    describe('Resource Management', () => {
        it('should clean up database connection on close', async () => {
            provider = new SQLiteStorageProvider({ type: 'sqlite' }, context, 'resource-test');

            await provider.set('data', sampleUserSettings);
            await provider.close();

            // The database file should be in the sqlite subdirectory
            const expectedDbPath = join(context.storageRoot, 'sqlite', 'resource-test.db');

            // File should still exist (data persisted)
            expect(existsSync(expectedDbPath)).toBe(true);
        });

        it('should handle operations after close gracefully', async () => {
            provider = new SQLiteStorageProvider({ type: 'sqlite' }, context, 'post-close-test');

            await provider.set('data', sampleUserSettings);
            await provider.close();

            // SQLite provider should reinitialize connection if needed after close
            // This is the intended behavior for resilience
            const result = await provider.get('data');
            expect(result).toEqual(sampleUserSettings);

            // Should be able to set new data too
            await provider.set('newData', { test: 'value' });
            const newResult = await provider.get('newData');
            expect(newResult).toEqual({ test: 'value' });
        });
    });
});
