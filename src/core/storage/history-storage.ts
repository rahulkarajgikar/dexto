import type { HistoryStorage } from './types.js';
import type { DatabaseBackend } from './backend/types.js';
import type { InternalMessage } from '../ai/llm/messages/types.js';
import { logger } from '../logger/index.js';

/**
 * History storage implementation using the DatabaseBackend.
 * Stores conversation messages using the database backend's list operations.
 */
export class DatabaseHistoryStorage implements HistoryStorage {
    constructor(private database: DatabaseBackend) {}

    async getMessages(sessionId: string): Promise<InternalMessage[]> {
        const key = this.getMessagesKey(sessionId);
        try {
            // Get all messages for this session (most recent first from append operations)
            const messages = await this.database.getRange<InternalMessage>(key, 0, 1000);
            // Reverse to get chronological order (oldest first)
            const chronologicalMessages = messages.reverse();

            logger.debug(
                `DatabaseHistoryStorage: Retrieved ${chronologicalMessages.length} messages for session ${sessionId}`
            );

            return chronologicalMessages;
        } catch (error) {
            logger.error(
                `DatabaseHistoryStorage: Error retrieving messages for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
            );
            return [];
        }
    }

    async addMessage(sessionId: string, message: InternalMessage): Promise<void> {
        const key = this.getMessagesKey(sessionId);
        try {
            // Store the message as-is (InternalMessage doesn't have timestamp)
            await this.database.append(key, message);

            // Create safe content preview for logging
            let contentPreview = '[no content]';
            if (message.content) {
                if (typeof message.content === 'string') {
                    contentPreview =
                        message.content.length > 100
                            ? `${message.content.substring(0, 100)}...`
                            : message.content;
                } else if (Array.isArray(message.content)) {
                    contentPreview = `[${message.content.length} parts]`;
                }
            }

            logger.debug(`DatabaseHistoryStorage: Added message to session ${sessionId}`, {
                role: message.role,
                content: contentPreview,
            });
        } catch (error) {
            logger.error(
                `DatabaseHistoryStorage: Error adding message to session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
            );
            throw new Error(
                `Failed to save message: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    async clearSession(sessionId: string): Promise<void> {
        const key = this.getMessagesKey(sessionId);
        try {
            await this.database.delete(key);

            logger.debug(`DatabaseHistoryStorage: Cleared session ${sessionId}`);
        } catch (error) {
            logger.error(
                `DatabaseHistoryStorage: Error clearing session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
            );
            throw new Error(
                `Failed to clear session: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private getMessagesKey(sessionId: string): string {
        return `messages:${sessionId}`;
    }
}

/**
 * Create a HistoryStorage instance using the provided database backend
 */
export function createHistoryStorage(database: DatabaseBackend): HistoryStorage {
    return new DatabaseHistoryStorage(database);
}
