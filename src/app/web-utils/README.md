# WebUI Management Utilities

This directory contains utilities for managing the Next.js WebUI server. The previous monolithic `startNextJsWebServer` function has been refactored into focused, testable modules.

**Note**: This directory contains management utilities for the Next.js server, while the actual Next.js application code is in `../webui/`.

## Architecture

### Core Components

1. **WebUIManager** (`webui-manager.ts`)
   - Main orchestrator class that manages the WebUI lifecycle
   - Coordinates path resolution, dependency management, and server startup
   - Provides clean start/stop/status methods

2. **WebUIPathResolver** (`webui-path-resolver.ts`)
   - Handles the complex logic of finding the webui directory
   - Supports multiple installation scenarios (dev, dist, npm link)
   - Provides detailed troubleshooting when paths aren't found

3. **WebUIDependencyManager** (`webui-dependency-manager.ts`)
   - Manages installation and verification of Next.js dependencies
   - Handles first-run dependency installation
   - Verifies critical dependencies are available

4. **WebUIEnvironmentBuilder** (`webui-environment-builder.ts`)
   - Builds the environment variables for the Next.js process
   - Handles API URL parsing and WebSocket URL generation
   - Manages network interface detection for better connectivity

## Usage

### Basic Usage (Backward Compatible)

```typescript
import { startNextJsWebServer } from './web-utils/index.js';

const success = await startNextJsWebServer(
    'http://localhost:3001', // API URL
    3000,                    // Frontend port
    'http://localhost:3000'  // Frontend URL
);
```

### Advanced Usage with WebUIManager

```typescript
import { WebUIManager } from './web-utils/index.js';

const webUIManager = new WebUIManager();

const result = await webUIManager.start({
    apiUrl: 'http://localhost:3001',
    frontPort: 3000,
    frontUrl: 'http://localhost:3000',
    timeout: 15000 // Optional custom timeout
});

if (result.success) {
    console.log('WebUI started successfully');
    // Later...
    await webUIManager.stop();
} else {
    console.error('Failed to start WebUI:', result.error);
}
```

## Benefits of the New Architecture

### 1. **Separation of Concerns**
- Each class has a single, well-defined responsibility
- Path resolution is separate from dependency management
- Environment building is isolated from process management

### 2. **Testability**
- Each component can be unit tested independently
- Dependencies can be mocked easily
- Complex logic is broken down into testable units

### 3. **Maintainability**
- Code is easier to understand and modify
- Changes to one aspect (e.g., path resolution) don't affect others
- Clear interfaces between components

### 4. **Error Handling**
- Better error reporting with specific failure points
- Detailed troubleshooting information
- Graceful degradation when components fail

### 5. **Extensibility**
- Easy to add new installation scenarios
- Simple to extend environment configuration
- Straightforward to add new dependency checks

## Installation Scenarios Supported

1. **Distributed Package**: WebUI in `dist/src/app/webui`
2. **Development Source**: WebUI in `src/app/webui`
3. **npm Link (CWD)**: WebUI relative to current working directory
4. **Alternative Development**: WebUI in alternative locations

## Environment Variables

The system automatically configures these environment variables for the Next.js process:

- `NODE_ENV`: Set to 'development'
- `API_PORT`: Extracted from API URL
- `API_URL`: The backend API URL
- `FRONTEND_URL`: The frontend URL
- `NEXT_PUBLIC_API_URL`: Public API URL for client-side
- `NEXT_PUBLIC_WS_URL`: WebSocket URL (auto-detected network IP)
- `NEXT_PUBLIC_FRONTEND_URL`: Public frontend URL

## Error Handling

The system provides detailed error messages and troubleshooting information:

- Path resolution failures include all searched locations
- Dependency installation errors are clearly reported
- Process startup failures include specific error details
- Timeout handling with configurable duration

## Migration from Legacy Code

The new system maintains backward compatibility with the original `startNextJsWebServer` function. Existing code will continue to work without changes, but new code should prefer the `WebUIManager` class for better control and error handling. 