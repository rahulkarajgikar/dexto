import { z } from 'zod';
import {
    getSupportedProviders,
    getSupportedModels,
    isValidProviderModel,
    getMaxTokensForModel,
} from '../ai/llm/registry.js';

// (agent card overrides are now represented as Partial<AgentCard> and processed via AgentCardSchema)

export const AgentCardSchema = z
    .object({
        name: z.string(), // No default, must be provided by context
        description: z
            .string()
            .default(
                'Alfred is an AI assistant capable of chat and task delegation, accessible via multiple protocols.'
            ),
        url: z.string().url(), // No default, must be provided by context
        provider: z
            .object({
                organization: z.string(),
                url: z.string().url(),
            })
            .optional(), // Remains optional, undefined if not provided
        version: z.string(), // No default, must be provided by context
        documentationUrl: z.string().url().optional(), // Remains optional, undefined if not provided
        capabilities: z
            .object({
                streaming: z.boolean().optional().default(true),
                pushNotifications: z.boolean().optional(), // Default is context-dependent (webSubscriber)
                stateTransitionHistory: z.boolean().optional().default(false),
            })
            .strict()
            .default({}), // Add default for the capabilities object itself
        authentication: z
            .object({
                schemes: z.array(z.string()).default([]),
                credentials: z.string().optional(), // Remains optional
            })
            .strict()
            .default({}), // Add default for the authentication object itself
        defaultInputModes: z.array(z.string()).default(['application/json', 'text/plain']),
        defaultOutputModes: z
            .array(z.string())
            .default(['application/json', 'text/event-stream', 'text/plain']),
        skills: z
            .array(
                z.object({
                    id: z.string(),
                    name: z.string(),
                    description: z.string(),
                    tags: z.array(z.string()),
                    examples: z.array(z.string()).optional(),
                    inputModes: z.array(z.string()).optional().default(['text/plain']),
                    outputModes: z.array(z.string()).optional().default(['text/plain']),
                })
            )
            .default([
                {
                    id: 'chat_with_agent',
                    name: 'chat_with_agent',
                    description: 'Allows you to chat with an AI agent. Send a message to interact.',
                    tags: ['chat', 'AI', 'assistant', 'mcp', 'natural language'],
                    examples: [
                        `Send a JSON-RPC request to /mcp with method: "chat_with_agent" and params: {"message":"Your query..."}`,
                        'Alternatively, use a compatible MCP client library.',
                    ],
                    // inputModes and outputModes will use their own defaults if not specified here
                },
            ]),
    })
    .strict();

// Define a base schema for common fields
const BaseContributorSchema = z
    .object({
        id: z.string().describe('Unique identifier for the contributor'),
        priority: z
            .number()
            .int()
            .nonnegative()
            .describe('Execution priority of the contributor (lower numbers run first)'),
        enabled: z
            .boolean()
            .optional()
            .default(true)
            .describe('Whether this contributor is currently active'),
    })
    .strict();

// Schema for 'static' contributors - only includes relevant fields
const StaticContributorSchema = BaseContributorSchema.extend({
    type: z.literal('static'),
    content: z.string().describe("Static content for the contributor (REQUIRED for 'static')"),
    // No 'source' field here, as it's not relevant to static contributors
}).strict();

// Schema for 'dynamic' contributors - only includes relevant fields
const DynamicContributorSchema = BaseContributorSchema.extend({
    type: z.literal('dynamic'),
    source: z.string().describe("Source identifier for dynamic content (REQUIRED for 'dynamic')"),
    // No 'content' field here, as it's not relevant to dynamic contributors (source provides the content)
}).strict();

export const ContributorConfigSchema = z
    .discriminatedUnion(
        'type', // The field to discriminate on
        [StaticContributorSchema, DynamicContributorSchema],
        {
            // Optional: Custom error message for invalid discriminator
            errorMap: (issue, ctx) => {
                if (issue.code === z.ZodIssueCode.invalid_union_discriminator) {
                    return { message: `Invalid contributor type. Expected 'static' or 'dynamic'.` };
                }
                return { message: ctx.defaultError };
            },
        }
    )
    .describe(
        "Configuration for a system prompt contributor. Type 'static' requires 'content', type 'dynamic' requires 'source'."
    );

