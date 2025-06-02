import { StorageBackend } from '../backend/types.js';

/**
 * Append-only message storage pattern.
 * Optimized for chat message history with efficient append and range queries.
 * Uses list operations for performance and supports pagination.
 */
export class MessageStore {
    constructor(private backend: StorageBackend) {}

    /**
     * Add a new message to a conversation/session
     */
    async addMessage<T>(conversationId: string, message: T): Promise<void> {
        const listKey = this.getListKey(conversationId);
        const timestampedMessage = {
            ...message,
            timestamp: Date.now(),
            id: this.generateMessageId(),
        };

        await this.backend.lpush(listKey, timestampedMessage);
    }

    /**
     * Add multiple messages at once (batch operation)
     */
    async addMessages<T>(conversationId: string, messages: T[]): Promise<void> {
        const listKey = this.getListKey(conversationId);

        // Add timestamp and ID to each message and push in reverse order
        // (since lpush adds to the beginning, we want newest first)
        for (let i = messages.length - 1; i >= 0; i--) {
            const timestampedMessage = {
                ...messages[i],
                timestamp: Date.now(),
                id: this.generateMessageId(),
            };
            await this.backend.lpush(listKey, timestampedMessage);
        }
    }

    /**
     * Get recent messages (most recent first)
     */
    async getRecentMessages<T>(conversationId: string, count: number = 50): Promise<T[]> {
        const listKey = this.getListKey(conversationId);
        return await this.backend.lrange<T>(listKey, 0, count - 1);
    }

    /**
     * Get messages in a specific range (for pagination)
     * @param start - Starting index (0-based)
     * @param end - Ending index (inclusive)
     */
    async getMessageRange<T>(conversationId: string, start: number, end: number): Promise<T[]> {
        const listKey = this.getListKey(conversationId);
        return await this.backend.lrange<T>(listKey, start, end);
    }

    /**
     * Get all messages for a conversation
     */
    async getAllMessages<T>(conversationId: string): Promise<T[]> {
        const listKey = this.getListKey(conversationId);
        const count = await this.getMessageCount(conversationId);
        return await this.backend.lrange<T>(listKey, 0, count - 1);
    }

    /**
     * Get the total number of messages in a conversation
     */
    async getMessageCount(conversationId: string): Promise<number> {
        const listKey = this.getListKey(conversationId);
        return await this.backend.llen(listKey);
    }

    /**
     * Get paginated messages
     * @param page - Page number (1-based)
     * @param pageSize - Number of messages per page
     */
    async getMessagePage<T>(
        conversationId: string,
        page: number = 1,
        pageSize: number = 50
    ): Promise<{ messages: T[]; hasMore: boolean; total: number }> {
        const total = await this.getMessageCount(conversationId);
        const start = (page - 1) * pageSize;
        const end = start + pageSize - 1;

        const messages = await this.getMessageRange<T>(conversationId, start, end);
        const hasMore = end < total - 1;

        return { messages, hasMore, total };
    }

    /**
     * Search messages by text content (simple text search)
     */
    async searchMessages<T extends { content?: string; text?: string; message?: string }>(
        conversationId: string,
        searchTerm: string,
        maxResults: number = 100
    ): Promise<T[]> {
        const allMessages = await this.getAllMessages<T>(conversationId);
        const lowerSearchTerm = searchTerm.toLowerCase();

        return allMessages
            .filter((msg) => {
                const content = msg.content || msg.text || msg.message || '';
                return (
                    typeof content === 'string' && content.toLowerCase().includes(lowerSearchTerm)
                );
            })
            .slice(0, maxResults);
    }

    /**
     * Get messages within a time range
     */
    async getMessagesByTimeRange<T extends { timestamp?: number }>(
        conversationId: string,
        startTime: number,
        endTime: number
    ): Promise<T[]> {
        const allMessages = await this.getAllMessages<T>(conversationId);

        return allMessages.filter((msg) => {
            const timestamp = msg.timestamp || 0;
            return timestamp >= startTime && timestamp <= endTime;
        });
    }

