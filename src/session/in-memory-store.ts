import { v4 as uuidv4 } from 'uuid';
import { ISessionStore, BranchMetadata } from './types.js';
import { InternalMessage } from '../ai/llm/messages/types.js';

export class InMemorySessionStore implements ISessionStore {
    private data = new Map<string, Map<string, InternalMessage[]>>();

    async createSession(): Promise<{ sessionId: string; branchId: string }> {
        const sessionId = uuidv4();
        const branchId = uuidv4();
        this.data.set(sessionId, new Map([[branchId, []]]));
        return { sessionId, branchId };
    }

    async listBranches(sessionId: string): Promise<BranchMetadata[]> {
        const branches = this.data.get(sessionId) ?? new Map();
        return [...branches.keys()].map((branchId) => ({
            branchId,
            createdAt: new Date(),
            label: undefined,
        }));
    }

    async getHistory(sessionId: string, branchId: string): Promise<InternalMessage[]> {
        const branches = this.data.get(sessionId);
        if (!branches) throw new Error(`Session not found: ${sessionId}`);
        const history = branches.get(branchId);
        if (!history) throw new Error(`Branch not found: ${branchId}`);
        return [...history];
    }

    async appendMessage(sessionId: string, branchId: string, msg: InternalMessage): Promise<void> {
        const branches = this.data.get(sessionId);
        if (!branches) throw new Error(`Session not found: ${sessionId}`);
        const history = branches.get(branchId);
        if (!history) throw new Error(`Branch not found: ${branchId}`);
        history.push(msg);
    }

    async branch(
        sessionId: string,
        fromBranchId: string,
        upToMessageIndex: number
    ): Promise<string> {
        const branches = this.data.get(sessionId);
        if (!branches) throw new Error(`Session not found: ${sessionId}`);
        const source = branches.get(fromBranchId);
        if (!source) throw new Error(`Branch not found: ${fromBranchId}`);
        if (upToMessageIndex < 0 || upToMessageIndex > source.length) {
            throw new Error(`upToMessageIndex out of bounds: ${upToMessageIndex}`);
        }
        const newBranchId = uuidv4();
        branches.set(newBranchId, source.slice(0, upToMessageIndex));
        return newBranchId;
    }
}
