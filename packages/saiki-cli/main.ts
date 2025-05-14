#!/usr/bin/env node
import { existsSync } from 'fs';
import { Command, CommanderError } from 'commander';
import dotenv from 'dotenv';
import { logger } from '@truffle-ai/saiki-logger';
import {
    DEFAULT_CONFIG_PATH as CORE_DEFAULT_CONFIG_PATH_NAME,
    resolvePackagePath,
    createAgentServices,
    AgentServices,
    getProviderFromModel,
    getAllSupportedModels,
    SaikiAgent,
    AgentConfig,
    ServerConfigs,
} from '@truffle-ai/saiki-core';
import { startAiCli, startHeadlessCli } from './cli/index.js';
import { startWebUI } from './web/server/index.js';
import { startDiscordBot } from './discord/index.js';
import { startTelegramBot } from './telegram/index.js';
import { validateCliOptions, handleCliOptionsError } from './options.js';
import { fileURLToPath } from 'url';
import path from 'path';
import yaml from 'js-yaml';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Explicitly set the log level from environment
if (process.env.LOG_LEVEL) {
    logger.setLevel(process.env.LOG_LEVEL);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root of the @truffle-ai/saiki package (this CLI package)
// In a bundled CLI, __dirname is usually .../node_modules/@truffle-ai/saiki/dist
const SAIKI_CLI_PACKAGE_ROOT = path.resolve(__dirname, '..'); // Go up one from 'dist'

function resolveInternalServerPaths(
    configObject: AgentConfig,
    cliPackageRoot: string
): AgentConfig {
    if (configObject && configObject.mcpServers) {
        const servers = configObject.mcpServers as ServerConfigs; // Corrected type assertion
        for (const serverName in servers) {
            const serverConf = servers[serverName];
            if (
                serverConf.type === 'stdio' &&
                serverConf.command === 'node' &&
                serverConf.args &&
                serverConf.args.length > 0
            ) {
                const scriptPath = serverConf.args[0];
                // Resolve if it looks like a path meant to be internal to the CLI package
                // e.g., starts with 'dist/' or similar, and IS NOT absolute and NOT @-scoped
                if (
                    !path.isAbsolute(scriptPath) &&
                    !scriptPath.startsWith('@') &&
                    !scriptPath.startsWith('./') &&
                    !scriptPath.startsWith('../')
                ) {
                    const absolutePath = path.resolve(cliPackageRoot, scriptPath);
                    if (fs.existsSync(absolutePath)) {
                        // Use fs.existsSync
                        logger.debug(
                            `[CLI Config] Resolved internal server script for '${serverName}': ${scriptPath} -> ${absolutePath}`
                        );
                        serverConf.args[0] = absolutePath;
                    } else {
                        logger.warn(
                            `[CLI Config] Internal server script for '${serverName}' not found at ${absolutePath} (original: ${scriptPath}, cliPackageRoot: ${cliPackageRoot})`
                        );
                    }
                }
            }
        }
    }
    return configObject;
}

function determineFinalConfigPath(
    optionsConfigFile: string | undefined,
    envVarConfigPath: string | undefined
): { configPath: string; isCliBundledDefault: boolean } {
    // 1. CLI option --config-file (highest priority)
    if (optionsConfigFile) {
        logger.debug(`Using config path from --config-file CLI argument: ${optionsConfigFile}`);
        // For user-provided paths, we need to resolve them to be absolute if they aren't already.
        // resolvePackagePath with false will resolve from CWD if relative.
        return {
            configPath: resolvePackagePath(optionsConfigFile, false),
            isCliBundledDefault: false,
        };
    }

    // 2. SAIKI_CONFIG_PATH environment variable
    if (envVarConfigPath) {
        logger.debug(
            `Using config path from SAIKI_CONFIG_PATH environment variable: ${envVarConfigPath}`
        );
        // Similarly, resolve env var paths.
        return {
            configPath: resolvePackagePath(envVarConfigPath, false),
            isCliBundledDefault: false,
        };
    }

    // 3. Try to find monorepo root configuration/saiki.yml (for local development)
    // CORE_DEFAULT_CONFIG_PATH_NAME is 'configuration/saiki.yml'
    // resolvePackagePath(..., true) from core has the findMonorepoRootWithConfig logic.
    try {
        const monorepoRootConfigPath = resolvePackagePath(CORE_DEFAULT_CONFIG_PATH_NAME, true);
        // resolvePackagePath will throw if it can't find package.json upwards when resolveFromPackageRoot is true
        // AND if the target is not DEFAULT_CONFIG_PATH (which it is here).
        // More importantly, findMonorepoRootWithConfig (called by resolvePackagePath for DEFAULT_CONFIG_PATH)
        // returns the path if pnpm-workspace.yaml (etc.) AND configuration/saiki.yml exist at that root.
        // If it returns (doesn't throw and is not just CWD resolution of the name), it means it found the monorepo root default.
        // We need a more reliable check: does it exist and is it in a path that looks like our monorepo structure?
        // For now, if resolvePackagePath returns something that exists, assume it's the one.
        // The `resolvePackagePath` from core for `DEFAULT_CONFIG_PATH` first tries monorepo root.
        // If that attempt doesn't yield a file that exists, it might fall through to CWD resolution.
        // We only want to proceed if it *specifically* found the monorepo one.
        // The current `resolvePackagePath` returns the monorepo path if `findMonorepoRootWithConfig` succeeds.
        // `findMonorepoRootWithConfig` checks fs.existsSync(path.resolve(dir, DEFAULT_CONFIG_PATH)).
        // So, if monorepoRootConfigPath resolves from `resolvePackagePath(CORE_DEFAULT_CONFIG_PATH_NAME, true)`
        // and points to the actual monorepo-level 'configuration/saiki.yml', it should exist.
        if (
            fs.existsSync(monorepoRootConfigPath) &&
            monorepoRootConfigPath.includes(process.cwd())
        ) {
            // Second condition helps ensure it's not a global path by chance
            // And ensure it's not the bundled path itself by mistake if CWD is saiki-cli package root
            const cliBundledDir = path.resolve(SAIKI_CLI_PACKAGE_ROOT, 'default_configuration');
            if (!monorepoRootConfigPath.startsWith(cliBundledDir)) {
                logger.debug(
                    `Using monorepo root config (for local dev): ${monorepoRootConfigPath}`
                );
                return { configPath: monorepoRootConfigPath, isCliBundledDefault: false };
            }
        }
    } catch (error) {
        logger.debug(
            `Monorepo root config not found or error during check: ${error instanceof Error ? error.message : String(error)}`
        );
        // Fall through to CLI bundled default
    }

    // 4. Fallback to saiki-cli's own bundled default config (especially for published version)
    const cliBundledDefaultConfigPath = path.resolve(
        SAIKI_CLI_PACKAGE_ROOT,
        'default_configuration',
        'default.saiki.yml'
    );
    // logger.debug(`[ConfigDebug] __filename: ${__filename}`); // Already logged by caller if needed
    // logger.debug(`[ConfigDebug] __dirname: ${__dirname}`);
    logger.debug(
        `[ConfigDebug] Attempting to find bundled CLI default config at: ${cliBundledDefaultConfigPath}`
    );

    if (existsSync(cliBundledDefaultConfigPath)) {
        logger.debug(
            `Using bundled default config from @truffle-ai/saiki: ${cliBundledDefaultConfigPath}`
        );
        return { configPath: cliBundledDefaultConfigPath, isCliBundledDefault: true };
    }
    logger.warn(
        `[ConfigDebug] Bundled CLI default config NOT FOUND at: ${cliBundledDefaultConfigPath}. This is UNEXPECTED for a packaged CLI.`
    );

    // 5. Absolute Fallback: Use the CORE_DEFAULT_CONFIG_PATH_NAME string directly.
    // This lets saiki-core try to resolve 'configuration/saiki.yml' from CWD as a last resort.
    logger.warn(
        `No specific config found (CLI bundled or monorepo root). Falling back to CWD resolution for: ${CORE_DEFAULT_CONFIG_PATH_NAME}`
    );
    return {
        configPath: resolvePackagePath(CORE_DEFAULT_CONFIG_PATH_NAME, false),
        isCliBundledDefault: false,
    };
}

const program = new Command();

// Check if .env file exists
if (!existsSync('.env')) {
    logger.debug('WARNING: .env file not found.');
    logger.debug('If you are running locally, please create a .env file with your API key(s).');
    logger.debug('You can copy .env.example and fill in your API key(s).');
    logger.debug('Alternatively, ensure the required environment variables are set.');
    logger.debug('');
    logger.debug('Example .env content:');
    logger.debug('OPENAI_API_KEY=your_openai_api_key_here', null, 'green');
    logger.debug('GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key_here', null, 'green');
    logger.debug('ANTHROPIC_API_KEY=your_anthropic_api_key_here', null, 'green');
}

// Check for at least one required API key
if (
    !process.env.OPENAI_API_KEY &&
    !process.env.GOOGLE_GENERATIVE_AI_API_KEY &&
    !process.env.ANTHROPIC_API_KEY
) {
    logger.error(
        'ERROR: No API key found. Please set at least one of OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or ANTHROPIC_API_KEY in your environment or .env file.'
    );
    process.exit(1);
}

// Setup command line options
program
    .name('saiki')
    .description('AI-powered CLI and WebUI for interacting with MCP servers')
    .argument('[prompt...]', 'Optional headless prompt for single command mode')
    // General Options
    .option('-c, --config-file <path>', 'Path to config file')
    .option('-s, --strict', 'Require all server connections to succeed')
    .option('--no-verbose', 'Disable verbose output')
    .option('--mode <mode>', 'Run mode: cli, web, discord, or telegram', 'cli')
    .option('--web-port <port>', 'Port for WebUI', '3000')
    // LLM Options
    .option('-m, --model <model>', 'Specify the LLM model to use')
    .option('-r, --router <router>', 'Specify the LLM router to use (vercel or in-built)')
    .version('0.2.6');

program.parse();
const headlessInput = program.args.length > 0 ? program.args.join(' ') : undefined;
const options = program.opts();

const { configPath: finalConfigPath, isCliBundledDefault } = determineFinalConfigPath(
    options.configFile,
    process.env.SAIKI_CONFIG_PATH
);

// Dynamically infer provider and api key from the supplied model
if (options.model) {
    let modelProvider: string;
    try {
        modelProvider = getProviderFromModel(options.model);
    } catch (err) {
        // Model inference failed
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`ERROR: ${msg}`);
        logger.error(`Supported models are:\n${getAllSupportedModels().join(', ')}`);
        process.exit(1);
    }
    options.provider = modelProvider;

    // Dynamically extract the actual API key for the provider
    const providerEnvMap: Record<string, string> = {
        openai: 'OPENAI_API_KEY',
        anthropic: 'ANTHROPIC_API_KEY',
        google: 'GOOGLE_GENERATIVE_AI_API_KEY',
    };
    const envVarName = providerEnvMap[modelProvider];
    if (envVarName) {
        const key = process.env[envVarName];
        if (!key) {
            logger.error(
                `ERROR: Missing ${envVarName} environment variable for provider '${modelProvider}'.`
            );
            process.exit(1);
        }
        options.apiKey = key;
    }
}

