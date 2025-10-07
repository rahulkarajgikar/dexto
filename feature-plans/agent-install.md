# Feature Plan: Custom Agent Installation & Management

**Status:** In Progress (Phase 5 Complete, 83% done)
**Owner:** TBD
**Created:** 2025-01-06
**Updated:** 2025-10-07
**Target:** v0.x.0

## Overview

Enable users to create, install, and manage custom agents alongside the curated registry agents. This includes both CLI and UI workflows, with a user-friendly form-based editor alongside the existing YAML editor.

## Current Status

**✅ Completed (Phases 0-5):**
- Phase 0: Two-tier registry foundation (14 tests)
- Phase 1: Core registry & custom agent installation (55 tests)
- Phase 2: CLI commands for custom agents (50 tests)
- Phase 3: Basic API & UI integration - Custom agents visible in UI
- Phase 4: Form Editor Foundation - LLM + System Prompt editing
- Phase 5: Form Editor Advanced Sections - MCP, Storage, Tool Confirmation

**🚧 Current Capabilities:**
- ✅ Install single-file custom agents: `dexto install ./my-agent.yml`
- ✅ Interactive prompts for metadata (name, description, author, tags)
- ✅ List agents grouped by type (builtin/custom) in CLI and UI
- ✅ Uninstall with default agent protection
- ✅ Name conflict validation
- ✅ Custom agents visible in AgentSelector with type badges
- ✅ Switch between custom and builtin agents in UI
- ✅ Edit agents via form editor (LLM, System Prompt, MCP Servers, Storage, Tool Confirmation)
- ✅ Toggle between Form and YAML editors
- ✅ Field-level validation with error messages and tooltips
- ✅ YAML comment preservation during form edits
- ✅ Advanced features detection (shows warning when config too complex for form)
- ✅ Organized AgentEditor/ component structure

**⏸️ Pending:**
- Phase 6: Agent Creation Wizard (next up)
- Phase 7: Directory-based agents
- Phase 8: Polish & enhancement

## Problem Statement

Currently, users can only use agents from the curated registry. Power users want to:
1. Install their own custom agent configurations from local files
2. Create and manage custom agents through the UI
3. Share custom agents with teammates or across projects
4. Edit agents using forms without needing to know YAML syntax

## Goals

1. **CLI Installation:** `dexto install ./my-agent.yml` installs custom agents
2. **Seamless Usage:** `dexto -a my-custom-agent` works like registry agents
3. **UI Integration:** Custom agents appear in AgentSelector, can be switched/edited
4. **User-Friendly Editing:** Form-based editor for non-technical users
5. **Guided Creation:** Wizard for creating new custom agents in UI

## Non-Goals

- Agent marketplace/sharing platform (future)
- Version control for agents (future)
- Remote agent URLs (future)
- Agent templates library (start with 2-3 basic templates)

## Architecture

### Two-Tier Registry System

**Bundled Registry** (read-only, ships with Dexto):
```
/agents/agent-registry.json
```