export type ContributorConfig = z.infer<typeof ContributorConfigSchema>;

export const SystemPromptConfigSchema = z.object({
    contributors: z
        .array(ContributorConfigSchema)
        .min(1)
        .describe('An array of contributor configurations that make up the system prompt'),
});

export type SystemPromptConfig = z.infer<typeof SystemPromptConfigSchema>;

export const LLMConfigSchema = z
    .object({
        provider: z
            .string()
            .nonempty()
            .describe("The LLM provider (e.g., 'openai', 'anthropic', 'google', 'groq')"),
        model: z.string().nonempty().describe('The specific model name for the selected provider'),
        systemPrompt: z
            .union([z.string(), SystemPromptConfigSchema])
            .describe(
                'The system prompt content as a string, or a structured system prompt configuration'
            ),
        apiKey: z
            .string()
            .min(1)
            .describe(
                'API key for the LLM provider (can also be set via environment variables using $VAR syntax)'
            ),
        maxIterations: z
            .number()
            .int()
            .positive()
            .optional()
            .default(50)
            .describe(
                'Maximum number of iterations for agentic loops or chained LLM calls, defaults to 50'
            ),
        providerOptions: z
            .record(z.any())
            .optional()
            .default({})
            .describe(
                'Additional, provider-specific options (e.g., temperature, top_p), defaults to an empty object'
            ),
        router: z
            .enum(['vercel', 'in-built'])
            .optional()
            .default('vercel')
            .describe('LLM router to use (vercel or in-built), defaults to vercel'),
        baseURL: z
            .string()
            .url()
            .optional()
            .describe(
                'Base URL for the LLM provider (e.g., https://api.openai.com/v1, https://api.anthropic.com/v1). \nCurrently only supported for OpenAI.'
            ),
        maxTokens: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
                'Maximum number of tokens to use for the LLM, required for unknown models, calculated internally for known models'
            ),
    })
    .superRefine((data, ctx) => {
        const providerLower = data.provider?.toLowerCase();
        const baseURLIsSet = data.baseURL != null && data.baseURL.trim() !== '';
        const maxTokensIsSet = data.maxTokens != null;

        // Provider must be one of the supported list
        const supportedProvidersList = getSupportedProviders();
        if (!supportedProvidersList.includes(providerLower)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['provider'],
                message: `Provider '${data.provider}' is not supported. Supported: ${supportedProvidersList.join(', ')}`,
            });
        }

        // When user provides a custom baseURL
        if (baseURLIsSet) {
            // 1. Provider must be set to 'openai'
            if (providerLower !== 'openai') {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['provider'],
                    message: "If 'baseURL' is provided, provider must be set to 'openai'",
                });
            }
        }
        // If no base URL
        else {
            // 1. Model must be valid for the provider
            if (supportedProvidersList.includes(providerLower)) {
                const supportedModelsList = getSupportedModels(providerLower);
                if (!isValidProviderModel(providerLower, data.model)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['model'],
                        message: `Model '${data.model}' is not supported for provider '${data.provider}'. Supported: ${supportedModelsList.join(', ')}`,
                    });
                }
            }
            // 2. maxTokens must be within the model's limit
            if (maxTokensIsSet) {
                try {
                    const registryMaxTokens = getMaxTokensForModel(providerLower, data.model);
                    if (data.maxTokens != null && data.maxTokens > registryMaxTokens) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ['maxTokens'],
                            message: `Max tokens for model '${data.model}' is ${registryMaxTokens}. You provided ${data.maxTokens}`,
                        });
                    }
                } catch (error: any) {
                    // Handle ProviderNotFoundError and ModelNotFoundError specifically
                    if (
                        error.name === 'ProviderNotFoundError' ||
                        error.name === 'ModelNotFoundError'
                    ) {
                        // This scenario should ideally be caught by the earlier provider/model validation checks.
                        // However, if it still occurs, add an issue.
                        // We might not have supportedModelsList here if provider was invalid.
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ['model'], // Or ['provider', 'model']
                            message: error.message, // The message from our custom error
                        });
                    } else {
                        // For any other unexpected error, rethrow or handle as a generic validation issue
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: [], // General error
                            message: `An unexpected error occurred while validating maxTokens: ${error.message}`,
                        });
                    }
                }
            }
        }
    });

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

