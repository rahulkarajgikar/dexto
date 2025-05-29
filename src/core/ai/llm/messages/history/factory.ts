import type { IConversationHistoryProvider } from './types.js';
import { InMemoryHistoryProvider } from './in-memory.js';
import { HistoryProvider } from './default.js';
import { FileHistoryProvider } from './file.js';
import type { CollectionStorageProvider } from '../../../../storage/index.js';
import type { InternalMessage } from '../types.js';

export interface HistoryProviderConfig {
    type: 'storage' | 'memory' | 'file';
    storageProvider?: CollectionStorageProvider<InternalMessage & { sessionId: string }>;
    filePath?: string;
}

/**
 * Create a ConversationHistoryProvider based on configuration.
 *
 * The default is now storage-based for persistence.
 * Other providers are available for specific use cases.
 */
export function createHistoryProvider(config: HistoryProviderConfig): IConversationHistoryProvider {
    switch (config.type) {
        case 'storage':
            if (!config.storageProvider) {
                throw new Error('Storage provider is required for storage-based HistoryProvider');
            }
            return new HistoryProvider(config.storageProvider);

        case 'memory':
            return new InMemoryHistoryProvider();

        case 'file':
            return new FileHistoryProvider(config.filePath);

        default:
            throw new Error(`Unknown HistoryProvider type: ${(config as any).type}`);
    }
}

/**
 * Create a HistoryProvider with a storage provider.
 * This is the recommended approach for production use.
 */
export function createHistoryProviderWithStorage(
    storageProvider: CollectionStorageProvider<InternalMessage & { sessionId: string }>
): IConversationHistoryProvider {
    return new HistoryProvider(storageProvider);
}
