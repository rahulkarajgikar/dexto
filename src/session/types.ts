import { InternalMessage } from '../ai/llm/messages/types';

export interface BranchMetadata {
    branchId: string;
    createdAt: Date;
    label?: string;
}

export interface ISessionStore {
    /**
     * Create a new session and return sessionId and initial branchId
     */
    createSession(): Promise<{ sessionId: string; branchId: string }>;

    /**
     * List all branches of a session
     */
    listBranches(sessionId: string): Promise<BranchMetadata[]>;

    /**
     * Retrieve full conversation history for a given session & branch
     */
    getHistory(sessionId: string, branchId: string): Promise<InternalMessage[]>;

    /**
     * Append a single InternalMessage to the session history
     */
    appendMessage(sessionId: string, branchId: string, msg: InternalMessage): Promise<void>;

    /**
     * Create a new branch by slicing history up to (exclusive) the provided index.
     * Throws if index is out of bounds.
     */
    branch(sessionId: string, fromBranchId: string, upToMessageIndex: number): Promise<string>;
}