export const StdioServerConfigSchema = z.object({
    type: z.literal('stdio'),
    command: z.string().describe("The shell command to launch the server (e.g., 'node')"),
    args: z.array(z.string()).describe("Array of arguments for the command (e.g., ['script.js'])"),
    env: z
        .record(z.string())
        .optional()
        .default({})
        .describe(
            'Optional environment variables for the server process, defaults to an empty object'
        ),
    timeout: z
        .number()
        .int()
        .positive()
        .optional()
        .default(30000)
        .describe('Timeout in milliseconds for the server connection, defaults to 30000ms'),
});
export type StdioServerConfig = z.infer<typeof StdioServerConfigSchema>;

export const SseServerConfigSchema = z.object({
    type: z.literal('sse'),
    url: z.string().url().describe('URL for the SSE server endpoint'),
    headers: z
        .record(z.string())
        .optional()
        .default({})
        .describe('Optional headers for the SSE connection, defaults to an empty object'),
    timeout: z
        .number()
        .int()
        .positive()
        .optional()
        .default(30000)
        .describe('Timeout in milliseconds for the server connection, defaults to 30000ms'),
});
export type SseServerConfig = z.infer<typeof SseServerConfigSchema>;

export const HttpServerConfigSchema = z.object({
    type: z.literal('http'),
    baseUrl: z.string().url().describe('Base URL for the HTTP server'),
    headers: z
        .record(z.string())
        .optional()
        .default({})
        .describe('Optional headers for HTTP requests, defaults to an empty object'),
    timeout: z
        .number()
        .int()
        .positive()
        .optional()
        .default(30000)
        .describe('Timeout in milliseconds for HTTP requests, defaults to 30000ms'),
});
export type HttpServerConfig = z.infer<typeof HttpServerConfigSchema>;

export const McpServerConfigSchema = z
    .union([StdioServerConfigSchema, SseServerConfigSchema, HttpServerConfigSchema])
    .describe('Configuration for an MCP server connection (can be stdio, sse, or http)');
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const ServerConfigsSchema = z
    .record(McpServerConfigSchema)
    .refine((obj) => Object.keys(obj).length > 0, {
        message: 'At least one MCP server configuration is required.',
    })
    .describe('A dictionary of server configurations, keyed by server name');
export type ServerConfigs = z.infer<typeof ServerConfigsSchema>;

// Storage Configuration Schemas

// Base storage provider schemas
const MemoryStorageSchema = z.object({
    type: z.literal('memory'),
    maxSize: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of items to store in memory'),
    ttl: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Time-to-live in milliseconds for stored items'),
});

const FileStorageSchema = z.object({
    type: z.literal('file'),
    path: z.string().describe('File path for storage'),
    format: z.enum(['json', 'jsonl', 'csv']).optional().default('json').describe('File format'),
    maxSize: z.string().optional().describe('Maximum file size (e.g., "10MB", "1GB")'),
    backup: z.boolean().optional().default(false).describe('Whether to create backup files'),
    compression: z.boolean().optional().default(false).describe('Whether to compress the file'),
});

const SQLiteStorageSchema = z.object({
    type: z.literal('sqlite'),
    path: z.string().optional().describe('SQLite database file path (defaults to auto-generated)'),
    table: z.string().optional().describe('Table name (defaults to storage type)'),
});

const DatabaseStorageSchema = z.object({
    type: z.literal('database'),
    url: z.string().describe('Database connection URL'),
    table: z.string().optional().describe('Table/collection name (defaults to storage type)'),
    pool: z
        .object({
            min: z.number().int().nonnegative().optional().default(0),
            max: z.number().int().positive().optional().default(10),
        })
        .optional()
        .describe('Connection pool settings'),
    ssl: z.boolean().optional().describe('Whether to use SSL connection'),
});

const RedisStorageSchema = z.object({
    type: z.literal('redis'),
    url: z.string().describe('Redis connection URL'),
    keyPrefix: z.string().optional().describe('Prefix for all keys'),
    ttl: z.number().int().positive().optional().describe('Default TTL in seconds'),
    cluster: z.boolean().optional().default(false).describe('Whether to use Redis cluster mode'),
});

