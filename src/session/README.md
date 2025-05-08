# Session Management

This module provides a high-level `SessionManager` API to handle conversation sessions, history replay, branching, and persistence.

## Overview

- `SessionManager.start()` → Creates a new session and returns `{ sessionId: string; branchId: string }`
- `SessionManager.sendMessage(sessionId, branchId, text)` → Sends a user message, replays history, and returns `{ branchId: string; response: string }`
- `SessionManager.branch(sessionId, branchId, index)` → Forks the conversation up to (exclusive) `index` and returns a new `branchId`
- `SessionManager.listBranches(sessionId)` → Lists all branches with metadata (`branchId`, `createdAt`, `label?`)

## Example Usage

```ts
import { SessionManager } from './SessionManager';
import { InMemorySessionStore } from './in-memory-store';

async function demo() {
  const store = new InMemorySessionStore();
  const sessionManager = new SessionManager(
    store,
    () => /* provide an ILLMService instance */,
    tokenizer => /* provide an IMessageFormatter for this tokenizer */,
    /* provide ITokenizer */
  );

  // 1. Start a new session
  const { sessionId, branchId } = await sessionManager.start();

  // 2. Send a message
  const { response } = await sessionManager.sendMessage(sessionId, branchId, 'Hello, world!');
  console.log('Assistant:', response);

  // 3. Fork the conversation at the first user turn
  const newBranchId = await sessionManager.branch(sessionId, branchId, 1);

  // 4. List all branches
  const branches = await sessionManager.listBranches(sessionId);
  console.table(branches);
}

demo();
``` 