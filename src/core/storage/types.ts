import type { InternalMessage } from '../ai/llm/messages/types.js';

/**
 * Interface for message history storage.
 * Used by the message system to persist conversation history.
 */
export interface HistoryStorage {
    /** Get all messages for a session */
    getMessages(sessionId: string): Promise<InternalMessage[]>;

    /** Add a message to a session */
    addMessage(sessionId: string, message: InternalMessage): Promise<void>;

    /** Clear all messages for a session */
    clearSession(sessionId: string): Promise<void>;
}

/**
 * Re-export simplified storage types
 */
export type {
    CacheBackend,
    DatabaseBackend,
    StorageBackends,
    StorageBackendConfig,
    BackendConfig,
} from './backend/types.js';
