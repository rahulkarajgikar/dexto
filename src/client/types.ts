import { McpServerConfig } from '../config/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ToolSet } from '../ai/types.js';

// Defining types as any because we can't import the types from the SDK

/**
 * Interface for any provider of tools
 */
export interface ToolProvider {
    /**
     * Get the list of tools provided by this client
     */
    getTools(): Promise<ToolSet>;

    /**
     * Call a specific tool with the given arguments
     */
    callTool(toolName: string, args: any): Promise<any>;

    /**
     * Disconnect the client (if applicable)
     */
    disconnect?(): Promise<void>;
}

/**
 * Interface for MCP clients specifically, that can provide tools
 */
export interface IMCPClient {
    
    // Connection Management
    connect(config: McpServerConfig, serverName: string): Promise<Client>;
    disconnect?(): Promise<void>;

    // Tool Management
    /**
     * Get the list of tools provided by this client
     */
    getTools(): Promise<ToolSet>;

    /**
     * Call a specific tool with the given arguments
     */
    callTool(toolName: string, args: any): Promise<any>;

    // Prompt Management
    /**
     * Get the list of prompts provided by this client
     */
    listPrompts?(): Promise<MCPPromptMetadata[]>;

    /**
     * Get a specific prompt with the given name and arguments
     */
    getPrompt?(name: string, args?: any): Promise<MCPPrompt>;

    // TODO: implement Prompt Management
    // listPrompts(): Promise<string[]>;
    // getPrompt(name: string, args?: any): Promise<string>;

    // Resource Management
    // listResources(): Promise<string[]>;
    // readResource(url: string): Promise<string>;
}

/**
 * This is the metadata for a prompt. It is used to describe the prompt and its arguments.
 * This is returned from the MCP server when we call listPrompts
 */
export interface MCPPromptMetadata {
    name?: string;
    description?: string;
    arguments?: {
      name?: string;
      description?: string;
      required?: boolean;
    }[];
}

/**
 * This is the actual prompt object returned back from the MCP server when we call getPrompt
 * This can be plugged into the message history of the LLM
 */
export interface MCPPrompt {
    description?: string;
    messages?: {
        role?: string;
        content?: any;
    }[];
}

  
// Leaving here to ideate on
// export type ContinueConfigSource = "local-yaml" | "local-json" | "hub-assistant" | "hub"

export interface MCPResource {
    name: string;
    uri: string;
    description?: string;
    mimeType?: string;
}

export interface MCPTool {
    name: string;
    description?: string;
    inputSchema: {
        type: "object";
        properties?: Record<string, any>;
    };
}
  
