import os from 'os';
import { WebUIConfig } from './webui-manager.js';

/**
 * Builds environment variables for the Next.js WebUI process
 */
export class WebUIEnvironmentBuilder {
    /**
     * Build the complete environment for the Next.js process
     */
    build(config: WebUIConfig): NodeJS.ProcessEnv {
        const apiPort = this.extractApiPort(config.apiUrl);

        return {
            ...process.env,
            NODE_ENV: 'development',
            API_PORT: apiPort,
            API_URL: config.apiUrl,
            FRONTEND_URL: config.frontUrl,
            NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? config.apiUrl,
            NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL ?? this.buildWebSocketUrl(apiPort),
            NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL ?? config.frontUrl,
            PATH: process.env.PATH,
        };
    }

    /**
     * Extract the port number from an API URL
     */
    private extractApiPort(apiUrl: string): string {
        try {
            const url = new URL(apiUrl);
            return url.port || '3001';
        } catch {
            return '3001';
        }
    }

    /**
     * Build the WebSocket URL for the API connection
     * Attempts to find the local network IP for better connectivity
     */
    private buildWebSocketUrl(apiPort: string): string {
        const networkInterfaces = os.networkInterfaces();

        // Try to find a non-internal IPv4 address
        for (const interfaceList of Object.values(networkInterfaces)) {
            if (!interfaceList) continue;

            for (const iface of interfaceList) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return `ws://${iface.address}:${apiPort}`;
                }
            }
        }

        // Fallback to localhost
        return `ws://localhost:${apiPort}`;
    }
}
