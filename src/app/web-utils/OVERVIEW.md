# Web Utilities Overview

This directory contains utilities for managing web servers, specifically the Next.js WebUI server.

## Directory Structure

```
src/app/
├── web/              # Express server code (legacy web UI)
├── webui/            # Next.js application code
└── web-utils/        # WebUI management utilities (this directory)
    ├── webui-manager.ts              # Main orchestrator
    ├── webui-path-resolver.ts        # Path discovery logic
    ├── webui-dependency-manager.ts   # Dependency management
    ├── webui-environment-builder.ts  # Environment setup
    ├── index.ts                      # Public API exports
    ├── example.ts                    # Usage examples
    ├── README.md                     # Detailed documentation
    └── OVERVIEW.md                   # This file
```

## Purpose

These utilities were created to replace a hacky 230-line monolithic function with a clean, modular system for:

- **Path Resolution**: Finding the webui directory across different installation scenarios
- **Dependency Management**: Installing and verifying Next.js dependencies  
- **Environment Setup**: Building proper environment variables
- **Process Management**: Starting, monitoring, and stopping the Next.js server

## Quick Start

```typescript
import { startNextJsWebServer } from './web-utils/index.js';

// Simple usage (backward compatible)
const success = await startNextJsWebServer(apiUrl, port, frontUrl);

// Advanced usage
import { WebUIManager } from './web-utils/index.js';
const manager = new WebUIManager();
const result = await manager.start({ apiUrl, frontPort, frontUrl });
```

## Benefits

- ✅ **Separation of concerns** - Each module has a single responsibility
- ✅ **Testability** - Components can be unit tested independently  
- ✅ **Maintainability** - Changes to one aspect don't affect others
- ✅ **Error handling** - Better error reporting and troubleshooting
- ✅ **Extensibility** - Easy to add new features and installation scenarios 