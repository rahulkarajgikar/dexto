import { describe, it, expect } from 'vitest';
import { StoragePathResolver } from './path-resolver.js';
import os from 'os';

describe('StoragePathResolver', () => {
    describe('resolveStorageRoot', () => {
        it('should resolve to project .saiki in development', async () => {
            const context = {
                storageRoot: '',
                isDevelopment: true,
                projectRoot: '/tmp/test-project',
                forceGlobal: false,
            };

            const result = await StoragePathResolver.resolveStorageRoot(context);
            expect(result).toBe('/tmp/test-project/.saiki');
        });

        it('should resolve to global ~/.saiki in production', async () => {
            const context = {
                storageRoot: '',
                isDevelopment: false,
                projectRoot: '/tmp/test-project-production',
                forceGlobal: false,
            };

            const result = await StoragePathResolver.resolveStorageRoot(context);
            expect(result).toBe(`${os.homedir()}/.saiki`);
        });

        it('should use custom root when provided', async () => {
            const context = {
                storageRoot: '',
                isDevelopment: true,
                projectRoot: '/tmp/test-project',
                customRoot: '/tmp/custom-storage',
                forceGlobal: false,
            };

            const result = await StoragePathResolver.resolveStorageRoot(context);
            expect(result).toBe('/tmp/custom-storage');
        });

        it('should force global when forceGlobal is true', async () => {
            const context = {
                storageRoot: '',
                isDevelopment: true,
                projectRoot: '/tmp/test-project',
                forceGlobal: true,
            };

            const result = await StoragePathResolver.resolveStorageRoot(context);
            expect(result).toBe(`${os.homedir()}/.saiki`);
        });
    });

    describe('createContext', () => {
        it('should create context with defaults', async () => {
            const context = await StoragePathResolver.createContext();

            expect(context.isDevelopment).toBe(true); // NODE_ENV !== 'production'
            expect(context.storageRoot).toBeDefined();
            expect(context.forceGlobal).toBeDefined();
        });

        it('should override development mode', async () => {
            const context = await StoragePathResolver.createContext({
                isDevelopment: false,
            });

            expect(context.isDevelopment).toBe(false);
        });

        it('should use custom project root', async () => {
            const customRoot = '/tmp/test-project-custom';
            const context = await StoragePathResolver.createContext({
                projectRoot: customRoot,
            });

            expect(context.projectRoot).toBe(customRoot);
        });
    });
});
