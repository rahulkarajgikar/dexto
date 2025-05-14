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
} from '@truffle-ai/saiki-core';
import { startAiCli, startHeadlessCli } from './cli/index.js';
import { startWebUI } from './web/server/index.js';
import { startDiscordBot } from './discord/index.js';
import { startTelegramBot } from './telegram/index.js';
import { validateCliOptions, handleCliOptionsError } from './options.js';
import { fileURLToPath } from 'url';
import path from 'path';

// Load environment variables
dotenv.config();

// Explicitly set the log level from environment
if (process.env.LOG_LEVEL) {
    logger.setLevel(process.env.LOG_LEVEL);
}

const __filename = fileURLToPath(import.meta.url);
const cliDistDir = path.dirname(__filename);

function determineFinalConfigPath(
    optionsConfigFile: string | undefined,
    envVarConfigPath: string | undefined
): string {
    // 1. CLI option --config-file (highest priority)
    if (optionsConfigFile) {
        logger.debug(`Using config path from --config-file CLI argument: ${optionsConfigFile}`);
        return optionsConfigFile;
    }

    // 2. SAIKI_CONFIG_PATH environment variable
    if (envVarConfigPath) {
        logger.debug(
            `Using config path from SAIKI_CONFIG_PATH environment variable: ${envVarConfigPath}`
        );
        return envVarConfigPath;
    }

    // 3. saiki-cli's own bundled default config (for published version)
    // Assumes 'default_configuration' is copied into 'dist' during build.
    const cliBundledDefaultConfig = path.resolve(
        cliDistDir,
        'default_configuration', // This folder should be in 'dist'
        'default.saiki.yml'
    );
    if (existsSync(cliBundledDefaultConfig)) {
        logger.debug(`Using bundled default config from @saiki/cli: ${cliBundledDefaultConfig}`);
        return cliBundledDefaultConfig;
    }

    // 4. Fallback to CORE_DEFAULT_CONFIG_PATH_NAME from @truffle-ai/saiki-core
    // This will trigger the monorepo-root check or CWD fallback via resolvePackagePath in core.
    logger.debug(
        `No specific config found, falling back to core default logic for: ${CORE_DEFAULT_CONFIG_PATH_NAME}`
    );
    return CORE_DEFAULT_CONFIG_PATH_NAME; // This is 'configuration/saiki.yml'
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
    .version('0.2.0');

program.parse();
const headlessInput = program.args.length > 0 ? program.args.join(' ') : undefined;
const options = program.opts();

const finalConfigPath = determineFinalConfigPath(options.configFile, process.env.SAIKI_CONFIG_PATH);

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
    try {
        services = await createAgentServices(finalConfigPath, cliArgs, {
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