**User Registry** (writable, on user's machine):
```
~/.dexto/agent-registry.json
```

**All Installed Agents** (single directory):
```
~/.dexto/agents/
├── default-agent/      # From bundled registry
├── database-agent/     # From bundled registry
└── my-coding-agent/    # From user registry (custom)
```

At runtime, both registries are merged. **Agent names must be unique across both registries** - custom agents cannot have the same name as bundled agents.

**Important:** User registry only contains custom agents. Builtin agents are NOT added to user registry when installed - installation state is tracked by filesystem presence in `~/.dexto/agents/`.

### Registry Entry Schema

Both bundled and user registries use the same structure:

```typescript
// In agent-registry.json
{
  "version": "1.0.0",
  "agents": {
    "agent-name": {
      "description": string;
      "author": string;
      "tags": string[];
      "source": string;          // "agent-name/" or "agent.yml"
      "main"?: string;            // Required if source is directory
      "type": "builtin" | "custom";  // NEW
    }
  }
}
```

**Examples:**

Bundled registry entry:
```json
{
  "default-agent": {
    "description": "Default Dexto agent",
    "author": "Truffle AI",
    "tags": ["default", "filesystem"],
    "source": "default-agent.yml",
    "type": "builtin"
  }
}
```

User registry entry (custom agent):
```json
{
  "my-coding-agent": {
    "description": "Custom coding agent",
    "author": "John Doe",
    "tags": ["coding", "custom"],
    "source": "my-coding-agent/",
    "main": "agent.yml",
    "type": "custom"
  }
}
```

### How Registry Merging Works

```
Bundled Registry (agents/agent-registry.json):
{
  "default-agent": { type: "builtin", ... },
  "database-agent": { type: "builtin", ... }
}

User Registry (~/.dexto/agent-registry.json):
{
  "my-coding-agent": { type: "custom", ... },
  "my-research-agent": { type: "custom", ... }
}

Merged View at Runtime:
{
  "default-agent": { type: "builtin", ... },      // from bundled
  "database-agent": { type: "builtin", ... },     // from bundled
  "my-coding-agent": { type: "custom", ... },     // from user
  "my-research-agent": { type: "custom", ... }    // from user
}

Installation State (checked via filesystem):
~/.dexto/agents/
├── default-agent/      ✓ installed (builtin)
├── my-coding-agent/    ✓ installed (custom)
└── my-research-agent/  ✓ installed (custom)
(database-agent is available but not installed)
```

### Agent Resolution Priority

```
1. Explicit file path: dexto -a ./my-agent.yml
2. Merged registry lookup: dexto -a my-coding-agent
   - Single merged view of all agents (bundled + custom)
   - Names are guaranteed unique (validated at install time)
3. Preferences default: dexto (no -a flag)
```

## Implementation Phases

### Phase 0: Foundation ✅ COMPLETE

**Goal:** Infrastructure and types for two-tier registry

**Tasks:**
- [x] Add `type: "builtin" | "custom"` field to `AgentRegistryEntrySchema`
- [x] Make `type` field optional with default `"builtin"` (backwards compat)
- [x] Create user registry utilities (`user-registry.ts`):
  - `loadUserRegistry()` - Load `~/.dexto/agent-registry.json`, return empty if not exists
  - `saveUserRegistry()` - Write user registry atomically
  - `mergeRegistries()` - Merge bundled + user registries (user for custom only)
  - `addAgentToUserRegistry()` - Add custom agent entry with `type: "custom"`
  - `removeAgentFromUserRegistry()` - Remove custom agent entry
  - `userRegistryHasAgent()` - Check if agent exists in user registry
- [x] Write unit tests for user registry utilities (14 tests)

**Note:** User registry only contains custom agents. Builtin agents are never added to user registry.

**Files modified:**
- `packages/core/src/agent/registry/types.ts` - Added `type` field
- `packages/core/src/agent/registry/user-registry.ts` - User registry utilities (NEW)
- `packages/core/src/agent/registry/user-registry.test.ts` - Unit tests (NEW)

**Deliverable:** ✅ User registry utilities tested (14 tests passing), registry types updated

**Commit:** `feat(agent-registry): implement two-tier registry foundation`

---

### Phase 1: Core Registry & Resolution ✅ COMPLETE

**Goal:** Extend existing registry to support user registry and custom agent installation

**Tasks:**
- [x] Update `LocalAgentRegistry` class:
  - `loadRegistry()` - Load and merge both bundled + user registries
  - `getAvailableAgents()` - Returns merged view automatically
  - `hasAgent()` - Check merged registry automatically
  - `installCustomAgentFromPath()` - NEW method for custom agent installation (file & directory support)
  - `uninstallAgent()` - Improved protection logic:
    - Check preferences to get default agent, protect that one
    - Builtin agents: Can be uninstalled from disk (stay in bundled registry, can reinstall)
    - Custom agents: Uninstalled from disk AND removed from user registry
  - Cache invalidation on add/remove custom agents
- [x] Add validation:
  - `validateCustomAgentName()` - Prevent custom agent names that conflict with bundled registry
  - Name conflict error type added
- [x] Write integration tests for merged registry (14 integration tests)

**Note:** Single-file custom agents fully supported. Directory-based custom agents deferred to Phase 2.5 (requires `main` field prompt).

**Files modified:**
- `packages/core/src/agent/registry/registry.ts` - Core registry methods updated
- `packages/core/src/agent/registry/registry.integration.test.ts` - Integration tests (NEW)
- `packages/core/src/agent/registry/registry.test.ts` - Updated for new type field
- `packages/core/src/agent/registry/errors.ts` - Added name conflict error
- `packages/core/src/agent/registry/error-codes.ts` - Added error code

**Deliverable:** ✅ Custom agent installation works (single-file), 55 tests passing (41 unit + 14 integration)

**Commit:** `feat(agent-registry): implement merged registry with custom agent installation`

**Testing:**
```typescript
// Test merged registry
registry.getAvailableAgents() // → includes both bundled + custom
registry.hasAgent('default-agent') // → true (bundled)
registry.hasAgent('my-custom-agent') // → true (custom)

// Test resolution
resolveAgentPath('my-custom-agent') // → custom agent path
resolveAgentPath('default-agent')   // → bundled agent path
resolveAgentPath('./agent.yml')    // → explicit path

// Test name conflicts prevented
registry.installAgent('./agent.yml', metadata: { name: 'default-agent', ... })
// → throws error: name already exists in bundled registry
```

---

### Phase 2: CLI Commands ✅ COMPLETE

**Goal:** Users can install custom agents via CLI

**Tasks:**
- [x] Enhance `install.ts` command:
  - Detect if input is file path vs registry name (checks for `/` or `.yml`)
  - If file path:
    - Interactive prompts for metadata (name, description, author, tags) using @clack/prompts
    - Validate agent name doesn't conflict with bundled registry
    - Call `registry.installCustomAgentFromPath(filePath, metadata)`
  - If registry name: existing behavior
  - Analytics events added
- [x] Update `list-agents.ts`:
  - Group agents by `type` field
  - Show "Builtin Agents" and "Custom Agents" sections
  - Different colors (blue for builtin, magenta for custom)
- [x] Verify `uninstall.ts` command works:
  - Already checks preferences for default agent protection
  - Already handles builtin vs custom correctly (via registry logic)
  - No changes needed

**Files modified:**
- `packages/cli/src/cli/commands/install.ts` - File path detection & interactive prompts
- `packages/cli/src/cli/commands/install.test.ts` - Added 5 tests for custom agent flow
- `packages/cli/src/cli/commands/list-agents.ts` - Grouping by type

**Deliverable:** ✅ CLI workflow complete for single-file custom agents, 50 CLI command tests passing

**Commits:**
- `feat(cli): add custom agent installation from file paths`
- `feat(cli): group agents by type in list-agents command`
- `test(cli): add tests for custom agent installation from file paths`

**CLI Usage:**
```bash
# Interactive install (custom agent from file)
dexto install ./my-agent.yml
? Agent name: my-coding-agent
? Description: Custom agent for coding tasks
? Author: (optional)
? Tags (comma-separated): coding,custom
✓ Installed custom agent 'my-coding-agent'

# Non-interactive install
dexto install ./my-agent.yml --name "my-agent" --description "My custom agent" --tags "coding,custom"

# Install from registry (existing behavior)
dexto install default-agent
✓ Installed agent 'default-agent'

# List agents (grouped by type)
dexto list-agents
Custom Agents:
  • my-coding-agent - Custom agent for coding tasks

Built-in Agents:
  • default-agent - Default Dexto agent
  • database-agent - AI agent for database operations

# Uninstall custom agent (removed from disk + user registry)
dexto uninstall my-coding-agent
✓ Uninstalled custom agent 'my-coding-agent'

# Uninstall builtin agent (removed from disk only, can reinstall)
dexto uninstall database-agent
✓ Uninstalled agent 'database-agent' (can reinstall with: dexto install database-agent)

# Uninstall default agent (blocked - it's the default in preferences)
dexto uninstall default-agent
✗ Cannot uninstall default agent. Change your default agent first with: dexto setup
```

**Deliverable:** CLI workflow complete and tested

**Validation Point 1:** ✅ Users can create and use custom agents entirely via CLI (single-file)

---

### Phase 3: Basic API & UI Integration ✅ COMPLETE

**Goal:** Custom agents visible and switchable in UI

**Tasks:**
- [x] Update existing API endpoints in `server.ts`:
  - `GET /api/agents` - Returns merged view with `type` field
  - `POST /api/agents/install` - Supports custom agent metadata
  - Added validation for name conflicts
- [x] Update `DextoAgent` class:
  - `listAgents()` - Returns agents with `type` field
  - `installAgent()` - Accepts metadata for custom agents
  - `uninstallAgent()` - Validates `type` field correctly
- [x] Update `AgentSelector.tsx`:
  - Groups agents by `type` field
  - Shows visual badges for custom agents
  - Provides delete functionality for custom agents
  - Agent switching works transparently for all types

**Files to modify:**
- `packages/cli/src/api/server.ts`
- `packages/core/src/agent/DextoAgent.ts`
- `packages/webui/components/AgentSelector.tsx`

**API Changes:**
```typescript
// List all agents (existing endpoint, enhanced response)
GET /api/agents
Response: {
  installed: AgentItem[],  // Includes both types, with type field
  available: AgentItem[],  // Includes both types, with type field
  current: { name: string }
}

// AgentItem now includes:
interface AgentItem {
  name: string;
  description: string;
  author: string;
  tags: string[];
  type: 'builtin' | 'custom';  // NEW
  installed: boolean;
}

// Install agent (existing endpoint, enhanced to accept metadata)
POST /api/agents/install
Body (registry agent): { name: string }
Body (custom agent): {
  filePath: string,
  metadata: { name: string, description: string, author?: string, tags?: string[] }
}
Response: { installed: true, name: string }

// Validate name (new endpoint)
POST /api/agents/validate-name
Body: { name: string }
Response: { valid: boolean, conflict?: 'builtin' | 'custom' }
```

**UI Changes:**
```tsx
<AgentSelector>
  {/* Group by type automatically from API response */}
  <Section title="Custom">
    {customAgents.map(agent => (
      <AgentItem
        agent={agent}
        badge="Custom"
        onDelete={handleDelete}  // Only shown for custom
      />
    ))}
  </Section>

  <Section title="Built-in">
    {builtinAgents.map(agent => (
      <AgentItem agent={agent} />
    ))}
  </Section>
</AgentSelector>
```

**Deliverable:** ✅ Custom agents fully integrated into UI with type distinction

**Commit:** `feat(phase-3): integrate custom agents into API and UI`

**Validation Point 2:** ✅ CLI-installed custom agents now visible and usable in UI

---

### Phase 4: Form Editor Foundation ✅ COMPLETE

**Goal:** Non-technical users can edit agents with forms

**Tasks:**
- [x] Create `FormEditor.tsx` component:
  - Collapsible sections for better organization
  - Basic Info section (name, description, greeting)
  - LLM Configuration section (provider, model, router, API key, params)
  - System Prompt section (textarea for instructions)
- [x] Update `CustomizePanel.tsx`:
  - Editor mode toggle (Form/YAML)
  - State management for both modes
  - Mode switching with unsaved changes warning
  - YAML comment preservation during form edits
- [x] Implement two-way sync:
  - Form changes → update config → regenerate YAML with preserved comments
  - YAML changes → parse → update config → update form
  - Graceful YAML parsing error handling
- [x] Add validation:
  - Real-time validation in form fields
  - Inline error messages with field highlighting
  - Save button disabled when validation fails
  - Error tooltips on disabled save button
  - Auto-expand sections with errors

**Files created:**
- `packages/webui/components/AgentEditor/FormEditor.tsx`
- `packages/webui/components/AgentEditor/FormEditorView.tsx`
- `packages/webui/components/AgentEditor/YAMLEditorView.tsx`
- `packages/webui/components/AgentEditor/ConfigValidationStatus.tsx`
- `packages/webui/components/AgentEditor/form-sections/LLMConfigSection.tsx`
- `packages/webui/components/AgentEditor/form-sections/SystemPromptSection.tsx`

**Files modified:**
- `packages/webui/components/AgentEditor/CustomizePanel.tsx`
- `packages/webui/components/AgentEditor/AgentConfigEditor.tsx`

**Component Structure:**
```tsx
<CustomizePanel>
  <Header>
    <SegmentedControl value={mode} onChange={setMode}>
      <Option value="form">Form Editor</Option>
      <Option value="yaml">YAML Editor</Option>
    </SegmentedControl>
  </Header>

  <Content>
    {mode === 'form' ? (
      <FormEditor config={config} onChange={handleFormChange} />
    ) : (
      <YamlEditor value={yaml} onChange={handleYamlChange} />
    )}
  </Content>

  <Footer>
    <ValidationStatus />
    <SaveButton />
  </Footer>
</CustomizePanel>
```

**Deliverable:** ✅ Users can edit LLM + system prompt via forms with validation

**Commits:**
- `feat: add form editor for agent customization`
- `feat: preserve YAML comments in form editor`
- `feat: add error detection and field-level validation in form editor`
- `feat: add helpful tooltip for disabled save button`

**Validation Point 3:** ✅ Non-technical users can customize agents without YAML

---

### Phase 5: Form Editor - Advanced Sections ✅ COMPLETE

**Goal:** Full coverage of common agent configuration

**Tasks:**
- [x] Add MCP Servers section:
  - List view of configured servers with collapsible cards
  - Add/remove/edit server configs
  - Form fields for server type, connection mode, command, args, env
  - Dynamic field visibility based on connection type
  - Array input handling for args and env variables
- [x] Add Storage Configuration section:
  - Cache type selector (in-memory/redis) with dynamic fields
  - Database type selector (in-memory/sqlite/postgres) with dynamic fields
  - Connection string inputs shown conditionally
  - Uses core constants for dropdown options
- [x] Add Tool Confirmation section:
  - Mode selector (auto-approve/ask/disabled)
  - Timeout input
  - Allowed tools storage type selector
- [x] Add advanced features detection:
  - Detects complex system prompt configs (not just strings)
  - Detects session config customization
  - Detects internal tools customization
  - Shows warning banner: "Advanced Configuration Detected"
  - Suggests switching to YAML editor for full control

**Files created:**
- `packages/webui/components/AgentEditor/form-sections/McpServersSection.tsx`
- `packages/webui/components/AgentEditor/form-sections/StorageSection.tsx`
- `packages/webui/components/AgentEditor/form-sections/ToolConfirmationSection.tsx`

**Additional Improvements:**
- Organized all agent editor components into `AgentEditor/` folder
- Exported storage schemas from core for UI consumption
- Relaxed ESLint rules to trust browser bundle as gatekeeper
- Added TODOs for future schema-driven form metadata optimization

**Deliverable:** ✅ Form editor covers 95% of agent configs

**Commits:**
- `refactor: use core constants for form dropdowns and defaults`
- `fix: export storage backend type constants for UI consumption`
- `feat: enhance form editor UX with tooltips and MCP server type selector`
- `fix: improve form editor state tracking and MCP args UX`
- `fix: improve form validation UX with error tooltips and field fixes`
- `fix: form input issues and optional field validation`
- `refactor: export storage schemas and organize agent editor components`
- `docs: add cross-referenced TODOs for schema-driven form metadata`

---

### Phase 6: Agent Creation Wizard (PENDING)

**Goal:** Guided experience for creating custom agents

**Tasks:**
- [ ] Create `AgentCreationWizard.tsx` component:
  - Step 1: Choose source (template/import/scratch)
  - Step 2: Basic info (name, description, tags)
  - Step 3: LLM configuration
  - Step 4: System prompt
  - Step 5: Review & create
- [ ] Create agent templates:
  - `minimal-agent.yml` - Bare minimum config
  - `default-agent.yml` - Full-featured template
  - `coding-agent.yml` - Optimized for coding tasks
- [ ] Add creation API endpoint:
  - `POST /api/agents/custom/create`
  - Accepts wizard data, creates agent
  - Returns agent name
- [ ] Add "+ New Agent" button:
  - In AgentSelector dropdown
  - Opens wizard dialog
- [ ] Implement creation flow:
  - Create agent from wizard data
  - Optionally switch to new agent
  - Optionally open CustomizePanel for advanced edits

**Files to create:**
- `packages/webui/components/AgentCreationWizard.tsx`
- `packages/webui/components/wizard-steps/ChooseSourceStep.tsx`
- `packages/webui/components/wizard-steps/BasicInfoStep.tsx`
- `packages/webui/components/wizard-steps/LLMConfigStep.tsx`
- `packages/webui/components/wizard-steps/SystemPromptStep.tsx`
- `packages/webui/components/wizard-steps/ReviewStep.tsx`
- `agents/minimal-agent.yml`
- `agents/coding-agent.yml`

**Files to modify:**
- `packages/webui/components/AgentSelector.tsx`
- `packages/cli/src/api/server.ts`

**Wizard Flow:**
```
Step 1: Choose Source
┌─────────────────────────────────┐
│ [Template] [Import] [Scratch]  │
└─────────────────────────────────┘

Step 2: Basic Info
┌─────────────────────────────────┐
│ Name: my-coding-agent           │
│ Description: ___                │
│ Tags: coding, custom            │
└─────────────────────────────────┘

Step 3: LLM Config
┌─────────────────────────────────┐
│ Provider: [OpenAI ▼]            │
│ Model: [gpt-4 ▼]                │
│ API Key: $OPENAI_API_KEY        │
└─────────────────────────────────┘

Step 4: System Prompt
┌─────────────────────────────────┐
│ You are a coding assistant...   │
│                                 │
└─────────────────────────────────┘

Step 5: Review
┌─────────────────────────────────┐
│ ✓ Name: my-coding-agent         │
│ ✓ LLM: OpenAI gpt-4             │
│ ✓ Prompt configured             │
│                                 │
│ [☑] Set as default agent        │
│                                 │
│ [Create Agent]                  │
└─────────────────────────────────┘
```

**Deliverable:** Beautiful onboarding for creating custom agents

**Validation Point 4:** ✅ Users can create custom agents entirely from UI with guided wizard

---

### Phase 6.5: Refactor Agent Installation Architecture (PENDING)

**Goal:** Decouple agent installation from DextoAgent class

**Problem:**
Currently, agent installation methods (`installAgent()`, `installCustomAgent()`, `uninstallAgent()`, `listAgents()`) are instance methods on `DextoAgent`. This creates a conceptual mismatch:
- Agent installation is about managing the agent **registry**, not about a specific agent's behavior
- The current agent instance doesn't need to be running to install/uninstall other agents
- Creates unnecessary coupling between agent runtime and registry management

**Proposed Solution:**
Introduce an `AgentRegistry` service class or standalone functions that handle all registry operations independently of any agent instance.

**Tasks:**
- [ ] Design new API structure:
  - Option A: `AgentRegistry` class with static/instance methods
  - Option B: Standalone functions in `agent-registry.ts`
  - Option C: Hybrid - core functions + optional registry manager class
- [ ] Refactor installation logic:
  - Move `installAgent()` out of DextoAgent
  - Move `installCustomAgent()` out of DextoAgent
  - Move `uninstallAgent()` out of DextoAgent
  - Move `listAgents()` out of DextoAgent
- [ ] Update API endpoints in `server.ts`:
  - Replace `activeAgent.installAgent()` calls
  - Replace `activeAgent.listAgents()` calls
  - Remove `ensureAgentAvailable()` checks where not needed
- [ ] Update CLI commands:
  - Update `install.ts` to use new registry API
  - Update `uninstall.ts` to use new registry API
  - Update `list-agents.ts` to use new registry API
- [ ] Update tests to reflect new architecture

**Example API (to be designed):**
```typescript
// Option A: Static methods
class AgentRegistry {
  static async listAgents(): Promise<AgentList>;
  static async installAgent(name: string): Promise<void>;
  static async installCustomAgent(name: string, path: string, metadata: Metadata): Promise<void>;
  static async uninstallAgent(name: string, force?: boolean): Promise<void>;
}

// Option B: Standalone functions
export async function listAgents(): Promise<AgentList>;
export async function installAgent(name: string): Promise<void>;
export async function installCustomAgent(name: string, path: string, metadata: Metadata): Promise<void>;
export async function uninstallAgent(name: string, force?: boolean): Promise<void>;
```

**Benefits:**
- Clearer separation of concerns
- Can install agents without active agent instance
- Removes unnecessary `ensureAgentAvailable()` checks
- More testable (no need to mock entire DextoAgent)
- Better conceptual model for users

**Deliverable:** Agent installation fully decoupled from agent runtime

---

### Phase 7: Directory-Based Custom Agents (PENDING)

**Goal:** Support installing directory-based custom agents with multiple files

**Status:** Deferred until after UI/wizard - niche use case, single-file agents cover 90% of needs

**Problem:**
Currently, installing a directory like `./my-agent/` fails because:
1. No prompt for `main` field (required for directory agents)
2. Without `main`, `resolveMainConfig()` throws error when agent is used

**Tasks:**
- [ ] Enhance `promptForMetadata()` in `install.ts`:
  - Detect if source is directory (check `fs.stat()` before prompting)
  - If directory: scan for `.yml` files in the directory
  - Show dropdown using `@clack/prompts` `select()` with found YAML files
  - Set selected file as `main` field
- [ ] Update installation flow to pass `main` field:
  - Already accepted by `installCustomAgentFromPath()` method
  - Already handles directory agents in registry
  - Just need to pass it from CLI prompt
- [ ] Add integration test for directory agent installation
- [ ] Document `${{dexto.agent_dir}}` template variable:
  - Add hint in CLI prompt
  - Add to agent template
  - Add to wizard documentation

**Files to modify:**
- `packages/cli/src/cli/commands/install.ts`
- `packages/cli/src/cli/commands/install.test.ts`

**CLI Flow:**
```bash
dexto install ./my-agent-directory/

📝 Custom Agent Installation
? Agent name: my-agent
? Description: Custom directory-based agent
? Author: John Doe
? Tags: custom
? Main config file: (select from dropdown)
  ▸ agent.yml
    config.yml
    my-agent.yml
✓ Installed custom agent 'my-agent'

💡 Tip: Use ${{dexto.agent_dir}} in your config for relative paths
```

**Technical Details:**
```typescript
// After basic prompts, detect if source is directory
const stats = await fs.stat(resolvedPath);
const isDirectory = stats.isDirectory();

let main: string | undefined;

if (isDirectory) {
  // Scan for YAML files
  const files = await fs.readdir(resolvedPath);
  const ymlFiles = files.filter(f =>
    f.endsWith('.yml') || f.endsWith('.yaml')
  );

  if (ymlFiles.length === 0) {
    throw new Error('No YAML files found in directory');
  }

  // Show dropdown selector
  const selected = await p.select({
    message: 'Select main config file:',
    options: ymlFiles.map(f => ({ value: f, label: f })),
    initialValue: ymlFiles.find(f => f === 'agent.yml') || ymlFiles[0]
  });

  if (p.isCancel(selected)) {
    p.cancel('Installation cancelled');
    process.exit(0);
  }

  main = selected as string;
}

// Pass main field to installation
await registry.installCustomAgentFromPath(
  metadata.agentName,
  resolvedPath,
  {
    ...metadata,
    main  // Include main field for directory agents
  },
  validated.injectPreferences
);
```

**Deliverable:** Directory-based custom agents fully supported

---

### Phase 8: Polish & Enhancement (PENDING)

**Goal:** Production-ready feature

**Tasks:**
- [ ] User preferences:
  - Add "default editor mode" to preferences
  - Remember last used editor mode per user
  - Add to preferences API
- [ ] Enhanced validation:
  - Field-level validation messages in form
  - Suggestion system ("Did you mean gpt-4?")
  - Link to docs for each field
- [ ] Documentation:
  - Update CLI docs: `docs/docs/guides/cli.md`
  - Add guide: "Creating Custom Agents"
  - Update API docs with new endpoints
- [ ] Analytics:
  - Track custom agent creation (source: cli/ui)
  - Track editor mode usage (form/yaml)
  - Track wizard completion rate
- [ ] Error handling:
  - Better error messages for validation failures
  - Recovery suggestions
  - "Report issue" link for unexpected errors
- [ ] Testing:
  - E2E tests for full workflows
  - Integration tests for API endpoints
  - Unit tests for all new components

**Deliverable:** Feature complete, documented, and polished

---

## Testing Strategy

### Unit Tests
- Storage utilities (read/write metadata)
- Agent resolution priority
- Form ↔ YAML sync logic
- Validation helpers

### Integration Tests
- CLI commands (install, list, uninstall)
- API endpoints (all custom agent routes)
- Agent switching with custom agents
- CustomizePanel with both editors

### E2E Tests
- Full CLI workflow: install → list → run → uninstall
- Full UI workflow: wizard → create → edit → switch
- Cross-environment: CLI install → UI edit → CLI run

### Manual Testing Checklist
- [ ] Install custom agent via CLI, verify appears in UI
- [ ] Create custom agent via wizard, verify usable in CLI
- [ ] Edit agent in form mode, verify YAML is correct
- [ ] Edit agent in YAML mode, verify form updates
- [ ] Switch between custom and registry agents
- [ ] Delete custom agent, verify removed everywhere
- [ ] Handle invalid YAML gracefully
- [ ] Handle name conflicts appropriately

---

## Open Questions

1. **Should we allow exporting/sharing custom agents?**
   - Pro: Users can share configs with team
   - Con: Adds complexity, security concerns
   - Decision: Defer to future iteration

2. **Should custom agents support directories (not just single files)?**
   - Pro: Can include additional resources (multiple YAML files, assets, etc.)
   - Con: More complex installation
   - Decision: Yes, support both - follow same pattern as bundled agents

3. **Should we validate API keys exist when installing agents?**
   - Pro: Catches errors early
   - Con: Requires environment access
   - Decision: Warn but don't block (soft validation)

4. **Default editor mode for new users?**
   - Option A: Form (easier for beginners)
   - Option B: YAML (more powerful)
   - Decision: Form, with prominent toggle to YAML

5. **What happens when Dexto updates and a new bundled agent conflicts with user's custom agent?**
   - Since names must be unique, this would be caught at runtime
   - Options:
     - A: Block Dexto update (bad UX)
     - B: Warn user, ask them to rename their custom agent
     - C: Auto-rename user's agent to `{name}-custom`
   - Decision: TBD - defer until this becomes a real issue

---

## Future Enhancements (Post-MVP)

- **Agent Marketplace:** Browse/install community agents
- **Version Control:** Track agent changes, rollback
- **Remote URLs:** Install from GitHub, URLs
- **Agent Duplication:** "Copy and customize" existing agents
- **Import from Code:** Generate agent from existing codebase analysis
- **Team Sharing:** Org-level custom agents
- **Agent Testing:** Built-in test framework for custom agents

---

## Related Documents

- [Architecture: Execution Context Detection](../CLAUDE.md#execution-context-detection)
- [Architecture: Agent Resolution](../packages/core/src/config/agent-resolver.ts)
- [API Documentation](../docs/docs/api/overview.md)
- [CLI Guide](../docs/docs/guides/cli.md)
