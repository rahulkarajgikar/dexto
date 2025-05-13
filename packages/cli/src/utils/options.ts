import { z } from 'zod';
import { logger } from '@saiki/logger'; // Assuming logger is a dependency
import { getSupportedProviders } from '@saiki/core'; // Assuming registry functions moved to core

/**
 * Validates the command-line options.
 * @param opts - The command-line options object from commander.
 * @throws {z.ZodError} If validation fails.
 */
export function validateCliOptions(opts: any): void {
    logger.debug('Validating command-line options', 'cyanBright');

    const supportedProviders = getSupportedProviders().map((p) => p.toLowerCase());

    // Base schema for primitive shape
    const cliOptionShape = z.object({
        configFile: z.string().nonempty('Config file path must not be empty'),
        strict: z.boolean().optional().default(false),
        verbose: z.boolean().optional().default(true),
        // Removed mode, webPort as they are specific to the app entry point
        provider: z.string().optional(),
        model: z.string().optional(),
        router: z.enum(['vercel', 'in-built']).optional(),
    });

    // Basic semantic validation
    const cliOptionSchema = cliOptionShape
        // provider must be one of the supported set if provided
        .refine(
            (data) => !data.provider || supportedProviders.includes(data.provider.toLowerCase()),
            {
                path: ['provider'],
                message: `Provider must be one of: ${supportedProviders.join(', ')}`,
            }
        );
    // Removed Discord/Telegram token checks as they belong in the respective packages or app

    // Execute validation
    cliOptionSchema.parse({
        configFile: opts.configFile,
        strict: opts.strict,
        verbose: opts.verbose,
        // mode: opts.mode.toLowerCase(), // Removed
        // webPort: opts.webPort, // Removed
        provider: opts.provider,
        model: opts.model,
        router: opts.router,
    });

    logger.debug('Command-line options validated successfully', 'green');
}

export function handleCliOptionsError(error: unknown): never {
    if (error instanceof z.ZodError) {
        logger.error('Invalid command-line options detected:');
        error.errors.forEach((err) => {
            const fieldName = err.path.join('.') || 'Unknown Option';
            logger.error(`- Option '${fieldName}': ${err.message}`);
        });
        logger.error(
            'Please check your command-line arguments or run with --help for usage details.'
        );
    } else {
        logger.error(
            `Validation error: ${error instanceof Error ? error.message : JSON.stringify(error)}`
        );
    }
    process.exit(1);
}
