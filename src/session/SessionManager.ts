import { ILLMService } from '../ai/llm/services/types';
import { MessageManager } from '../ai/llm/messages/manager';
import { ISessionStore, BranchMetadata } from './types';
import { IFormatter, ITokenizer } from '../ai/llm/messages/formatters/types';

/**
 * Orchestrates session lifecycle, history replay, branching, and delta persistence.
 */
export class SessionManager {
    constructor(
        private store: ISessionStore,
        private createLLMService: () => ILLMService,
        private formatterFactory: (tokenizer: ITokenizer) => IFormatter,
        private tokenizer: ITokenizer
    ) {}

    /** Create a new session and return sessionId + branchId */
    async start(): Promise<{ sessionId: string; branchId: string }> {
        return this.store.createSession();
    }

    /**
     * Send a user message, replay history, and persist deltas.
     * Returns the branchId (unchanged) and LLM response text.
     */
    async sendMessage(
        sessionId: string,
        branchId: string,
        userText: string
    ): Promise<{ branchId: string; response: string }> {
        const history = await this.store.getHistory(sessionId, branchId);

        // instantiate a fresh MessageManager per branch
        const formatter = this.formatterFactory(this.tokenizer);
        const mgr = new MessageManager(
            formatter,
            /*toolProviders*/ [],
            /*maxTokens*/ 8192,
            this.tokenizer
        );

        // replay prior messages into manager
        history.forEach((m) => mgr.addMessage(m));
        mgr.addUserMessage(userText);

        const llm = this.createLLMService();
        // completeTask invokes LLM with context from MessageManager internally
        const reply = await llm.completeTask(userText);

        mgr.processLLMResponse(reply);
        const newMsgs = mgr.getHistory().slice(history.length);
        for (const msg of newMsgs) {
            await this.store.appendMessage(sessionId, branchId, msg);
        }

        return { branchId, response: reply };
    }

    /** Create a new branch by slicing history up to (exclusive) the provided index */
    async branch(
        sessionId: string,
        fromBranchId: string,
        upToMessageIndex: number
    ): Promise<string> {
        return this.store.branch(sessionId, fromBranchId, upToMessageIndex);
    }

    /** List all branch metadata for a session */
    async listBranches(sessionId: string): Promise<BranchMetadata[]> {
        return this.store.listBranches(sessionId);
    }
}
