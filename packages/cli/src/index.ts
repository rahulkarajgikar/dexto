#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { createAgentServices, SaikiAgent, type CLIConfigOverrides } from '@saiki/core';
import {
    getProviderFromModel,
    getAllSupportedModels,
    DEFAULT_CONFIG_PATH,
    resolvePackagePath,
} from '@saiki/core';
import { startAiCli, startHeadlessCli } from './cli.js';
import { logger } from '@saiki/logger';
import { validateCliOptions, handleCliOptionsError } from './utils/options.js';

// TODO: Move utility functions (path, service-initializer, options, registry) to core or dedicated utils package - This is now done by importing from @saiki/core

export async function runCli() {
    const program = new Command();

    // Setup command line options
    program
        .name('saiki-cli') // Renamed from 'saiki' to be specific
        .description('AI-powered CLI for interacting with MCP servers')
        .argument('[prompt...]', 'Optional headless prompt for single command mode')
        // General Options (Keep relevant ones)
        .option('-c, --config-file <path>', 'Path to config file', DEFAULT_CONFIG_PATH)
        .option('-s, --strict', 'Require all server connections to succeed')
        .option('--no-verbose', 'Disable verbose output')
        // LLM Options (Keep relevant ones)
        .option('-m, --model <model>', 'Specify the LLM model to use')
        .option('-r, --router <router>', 'Specify the LLM router to use (vercel or in-built)')
        .version('0.2.0'); // TODO: Get version dynamically from package.json

    program.parse(process.argv); // Use process.argv
    const headlessInput = program.args.length > 0 ? program.args.join(' ') : undefined;

    // Get options
    const options = program.opts();

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

    const configFile = options.configFile;
    const connectionMode = options.strict ? 'strict' : ('lenient' as 'strict' | 'lenient');
    const resolveFromPackageRoot = configFile === DEFAULT_CONFIG_PATH; // Check if should resolve from package root
    const normalizedConfigPath = resolvePackagePath(configFile, resolveFromPackageRoot);

    // basic validation of options here
    try {
        validateCliOptions(options);
    } catch (error) {
        handleCliOptionsError(error);
    }

    logger.info(`Initializing Saiki CLI with config: ${normalizedConfigPath}`, null, 'blue');

    // Conditionally display CLI examples
    logger.info('');
    logger.info("Running in CLI mode. Use natural language or type 'exit' to quit.", 'cyanBright');
    logger.info('Examples:', 'yellow');
    logger.info('- "List all files in the current directory"');
    logger.info('- "Show system information"');
    logger.info('- "Create a new file called test.txt with \'Hello World\' as content"');
    logger.info('- "Run a simple python script that prints numbers from 1 to 10"');
    logger.info('');

    // Main start function logic specific to CLI
    const cliArgs = {
        model: options.model,
        provider: options.provider,
        router: options.router,
        apiKey: options.apiKey,
    };
    let services;
    try {
        services = await createAgentServices(normalizedConfigPath, cliArgs, {
            connectionMode,
            runMode: 'cli', // Explicitly set to CLI
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
    logger.info("Initializing Saiki in 'cli' mode...", null, 'cyanBright');
    logger.info('===============================================\n');

    // Create the SaikiAgent instance
    const agent = new SaikiAgent(services);

    // Start CLI mode
    if (headlessInput) {
        await startHeadlessCli(agent, headlessInput);
        process.exit(0);
    } else {
        await startAiCli(agent);
    }
}

// Execute the CLI
runCli().catch((error) => {
    logger.error('Unhandled error in CLI execution:', error);
    process.exit(1);
});