const connectionMode = options.strict ? 'strict' : ('lenient' as 'strict' | 'lenient');
const runMode = options.mode.toLowerCase();
const webPort = parseInt(options.webPort, 10);

// basic validation of options here
try {
    validateCliOptions(options);
} catch (error) {
    handleCliOptionsError(error);
}

logger.info(`Initializing Saiki with resolved config path: ${finalConfigPath}`, null, 'blue');

// Conditionally display CLI examples
if (runMode === 'cli') {
    logger.info('');
    logger.info("Running in CLI mode. Use natural language or type 'exit' to quit.", 'cyanBright');
    logger.info('Examples:', 'yellow');
    logger.info('- "List all files in the current directory"');
    logger.info('- "Show system information"');
    logger.info('- "Create a new file called test.txt with \'Hello World\' as content"');
    logger.info('- "Run a simple python script that prints numbers from 1 to 10"');
    logger.info('');
}

// Main start function
async function startApp() {
    // Use createAgentServices to load, validate config and initialize all agent services
    const cliArgs = {
        model: options.model,
        provider: options.provider,
        router: options.router,
        apiKey: options.apiKey,
    };
    let services: AgentServices;
    let configArg: string | AgentConfig; // To pass either path or object

    if (isCliBundledDefault) {
        try {
            logger.debug(
                `Loading and pre-processing CLI bundled default config from: ${finalConfigPath}`
            );
            const rawConfig = fs.readFileSync(finalConfigPath, 'utf8');
            let parsedConfig = yaml.load(rawConfig) as AgentConfig;
            parsedConfig = resolveInternalServerPaths(parsedConfig, SAIKI_CLI_PACKAGE_ROOT);
            configArg = parsedConfig;
        } catch (e) {
            logger.error(
                `Failed to load or parse CLI bundled default config at ${finalConfigPath}: ${e instanceof Error ? e.message : String(e)}`
            );
            process.exit(1);
        }
    } else {
        configArg = finalConfigPath;
    }

    try {
        services = await createAgentServices(configArg, cliArgs, {
            connectionMode,
            runMode: runMode,
        });
    } catch (err) {
        if (err instanceof Error) {
            err.message.split('\n').forEach((line) => logger.error(line));
        } else {
            logger.error('Unexpected error during startup:', err);
        }
        process.exit(1);
    }

    logger.info('===============================================');
    logger.info(`Initializing Saiki in '${runMode}' mode...`, null, 'cyanBright');
    logger.info('===============================================\n');

    // Create the SaikiAgent instance
    const agent = new SaikiAgent(services);

    // Start based on mode
    if (runMode === 'cli') {
        if (headlessInput) {
            await startHeadlessCli(agent, headlessInput);
            process.exit(0);
        } else {
            await startAiCli(agent);
        }
    } else if (runMode === 'web') {
        const agentCard = services.configManager.getConfig().agentCard ?? {};
        startWebUI(agent, webPort, agentCard);
        logger.info(`WebUI available at http://localhost:${webPort}`, null, 'magenta');
    } else if (runMode === 'discord') {
        logger.info('Starting Discord bot...', null, 'cyanBright');
        try {
            startDiscordBot(agent);
        } catch (error) {
            logger.error('Failed to start Discord bot:', error);
            process.exit(1);
        }
    } else if (runMode === 'telegram') {
        logger.info('Starting Telegram bot...', null, 'cyanBright');
        try {
            startTelegramBot(agent);
        } catch (error) {
            logger.error('Failed to start Telegram bot:', error);
            process.exit(1);
        }
    }
}

// Execute the agent
startApp().catch((error) => {
    logger.error('Unhandled error during agent startup:');
    logger.error(error);
    process.exit(1);
});
