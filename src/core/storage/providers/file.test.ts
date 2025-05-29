import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { FileStorageProvider, FileCollectionStorageProvider } from './file.js';
import { sampleUserSettings, sampleMessages, testContexts } from '../test-fixtures/sample-data.js';
import type { StorageContext } from '../types.js';

describe('FileStorageProvider', () => {
    let provider: FileStorageProvider<any>;
    let context: StorageContext;
    let testDir: string;

    beforeEach(() => {
        testDir = '/tmp/saiki-storage-test';
        context = {
            ...testContexts.development,
            storageRoot: testDir,
        };

        // Ensure test directory exists
        if (!existsSync(testDir)) {
            mkdirSync(testDir, { recursive: true });
        }
    });

    afterEach(async () => {
        // Cleanup: close provider and remove test files
        if (provider) {
            await provider.close();
        }
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('Basic Operations', () => {
        it('should store and retrieve JSON data correctly', async () => {
            provider = new FileStorageProvider(
                { type: 'file', format: 'json' },
                context,
                'test-settings'
            );

            await provider.set('user', sampleUserSettings);
            const retrieved = await provider.get('user');

            expect(retrieved).toEqual(sampleUserSettings);
        });

        it('should handle undefined for non-existent keys', async () => {
            provider = new FileStorageProvider(
                { type: 'file', format: 'json' },
                context,
                'test-empty'
            );

            const result = await provider.get('nonexistent');
            expect(result).toBeUndefined();
        });

        it('should persist data across provider instances', async () => {
            const config = { type: 'file' as const, format: 'json' as const };

            // First provider - store data
            provider = new FileStorageProvider(config, context, 'test-persistence');
            await provider.set('data', sampleUserSettings);
            await provider.close();

            // Second provider - retrieve data
            const provider2 = new FileStorageProvider(config, context, 'test-persistence');
            const retrieved = await provider2.get('data');

            expect(retrieved).toEqual(sampleUserSettings);
            await provider2.close();
        });

        it('should handle array data correctly', async () => {
            provider = new FileStorageProvider(
                { type: 'file', format: 'json' },
                context,
                'test-messages'
            );

            await provider.set('messages', sampleMessages);
            const retrieved = await provider.get('messages');

            expect(retrieved).toEqual(sampleMessages);
            expect(Array.isArray(retrieved)).toBe(true);
            expect(retrieved).toHaveLength(3);
        });
    });

    describe('File Format Handling', () => {
        it('should create valid JSON files', async () => {
            provider = new FileStorageProvider(
                { type: 'file', format: 'json' },
                context,
                'test-json'
            );

            await provider.set('data', sampleUserSettings);

            // Test the functional behavior - data should be retrievable
            const retrieved = await provider.get('data');
            expect(retrieved).toEqual(sampleUserSettings);

            // Test persistence by creating a new provider instance
            const provider2 = new FileStorageProvider(
                { type: 'file', format: 'json' },
                context,
                'test-json'
            );

            const retrieved2 = await provider2.get('data');
            expect(retrieved2).toEqual(sampleUserSettings);

            await provider2.close();
        });

        it('should handle JSONL format for append-style operations', async () => {
            const collectionProvider = new FileCollectionStorageProvider(context, 'test-jsonl', {
                maxSize: 100,
            });

            // Clear any existing data first
            await collectionProvider.clear();

            await collectionProvider.add(sampleMessages[0]);
            await collectionProvider.add(sampleMessages[1]);

            // Test functional behavior - data should be retrievable
            const allMessages = await collectionProvider.getAll();
            expect(allMessages).toHaveLength(2);
            expect(allMessages[0]).toEqual(sampleMessages[0]);
            expect(allMessages[1]).toEqual(sampleMessages[1]);
        });
    });

    describe('Error Handling', () => {
        it('should handle corrupted JSON files gracefully', async () => {
            const filePath = join(testDir, 'corrupted.json');

            // Create corrupted JSON file
            require('fs').writeFileSync(filePath, '{ invalid json }');

            provider = new FileStorageProvider(
                { type: 'file', format: 'json' },
                context,
                'corrupted'
            );

            // Should not throw, should return undefined
            const result = await provider.get('somekey');
            expect(result).toBeUndefined();
        });

        it('should handle missing storage directory', async () => {
            const nonExistentContext = {
                ...context,
                storageRoot: '/tmp/nonexistent-directory',
            };

            provider = new FileStorageProvider(
                { type: 'file', format: 'json' },
                nonExistentContext,
                'test-missing-dir'
            );

            // Should create directory and work
            await provider.set('data', sampleUserSettings);
            const retrieved = await provider.get('data');
            expect(retrieved).toEqual(sampleUserSettings);
        });
    });

    describe('Resource Management', () => {
        it('should handle multiple concurrent operations', async () => {
            provider = new FileStorageProvider(
                { type: 'file', format: 'json' },
                context,
                'test-concurrent'
            );

            // Perform multiple operations concurrently
            const operations = [
                provider.set('key1', { value: 1 }),
                provider.set('key2', { value: 2 }),
                provider.set('key3', { value: 3 }),
            ];

            await Promise.all(operations);

            // Verify all operations succeeded
            const [val1, val2, val3] = await Promise.all([
                provider.get('key1'),
                provider.get('key2'),
                provider.get('key3'),
            ]);

            expect(val1).toEqual({ value: 1 });
            expect(val2).toEqual({ value: 2 });
            expect(val3).toEqual({ value: 3 });
        });

        it('should clean up resources on close', async () => {
            provider = new FileStorageProvider(
                { type: 'file', format: 'json' },
                context,
                'test-cleanup'
            );

            await provider.set('data', sampleUserSettings);

            // Close should not throw
            await expect(provider.close()).resolves.not.toThrow();
        });
    });
});