const S3StorageSchema = z.object({
    type: z.literal('s3'),
    bucket: z.string().describe('S3 bucket name'),
    region: z.string().describe('AWS region'),
    keyPrefix: z.string().optional().describe('Prefix for all object keys'),
    encryption: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to use server-side encryption'),
    storageClass: z
        .enum([
            'STANDARD',
            'REDUCED_REDUNDANCY',
            'STANDARD_IA',
            'ONEZONE_IA',
            'INTELLIGENT_TIERING',
            'GLACIER',
            'DEEP_ARCHIVE',
        ])
        .optional()
        .default('STANDARD'),
});

// Union of all storage provider types
const StorageProviderSchema = z.discriminatedUnion('type', [
    MemoryStorageSchema,
    FileStorageSchema,
    SQLiteStorageSchema,
    DatabaseStorageSchema,
    RedisStorageSchema,
    S3StorageSchema,
]);

// Storage configuration can be:
// 1. A simple string (defaults to memory)
// 2. A storage provider object
// 3. An object with provider + custom options
const StorageConfigSchema = z.union([
    z.string().transform((val) => {
        // Handle simple string configurations
        if (val === 'memory') return { type: 'memory' as const };
        if (val === 'file') return { type: 'file' as const, path: './storage' };
        if (val === 'sqlite') return { type: 'sqlite' as const };
        if (val.startsWith('file:')) return { type: 'file' as const, path: val.slice(5) };
        if (val.startsWith('sqlite:')) return { type: 'sqlite' as const, path: val.slice(7) };
        if (val.startsWith('redis:')) return { type: 'redis' as const, url: val };
        if (val.startsWith('postgres:') || val.startsWith('mysql:') || val.startsWith('mongodb:')) {
            return { type: 'database' as const, url: val };
        }
        if (val.startsWith('s3:')) {
            const [, bucket, region] = val.split(':');
            return { type: 's3' as const, bucket, region: region || 'us-east-1' };
        }
        throw new Error(`Invalid storage configuration: ${val}`);
    }),
    StorageProviderSchema,
]);

export const StorageSchema = z
    .object({
        // Global storage defaults
        default: StorageConfigSchema.optional()
            .default('memory')
            .describe('Default storage configuration for all types'),

        // Specific storage configurations
        history: StorageConfigSchema.optional().describe('Storage for conversation history'),
        allowedTools: StorageConfigSchema.optional().describe(
            'Storage for allowed tools configuration'
        ),
        userInfo: StorageConfigSchema.optional().describe('Storage for user information'),
        toolCache: StorageConfigSchema.optional().describe('Storage for tool response caching'),
        sessions: StorageConfigSchema.optional().describe('Storage for session data'),

        // Custom storage types (extensible)
        custom: z
            .record(StorageConfigSchema)
            .optional()
            .default({})
            .describe('Custom storage configurations'),
    })
    .transform((data) => {
        // Apply defaults: if a specific storage type isn't configured, use the default
        const defaultConfig = data.default;
        return {
            ...data,
            history: data.history ?? defaultConfig,
            allowedTools: data.allowedTools ?? defaultConfig,
            userInfo: data.userInfo ?? defaultConfig,
            toolCache: data.toolCache ?? defaultConfig,
            sessions: data.sessions ?? defaultConfig,
        };
    });

export type StorageConfig = z.infer<typeof StorageSchema>;

export const AgentConfigSchema = z
    .object({
        agentCard: AgentCardSchema.describe('Configuration for the agent card').optional(),
        mcpServers: ServerConfigsSchema.describe(
            'Configurations for MCP (Multi-Capability Peer) servers used by the agent'
        ),
        llm: LLMConfigSchema.describe('Core LLM configuration for the agent'),
        storage: StorageSchema.optional().describe('Storage configuration for the agent'),
        sessions: z
            .object({
                maxSessions: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .default(100)
                    .describe('Maximum number of concurrent sessions allowed, defaults to 100'),
                sessionTTL: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .default(3600000)
                    .describe(
                        'Session time-to-live in milliseconds, defaults to 3600000ms (1 hour)'
                    ),
            })
            .optional()
            .default({
                maxSessions: 100,
                sessionTTL: 3600000,
            })
            .describe('Session management configuration'),
    })
    .describe('Main configuration for an agent, including its LLM and server connections');
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
