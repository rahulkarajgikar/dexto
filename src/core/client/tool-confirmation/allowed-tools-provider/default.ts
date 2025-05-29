import type { IAllowedToolsProvider } from './types.js';
import type { StorageProvider } from '../../../storage/index.js';
import { logger } from '../../../logger/index.js';

/**
 * Storage-backed implementation of AllowedToolsProvider.
 *
 * This is the default implementation that provides persistent storage
 * for allowed/denied tool decisions using the unified storage system.
 */
export class AllowedToolsProvider implements IAllowedToolsProvider {
    constructor(private storageProvider: StorageProvider<boolean>) {}

    async allowTool(toolName: string): Promise<void> {
        logger.debug(`Allowing tool: ${toolName}`);
        await this.storageProvider.set(toolName, true);
    }

    async disallowTool(toolName: string): Promise<void> {
        logger.debug(`Disallowing tool: ${toolName}`);
        await this.storageProvider.set(toolName, false);
    }

    async isToolAllowed(toolName: string): Promise<boolean> {
        const result = await this.storageProvider.get(toolName);
        // If no explicit decision, default to false (not allowed)
        const isAllowed = result === true;
        logger.debug(`Tool ${toolName} allowed status: ${isAllowed}`);
        return isAllowed;
    }

    async getAllowedTools(): Promise<Set<string>> {
        const keys = await this.storageProvider.keys();
        const allowedTools: Set<string> = new Set();

        for (const key of keys) {
            const isAllowed = await this.storageProvider.get(key);
            if (isAllowed === true) {
                allowedTools.add(key);
            }
        }

        logger.debug(`Retrieved ${allowedTools.size} allowed tools`);
        return allowedTools;
    }
}
