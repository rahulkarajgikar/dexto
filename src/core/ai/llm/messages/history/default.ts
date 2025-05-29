import type { IConversationHistoryProvider as IConversationHistoryProvider } from './types.js';
import type { CollectionStorageProvider } from '../../../../storage/index.js';
import type { InternalMessage } from '../types.js';
import { logger } from '../../../../logger/index.js';

/**
 * Storage-backed implementation of ConversationHistoryProvider.
 *
 * This is the default implementation that provides persistent storage
 * for conversation history using the unified storage system.
 */
export class HistoryProvider implements IConversationHistoryProvider {
    constructor(
        private storageProvider: CollectionStorageProvider<InternalMessage & { sessionId: string }>
    ) {}

    async getHistory(sessionId: string): Promise<InternalMessage[]> {
        logger.debug(`Getting history for session "${sessionId}"`);

        try {
            // Get all messages for this session
            const sessionMessages = await this.storageProvider.find(
                (message) => message.sessionId === sessionId
            );

            logger.debug(`Found ${sessionMessages.length} messages for session "${sessionId}"`);
            return sessionMessages;
        } catch (error) {
            logger.warn(`Failed to get history for session "${sessionId}":`, error);
            return [];
        }
    }

    async saveMessage(sessionId: string, message: InternalMessage): Promise<void> {
        logger.debug(`Saving message to session "${sessionId}"`);

        try {
            // Add sessionId to the message for storage
            const messageWithSession = {
                ...message,
                sessionId,
            };

            await this.storageProvider.add(messageWithSession);
            logger.debug(`Saved message to session "${sessionId}"`);
        } catch (error) {
            logger.error(`Failed to save message to session "${sessionId}":`, error);
            throw error;
        }
    }

    async clearHistory(sessionId: string): Promise<void> {
        logger.debug(`Clearing history for session "${sessionId}"`);

        try {
            // Remove all messages for this session
            await this.storageProvider.remove((message) => message.sessionId === sessionId);

            logger.debug(`Cleared history for session "${sessionId}"`);
        } catch (error) {
            logger.error(`Failed to clear history for session "${sessionId}":`, error);
            throw error;
        }
    }
}