    /**
     * Get messages from the last N hours
     */
    async getRecentMessagesByHours<T>(conversationId: string, hours: number): Promise<T[]> {
        const now = Date.now();
        const startTime = now - hours * 60 * 60 * 1000;
        return await this.getMessagesByTimeRange<T>(conversationId, startTime, now);
    }

    /**
     * Trim old messages, keeping only the most recent N messages
     */
    async trimToRecentMessages(conversationId: string, keepCount: number): Promise<void> {
        const listKey = this.getListKey(conversationId);
        await this.backend.ltrim(listKey, 0, keepCount - 1);
    }

    /**
     * Delete all messages for a conversation
     */
    async clearConversation(conversationId: string): Promise<void> {
        const listKey = this.getListKey(conversationId);
        await this.backend.delete(listKey);

        // Also clear metadata
        const metaKey = this.getMetaKey(conversationId);
        await this.backend.delete(metaKey);
    }

    /**
     * Get conversation metadata (creation time, last message time, etc.)
     */
    async getConversationMeta(conversationId: string): Promise<{
        createdAt?: number;
        lastMessageAt?: number;
        messageCount: number;
    }> {
        const metaKey = this.getMetaKey(conversationId);
        const meta = (await this.backend.get<any>(metaKey)) || {};
        const messageCount = await this.getMessageCount(conversationId);

        return {
            createdAt: meta.createdAt,
            lastMessageAt: meta.lastMessageAt,
            messageCount,
        };
    }

    /**
     * Update conversation metadata
     */
    async updateConversationMeta(
        conversationId: string,
        updates: {
            createdAt?: number;
            lastMessageAt?: number;
        }
    ): Promise<void> {
        const metaKey = this.getMetaKey(conversationId);
        const current = (await this.backend.get<any>(metaKey)) || {};
        const merged = { ...current, ...updates };
        await this.backend.set(metaKey, merged);
    }

    /**
     * Get all conversation IDs that have messages
     */
    async getAllConversations(): Promise<string[]> {
        const pattern = 'messages:*';
        const keys = await this.backend.keys(pattern);

        const conversationIds = new Set<string>();
        keys.forEach((key) => {
            const match = key.match(/^messages:([^:]+)$/);
            if (match) {
                conversationIds.add(match[1]);
            }
        });

        return Array.from(conversationIds);
    }

    /**
     * Get conversation summary (recent message count, last activity)
     */
    async getConversationSummary(): Promise<
        Array<{
            conversationId: string;
            messageCount: number;
            lastMessageAt?: number;
            createdAt?: number;
        }>
    > {
        const conversationIds = await this.getAllConversations();

        const summaries = await Promise.all(
            conversationIds.map(async (conversationId) => {
                const meta = await this.getConversationMeta(conversationId);
                return {
                    conversationId,
                    ...meta,
                };
            })
        );

        // Sort by last activity
        return summaries.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    }

    /**
     * Check if a conversation exists (has any messages)
     */
    async conversationExists(conversationId: string): Promise<boolean> {
        const count = await this.getMessageCount(conversationId);
        return count > 0;
    }

    /**
     * Export all messages for a conversation (for backup/analysis)
     */
    async exportConversation<T>(conversationId: string): Promise<{
        conversationId: string;
        meta: any;
        messages: T[];
        exportedAt: number;
    }> {
        const meta = await this.getConversationMeta(conversationId);
        const messages = await this.getAllMessages<T>(conversationId);

        return {
            conversationId,
            meta,
            messages,
            exportedAt: Date.now(),
        };
    }

    // Private utility methods
    private getListKey(conversationId: string): string {
        return `messages:${conversationId}`;
    }

    private getMetaKey(conversationId: string): string {
        return `messages:${conversationId}:meta`;
    }

    private generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
