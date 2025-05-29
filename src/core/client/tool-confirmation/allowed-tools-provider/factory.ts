import { AllowedToolsProvider } from './default.js';
import { InMemoryAllowedToolsProvider } from './in-memory.js';
import type { IAllowedToolsProvider as IAllowedToolsProvider } from './types.js';
import type { StorageProvider } from '../../../storage/index.js';

export interface AllowedToolsConfig {
    type: 'storage' | 'memory';
    storageProvider?: StorageProvider<boolean>;
}

/**
 * Create an AllowedToolsProvider based on configuration.
 *
 * The default is now storage-based for persistence.
 * Memory-based provider is available for testing or special cases.
 */
export function createAllowedToolsProvider(config: AllowedToolsConfig): IAllowedToolsProvider {
    switch (config.type) {
        case 'storage':
            if (!config.storageProvider) {
                throw new Error(
                    'Storage provider is required for storage-based AllowedToolsProvider'
                );
            }
            return new AllowedToolsProvider(config.storageProvider);

        case 'memory':
            return new InMemoryAllowedToolsProvider();

        default:
            throw new Error(`Unknown AllowedToolsProvider type: ${(config as any).type}`);
    }
}

/**
 * Create an AllowedToolsProvider with a storage provider.
 * This is the recommended approach for production use.
 */
export function createAllowedToolsProviderWithStorage(
    storageProvider: StorageProvider<boolean>
): IAllowedToolsProvider {
    return new AllowedToolsProvider(storageProvider);
}
