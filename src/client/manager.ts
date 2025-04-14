import { MCPConnection } from './mcp-connection.js';
import { ServerConfigs } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { IMCPClient, MCPPromptMetadata, MCPPrompt } from './types.js';

export class ClientManager {
    private mcpClients: Map<string, IMCPClient> = new Map();
    private connectionErrors: { [key: string]: string } = {};
    private toolToClientMap: Map<string, IMCPClient> = new Map();
    private promptToClientMap: Map<string, IMCPClient> = new Map();

    /**
     * Register a client that provides tools
     * @param name Unique name for the client
     * @param client The tool provider client
     */
    registerClient(name: string, client: IMCPClient): void {
        if (this.mcpClients.has(name)) {
            logger.warn(`Client '${name}' already registered. Overwriting.`);
        }
        this.mcpClients.set(name, client);
        logger.info(`Registered client: ${name}`);
    }

    /**
     * Get all available tools from all connected clients
     * @returns Promise resolving to a map of tool names to tool definitions
     */
    async getAllTools(): Promise<Record<string, any>> {
        let allTools: Record<string, any> = {};
        // Clear existing map to avoid stale entries
        this.toolToClientMap.clear();

        for (const [serverName, client] of this.mcpClients.entries()) {
            try {
                logger.debug(`Getting tools from ${serverName}`);
                const toolList = await client.getTools();

                // Map each tool to its provider client
                for (const toolName in toolList) {
                    this.toolToClientMap.set(toolName, client);
                }

                allTools = { ...allTools, ...toolList };
                logger.debug(`Successfully got tools from ${serverName}`);
            } catch (error) {
                console.error(`Error getting tools from ${serverName}:`, error);
            }
        }
        logger.debug(`Successfully got all tools from all servers`, null, 'green');
        logger.silly(`All tools: ${JSON.stringify(allTools, null, 2)}`);
        return allTools;
    }

    /**
     * Get client that provides a specific tool
     * @param toolName Name of the tool
     * @returns The client that provides the tool, or undefined if not found
     */
    getToolClient(toolName: string): IMCPClient | undefined {
        return this.toolToClientMap.get(toolName);
    }

    /**
     * Execute a specific tool with the given arguments
     * @param toolName Name of the tool to execute
     * @param args Arguments to pass to the tool
     * @returns Promise resolving to the tool execution result
     */
    async executeTool(toolName: string, args: any): Promise<any> {
        const client = this.getToolClient(toolName);
        if (!client) {
            throw new Error(`No client found for tool: ${toolName}`);
        }

        return await client.callTool(toolName, args);
    }

    /**
     * Initialize clients from server configurations
     * @param serverConfigs Server configurations
     * @param connectionMode Whether to enforce all connections must succeed
     * @returns Promise resolving when initialization is complete
     */
    async initializeFromConfig(
        serverConfigs: ServerConfigs,
        connectionMode: 'strict' | 'lenient' = 'lenient'
    ): Promise<void> {
        const successfulConnections: string[] = [];

        for (const [name, config] of Object.entries(serverConfigs)) {
            const client = new MCPConnection();
            try {
                await client.connect(config, name);
                this.registerClient(name, client);
                successfulConnections.push(name);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.connectionErrors[name] = errorMsg;
                logger.error(`Failed to connect to server '${name}': ${errorMsg}`);
            }
        }

        // Check if we've met the requirements for connection mode
        const requiredSuccessfulConnections =
            connectionMode === 'strict'
                ? Object.keys(serverConfigs).length
                : Math.min(1, Object.keys(serverConfigs).length);

        if (successfulConnections.length < requiredSuccessfulConnections) {
            throw new Error(
                connectionMode === 'strict'
                    ? 'Failed to connect to all required servers'
                    : 'Failed to connect to at least one server'
            );
        }
    }

    /**
     * Get all registered clients
     * @returns Map of client names to client instances
     */
    getClients(): Map<string, IMCPClient> {
        return this.mcpClients;
    }

    /**
     * Get the errors from failed connections
     * @returns Map of server names to error messages
     */
    getFailedConnections(): { [key: string]: string } {
        return this.connectionErrors;
    }

    /**
     * Disconnect all clients
     */
    disconnectAll(): void {
        for (const [name, client] of this.mcpClients.entries()) {
            if (client.disconnect) {
                try {
                    client.disconnect();
                    logger.info(`Disconnected client: ${name}`);
                } catch (error) {
                    logger.error(`Failed to disconnect client '${name}': ${error}`);
                }
            }
        }
        this.mcpClients.clear();
        this.toolToClientMap.clear();
        this.promptToClientMap.clear();
        this.connectionErrors = {};
    }

    async getAllPrompts(): Promise<Record<string, MCPPromptMetadata>> {
        let allPrompts: Record<string, MCPPromptMetadata> = {};
        this.promptToClientMap.clear();
        for (const [_, client] of this.mcpClients.entries()) {
            const promptsArray = await client.listPrompts();
            for (const prompt of promptsArray) {
                if (prompt.name) {
                    allPrompts[prompt.name] = prompt;
                    this.promptToClientMap.set(prompt.name, client);
                }
            }
        }
        return allPrompts;
    }

    async getPrompt(promptName: string, args?: any): Promise<MCPPrompt> {
        const client = this.promptToClientMap.get(promptName);
        if (!client) {
            throw new Error(`No client found for prompt: ${promptName}`);
        }
        return client.getPrompt(promptName, args);
    }
}
