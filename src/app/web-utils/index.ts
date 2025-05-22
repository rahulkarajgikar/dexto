import { WebUIManager } from './webui-manager.js';

export { WebUIManager, type WebUIConfig, type WebUIStartResult } from './webui-manager.js';
export { WebUIPathResolver } from './webui-path-resolver.js';
export { WebUIDependencyManager } from './webui-dependency-manager.js';
export { WebUIEnvironmentBuilder } from './webui-environment-builder.js';

// Convenience function that maintains the original API
export async function startNextJsWebServer(
    apiUrl: string,
    frontPort: number = 3000,
    frontUrl: string = `http://localhost:${frontPort}`
): Promise<boolean> {
    const webUIManager = new WebUIManager();

    const result = await webUIManager.start({
        apiUrl,
        frontPort,
        frontUrl,
    });

    return result.success;
}
