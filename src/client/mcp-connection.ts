import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { GetPromptResultSchema, ListPromptsResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { McpServerConfig, StdioServerConfig, SSEServerConfig } from '../config/types.js';
import { ToolSet } from '../ai/types.js';
import { IMCPClient, MCPTool, MCPPromptMetadata, MCPPrompt } from './types.js';

/**
 * Wrapper on top of Client class provided in model context protocol SDK, to add additional metadata about the server
 */
export class MCPConnection implements IMCPClient {
    private client: Client | null = null;
    private transport: any = null;
    private isConnected = false;
    private serverSpawned = false; // Kept as separate property
    private serverInfo: Record<string, any> | null = null; // Flexible metadata store (excluding spawned)

    private tools: ToolSet = {};
    private prompts: MCPPromptMetadata[] = [];

    constructor() {}

    async connect(config: McpServerConfig, serverName: string): Promise<Client> {
        if (config.type === 'stdio') {
            const stdioConfig: StdioServerConfig = config;

            // Auto-resolve npx path on Windows
            let command = stdioConfig.command;
            if (process.platform === 'win32' && command === 'npx') {
                command = 'C:\\Program Files\\nodejs\\npx.cmd';
            }

            return this.connectViaStdio(command, stdioConfig.args, stdioConfig.env, serverName);
        } else if (config.type === 'sse') {
            const sseConfig: SSEServerConfig = config;
            return this.connectViaSSE(sseConfig.url, sseConfig.headers);
        } else {
            throw new Error(`Unsupported server type`);
        }
    }

    /**
     * Connect to an MCP server via stdio
     * @param command Command to run
     * @param args Arguments for the command
     * @param env Environment variables
     * @param serverAlias Optional server alias/name to show in logs
     */
    async connectViaStdio(
        command: string,
        args: string[] = [],
        env?: Record<string, string>,
        serverAlias?: string
    ): Promise<Client> {
        // Store server details in the flexible serverInfo object (excluding spawned)
        this.serverInfo = {
            type: 'stdio',
            command: command,
            args: args,
            env: env || null,
            alias: serverAlias || null,
            pid: null, // StdioClientTransport doesn't expose PID directly
        };

        logger.info('');
        logger.info('=======================================');
        logger.info(`MCP SERVER (stdio): ${command} ${args.join(' ')}`, null, 'magenta');
        if (env) {
            logger.info('Environment:');
            Object.entries(env).forEach(([key, _]) => {
                logger.info(`  ${key}= [value hidden]`);
            });
        }
        logger.info('=======================================\n');

        const serverName = serverAlias
            ? `"${serverAlias}" (${command} ${args.join(' ')})`
            : `${command} ${args.join(' ')}`;
        logger.info(`Connecting to MCP server: ${serverName}`);

        // Create a properly expanded environment by combining process.env with the provided env
        const expandedEnv = {
            ...process.env,
            ...(env || {}),
        };

        // Create transport for stdio connection with expanded environment
        this.transport = new StdioClientTransport({
            command,
            args,
            env: expandedEnv as Record<string, string>,
        });

        this.client = new Client(
            {
                name: 'Saiki-stdio-mcp-client',
                version: '1.0.0',
            },
            {
                capabilities: { tools: {} },
            }
        );

        try {
            logger.info('Establishing connection...');
            await this.client.connect(this.transport);

            // If connection is successful, mark as spawned
            this.serverSpawned = true;
            logger.info(`✅ Stdio SERVER ${serverName} SPAWNED`);
            logger.info('Connection established!\n\n');
            this.isConnected = true;

            return this.client;
        } catch (error: any) {
            logger.error(`Failed to connect to MCP server ${serverName}:`, error.message);
            throw error;
        }
    }

    async connectViaSSE(url: string, headers: Record<string, string>): Promise<Client> {
        logger.info(`Connecting to SSE MCP server at url: ${url}`);

        // Store server details in the flexible serverInfo object (excluding spawned)
        this.serverInfo = {
            type: 'sse',
            url: url,
            headers: headers,
        };

        this.transport = new SSEClientTransport(new URL(url), {
            // For regular HTTP requests
            requestInit: {
                headers: headers,
            },
            // Need to implement eventSourceInit for SSE events.
        });

        logger.debug(`[connectViaSSE] SSE transport: ${JSON.stringify(this.transport, null, 2)}`);
        this.client = new Client(
            {
                name: 'Saiki-sse-mcp-client',
                version: '1.0.0',
            },
            {
                capabilities: { tools: {} },
            }
        );

        try {
            logger.info('Establishing connection...');
            await this.client.connect(this.transport);

            // If connection is successful, mark as spawned
            this.serverSpawned = true;
            logger.info(`✅ SSE SERVER ${url} SPAWNED`);
            logger.info('Connection established!\n\n');
            this.isConnected = true;

            return this.client;
        } catch (error: any) {
            logger.error(`Failed to connect to SSE MCP server ${url}:`, error.message);
            throw error;
        }
    }

    /**
     * Disconnect from the server
     */
    async disconnect(): Promise<void> {
        if (this.transport && typeof this.transport.close === 'function') {
            try {
                await this.transport.close();
                this.isConnected = false;
                this.serverSpawned = false; // Reset spawned status
                this.serverInfo = null; // Reset server info
                logger.info('Disconnected from MCP server');
            } catch (error: any) {
                logger.error('Error disconnecting from MCP server:', error.message);
            }
        }
    }

    /**
     * Call a tool with given name and arguments
     * @param name Tool name
     * @param args Tool arguments
     * @returns Result of the tool execution
     */
    async callTool(name: string, args: any): Promise<any> {
        try {
            logger.debug(`Calling tool '${name}' with args: ${JSON.stringify(args, null, 2)}`);

            // Parse args if it's a string (handle JSON strings)
            let toolArgs = args;
            if (typeof args === 'string') {
                try {
                    toolArgs = JSON.parse(args);
                } catch {
                    // If it's not valid JSON, keep as string
                    toolArgs = { input: args };
                }
            }

            // Call the tool with properly formatted arguments

            const result = await this.client.callTool({ name, arguments: toolArgs });
            logger.debug(`Tool '${name}' result: ${JSON.stringify(result, null, 2)}`);

            // Check for null or undefined result
            if (result === null || result === undefined) {
                return 'Tool executed successfully with no result data.';
            }
            return result;
        } catch (error) {
            logger.error(`Tool call '${name}' failed:`, error);
            return `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    /**
     * Get the list of tools provided by this client
     * @returns Array of available tools
     */
    async getTools(): Promise<ToolSet> {
        // Return cached tools if available
        if (Object.keys(this.tools).length > 0) {
            return this.tools;
        }
        
        try {
            const response = await this.client.listTools();
            this.tools = response.tools.reduce<ToolSet>((acc, tool) => {
                acc[tool.name] = {
                    description: tool.description,
                    parameters: tool.inputSchema,
                };
                return acc;
            }, {});
            return this.tools;
        } catch (error) {
            logger.error('Failed to list tools:', error);
            return {};
        }
    }

    async getPrompt(name: string): Promise<MCPPrompt> {
        const prompt = await this.client.getPrompt({name});
        return prompt;
    }

    /**
     * Get the list of prompts provided by the server
     * @returns Array of available prompts
     */
    async listPrompts(): Promise<MCPPromptMetadata[]> {
        // Return cached prompts if available
        if (this.prompts.length > 0) {
            return this.prompts;
        }

        try {
            const { prompts } = await this.client.listPrompts();
            this.prompts = prompts
            return this.prompts;
        } catch (error) {
            logger.error('Failed to list prompts:', error);
            return [];
        }
    }
    /**
     * Check if the client is connected
     */
    getConnectionStatus(): boolean {
        return this.isConnected;
    }

    /**
     * Get the connected client
     */
    getClient(): Client | null {
        return this.client;
    }

    /**
     * Get server status information
     */
    getServerInfo(): Record<string, any> | null {
        return this.serverInfo;
    }

    /**
     * Get the client instance once connected
     * @returns Promise with the MCP client
     * @throws Error if the client is not connected
     */
    async getConnectedClient(): Promise<Client> {
        if (this.client && this.isConnected) {
            return this.client;
        }

        // Removed automatic reconnection logic for simplicity and correctness.
        // If connection is lost, it needs to be re-established explicitly.
        throw new Error('MCP Client is not connected.');
    }
}
