import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createStorageManager } from './factory.js';
import type { StorageManager } from './factory.js';
import {
    sampleUserSettings,
    sampleMessages,
    sampleToolPermissions,
    testContexts,
} from './test-fixtures/sample-data.js';
import type { StorageConfig } from './types.js';

describe('Storage Integration Tests', () => {
    let storageManager: StorageManager;
    let testDir: string;

    beforeEach(() => {
        // Use a test directory within the project
        testDir = join(process.cwd(), 'test-temp', 'storage-integration', Date.now().toString());

        // Ensure parent directory exists
        mkdirSync(testDir, { recursive: true });
    });

    afterEach(async () => {
        if (storageManager) {
            await storageManager.close();
        }

        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('StorageManager with Different Providers', () => {
        it('should handle mixed storage backend configuration', async () => {
            const config: Partial<StorageConfig> = {
                default: { type: 'memory' },
                history: { type: 'file', path: `${testDir}/history.json`, format: 'json' },
                userInfo: { type: 'sqlite' },
                allowedTools: { type: 'memory' },
                sessions: { type: 'sqlite' },
                toolCache: { type: 'memory' },
            };

            storageManager = await createStorageManager(config, {
                ...testContexts.development,
                customRoot: testDir,
            });

            // Test each provider type
            const userInfoProvider = await storageManager.getProvider('userInfo');
            const historyProvider = await storageManager.getCollectionProvider('history');
            const toolsProvider = await storageManager.getProvider('allowedTools');
            const sessionsProvider = await storageManager.getSessionProvider('sessions');

            // Store data in each
            await userInfoProvider.set('profile', sampleUserSettings);
            await historyProvider.add(sampleMessages[0]);
            await toolsProvider.set('file_read', true);
            await sessionsProvider.setSession('session1', { userId: 'user1' });

            // Verify data persists correctly
            expect(await userInfoProvider.get('profile')).toEqual(sampleUserSettings);
            expect(await historyProvider.getAll()).toContainEqual(sampleMessages[0]);
            expect(await toolsProvider.get('file_read')).toBe(true);
            expect(await sessionsProvider.hasSession('session1')).toBe(true);
        });

        it('should handle type-safe storage keys', async () => {
            const config: Partial<StorageConfig> = {
                default: { type: 'memory' },
                userInfo: { type: 'memory' },
            };

            storageManager = await createStorageManager(config, testContexts.development);

            // Valid keys should work
            const userInfoProvider = await storageManager.getProvider('userInfo');
            await userInfoProvider.set('profile', sampleUserSettings);

            // Custom keys should work
            const customProvider = await storageManager.getProvider('custom.mydata' as any);
            await customProvider.set('test', { value: 'custom' });

            expect(await userInfoProvider.get('profile')).toEqual(sampleUserSettings);
            expect(await customProvider.get('test')).toEqual({ value: 'custom' });
        });
    });

    describe('Real-World Usage Scenarios', () => {
        it('should handle chat application scenario', async () => {
            const config: Partial<StorageConfig> = {
                default: { type: 'memory' },
                history: { type: 'file', path: `${testDir}/chat-history.json`, format: 'json' },
                userInfo: { type: 'sqlite' },
                sessions: { type: 'sqlite' },
            };

            storageManager = await createStorageManager(config, {
                ...testContexts.development,
                customRoot: testDir,
            });

            // Simulate user login and settings
            const userProvider = await storageManager.getProvider('userInfo');
            await userProvider.set('currentUser', {
                id: 'user123',
                name: 'Test User',
                preferences: sampleUserSettings,
            });

            // Simulate chat session
            const sessionProvider = await storageManager.getSessionProvider('sessions');
            await sessionProvider.setSession('chat-session-1', {
                userId: 'user123',
                startTime: Date.now(),
                metadata: { type: 'chat' },
            });

            // Simulate message history
            const historyProvider = await storageManager.getCollectionProvider('history');

            // Clear any existing data from previous tests
            await historyProvider.clear();

            for (const message of sampleMessages) {
                await historyProvider.add(message);
            }

            // Verify complete workflow
            const user = await userProvider.get('currentUser');
            expect(user).toHaveProperty('id', 'user123');

            const hasSession = await sessionProvider.hasSession('chat-session-1');
            expect(hasSession).toBe(true);

            const sessionData = await sessionProvider.getSession('chat-session-1');
            expect(sessionData).toHaveProperty('userId', 'user123');

            const messages = await historyProvider.getAll();
            expect(messages).toHaveLength(3);
            expect(messages[0]).toHaveProperty('role', 'user');
        });

        it('should handle data persistence across restarts', async () => {
            const config: Partial<StorageConfig> = {
                default: { type: 'file', path: `${testDir}/default.json`, format: 'json' },
                userInfo: { type: 'sqlite' },
            };

            // First "session" - store data
            storageManager = await createStorageManager(config, {
                ...testContexts.development,
                customRoot: testDir,
            });

            const userProvider1 = await storageManager.getProvider('userInfo');
            const defaultProvider1 = await storageManager.getProvider('default');

            await userProvider1.set('profile', sampleUserSettings);
            await defaultProvider1.set('appConfig', { version: '1.0.0', theme: 'dark' });

            await storageManager.close();

            // Second "session" - verify data persists
            storageManager = await createStorageManager(config, {
                ...testContexts.development,
                customRoot: testDir,
            });

            const userProvider2 = await storageManager.getProvider('userInfo');
            const defaultProvider2 = await storageManager.getProvider('default');

            const profile = await userProvider2.get('profile');
            const appConfig = await defaultProvider2.get('appConfig');

            expect(profile).toEqual(sampleUserSettings);
            expect(appConfig).toEqual({ version: '1.0.0', theme: 'dark' });
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle provider initialization failures gracefully', async () => {
            const config: Partial<StorageConfig> = {
                default: { type: 'memory' },
                // Use custom field for invalid file path
                custom: {
                    badPath: { type: 'file', path: '/invalid/readonly/path' },
                },
            };

            storageManager = await createStorageManager(config, testContexts.development);

            // Should still be able to get working providers
            const defaultProvider = await storageManager.getProvider('default');
            await defaultProvider.set('test', { value: 'works' });

            expect(await defaultProvider.get('test')).toEqual({ value: 'works' });
        });

        it('should handle concurrent access to same storage keys', async () => {
            const config: Partial<StorageConfig> = {
                default: { type: 'sqlite' },
            };

            storageManager = await createStorageManager(config, {
                ...testContexts.development,
                customRoot: testDir,
            });

            const provider = await storageManager.getProvider('default');

            // Simulate concurrent operations
            const operations = Array.from({ length: 20 }, (_, i) =>
                provider.set(`concurrent-key-${i}`, { value: i, timestamp: Date.now() })
            );

            await Promise.all(operations);

            // Verify all operations succeeded
            for (let i = 0; i < 20; i++) {
                const value = await provider.get(`concurrent-key-${i}`);
                expect(value).toEqual({ value: i, timestamp: expect.any(Number) });
            }
        });

        it('should handle mixed provider types for same logical data', async () => {
            const config: Partial<StorageConfig> = {
                default: { type: 'memory' },
                history: { type: 'file', path: `${testDir}/mixed-history.json`, format: 'json' },
            };

            storageManager = await createStorageManager(config, {
                ...testContexts.development,
                customRoot: testDir,
            });

            // Use different provider interfaces for related data
            const keyValueProvider = await storageManager.getProvider('history');
            const collectionProvider = await storageManager.getCollectionProvider('history');

            // Both should work with the same underlying storage
            await keyValueProvider.set('metadata', { totalMessages: 0 });
            await collectionProvider.add(sampleMessages[0]);

            const metadata = await keyValueProvider.get('metadata');
            const messages = await collectionProvider.getAll();

            expect(metadata).toEqual({ totalMessages: 0 });
            expect(messages).toContainEqual(sampleMessages[0]);
        });
    });

    describe('Resource Management', () => {
        it('should properly clean up all providers on close', async () => {
            const config: Partial<StorageConfig> = {
                default: { type: 'memory' },
                history: { type: 'file', path: `${testDir}/cleanup-history.json`, format: 'json' },
                userInfo: { type: 'sqlite' },
            };

            storageManager = await createStorageManager(config, {
                ...testContexts.development,
                customRoot: testDir,
            });

            // Initialize multiple providers
            await storageManager.getProvider('default');
            await storageManager.getCollectionProvider('history');
            await storageManager.getSessionProvider('userInfo');

            // Close should not throw
            await expect(storageManager.close()).resolves.not.toThrow();
        });
    });

    describe('SessionManager Integration', () => {
        it('should use storage configuration for session persistence', async () => {
            const config: Partial<StorageConfig> = {
                default: { type: 'memory' },
                sessions: { type: 'sqlite' }, // Sessions will use SQLite for persistence
                history: { type: 'file', path: `${testDir}/history.json`, format: 'json' },
            };

            storageManager = await createStorageManager(config, {
                ...testContexts.development,
                customRoot: testDir,
            });

            // Get the session storage provider that SessionManager would use
            const sessionProvider = await storageManager.getSessionProvider('sessions');

            // Test session storage directly
            const sessionMetadata = {
                createdAt: new Date(),
                lastActivity: new Date(),
                messageCount: 5,
                maxSessions: 100,
                sessionTTL: 3600000,
            };

            // Store session data
            await sessionProvider.setSession('test-session-1', sessionMetadata, 3600000);

            // Verify session exists
            expect(await sessionProvider.hasSession('test-session-1')).toBe(true);

            // Retrieve session data
            const retrievedMetadata = await sessionProvider.getSession('test-session-1');

            // Handle Date serialization - SQLite stores dates as strings
            expect(retrievedMetadata).toBeDefined();
            expect(retrievedMetadata!.messageCount).toBe(sessionMetadata.messageCount);
            expect(retrievedMetadata!.maxSessions).toBe(sessionMetadata.maxSessions);
            expect(retrievedMetadata!.sessionTTL).toBe(sessionMetadata.sessionTTL);

            // Compare dates as timestamps to handle serialization
            expect(new Date(retrievedMetadata!.createdAt).getTime()).toBe(
                sessionMetadata.createdAt.getTime()
            );
            expect(new Date(retrievedMetadata!.lastActivity).getTime()).toBe(
                sessionMetadata.lastActivity.getTime()
            );

            // List active sessions
            const activeSessions = await sessionProvider.getActiveSessions();
            expect(activeSessions).toContain('test-session-1');

            // Clean up
            await sessionProvider.deleteSession('test-session-1');
            expect(await sessionProvider.hasSession('test-session-1')).toBe(false);
        });

        it('should demonstrate different storage backends for sessions', async () => {
            // Test with memory storage for sessions
            const memoryConfig: Partial<StorageConfig> = {
                default: { type: 'memory' },
                sessions: { type: 'memory' },
            };

            const memoryStorageManager = await createStorageManager(
                memoryConfig,
                testContexts.development
            );
            const memorySessionProvider = await memoryStorageManager.getSessionProvider('sessions');

            await memorySessionProvider.setSession('memory-session', { test: 'data' });
            expect(await memorySessionProvider.hasSession('memory-session')).toBe(true);
            await memoryStorageManager.close();

            // Test with file storage for sessions
            const fileConfig: Partial<StorageConfig> = {
                default: { type: 'memory' },
                sessions: { type: 'file', path: `${testDir}/sessions.json`, format: 'json' },
            };

            const fileStorageManager = await createStorageManager(fileConfig, {
                ...testContexts.development,
                customRoot: testDir,
            });
            const fileSessionProvider = await fileStorageManager.getSessionProvider('sessions');

            await fileSessionProvider.setSession('file-session', { test: 'data' });
            expect(await fileSessionProvider.hasSession('file-session')).toBe(true);
            await fileStorageManager.close();

            // Test with SQLite storage for sessions
            const sqliteConfig: Partial<StorageConfig> = {
                default: { type: 'memory' },
                sessions: { type: 'sqlite' },
            };

            storageManager = await createStorageManager(sqliteConfig, {
                ...testContexts.development,
                customRoot: testDir,
            });
            const sqliteSessionProvider = await storageManager.getSessionProvider('sessions');

            await sqliteSessionProvider.setSession('sqlite-session', { test: 'data' });
            expect(await sqliteSessionProvider.hasSession('sqlite-session')).toBe(true);
        });
    });
});
