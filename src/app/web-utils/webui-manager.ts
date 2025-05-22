import { logger } from '@core/index.js';
import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import os from 'os';
import { WebUIPathResolver } from './webui-path-resolver.js';
import { WebUIDependencyManager } from './webui-dependency-manager.js';
import { WebUIEnvironmentBuilder } from './webui-environment-builder.js';

export interface WebUIConfig {
    apiUrl: string;
    frontPort: number;
    frontUrl: string;
    timeout?: number;
}

export interface WebUIStartResult {
    success: boolean;
    process?: ChildProcess;
    error?: string;
}

/**
 * Manages the lifecycle of the Next.js WebUI server
 */
export class WebUIManager {
    private pathResolver: WebUIPathResolver;
    private dependencyManager: WebUIDependencyManager;
    private environmentBuilder: WebUIEnvironmentBuilder;
    private nextProcess?: ChildProcess;

    constructor() {
        this.pathResolver = new WebUIPathResolver();
        this.dependencyManager = new WebUIDependencyManager();
        this.environmentBuilder = new WebUIEnvironmentBuilder();
    }

    /**
     * Start the Next.js WebUI server
     */
    async start(config: WebUIConfig): Promise<WebUIStartResult> {
        try {
            // Step 1: Resolve WebUI path
            const webuiPath = await this.pathResolver.resolve();
            if (!webuiPath) {
                return {
                    success: false,
                    error: 'WebUI directory not found. Please ensure the webui is properly installed.',
                };
            }

            logger.debug(`Using WebUI path: ${webuiPath}`);

            // Step 2: Ensure dependencies are installed
            const dependenciesReady = await this.dependencyManager.ensureDependencies(webuiPath);
            if (!dependenciesReady) {
                return {
                    success: false,
                    error: 'Failed to install or verify WebUI dependencies.',
                };
            }

            // Step 3: Start the Next.js server
            return await this.startNextJsProcess(webuiPath, config);
        } catch (error) {
            logger.error(`WebUI startup failed: ${error}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Stop the WebUI server
     */
    async stop(): Promise<void> {
        if (this.nextProcess) {
            logger.info('Stopping Next.js WebUI server...');
            this.nextProcess.kill('SIGTERM');
            this.nextProcess = undefined;
        }
    }

    /**
     * Check if the WebUI server is running
     */
    isRunning(): boolean {
        return this.nextProcess !== undefined && !this.nextProcess.killed;
    }

    /**
     * Start the Next.js process
     */
    private async startNextJsProcess(
        webuiPath: string,
        config: WebUIConfig
    ): Promise<WebUIStartResult> {
        logger.info(`Launching Next.js dev server on ${config.frontUrl}`, null, 'cyanBright');

        // Determine command and arguments
        const nextBin = this.pathResolver.getNextBinaryPath(webuiPath);
        const { command, args } = this.getNextJsCommand(nextBin, config.frontPort);

        logger.debug(`Starting Next.js with: ${command} ${args.join(' ')}`);

        // Build environment variables
        const env = this.environmentBuilder.build(config);

        // Spawn the process
        this.nextProcess = spawn(command, args, {
            cwd: webuiPath,
            stdio: ['inherit', 'pipe', 'inherit'],
            env,
        });

        // Wait for startup
        return await this.waitForStartup(config);
    }

    /**
     * Get the command and arguments for starting Next.js
     */
    private getNextJsCommand(
        nextBin: string | null,
        port: number
    ): { command: string; args: string[] } {
        if (nextBin && existsSync(nextBin)) {
            return {
                command: nextBin,
                args: ['dev', '--port', String(port)],
            };
        }

        return {
            command: 'npx',
            args: ['next', 'dev', '--port', String(port)],
        };
    }

    /**
     * Wait for the Next.js server to start up
     */
    private async waitForStartup(config: WebUIConfig): Promise<WebUIStartResult> {
        const timeout = config.timeout || 10000;
        logger.debug(`Waiting for Next.js server to start at: ${config.frontUrl}`, null, 'cyan');

        return new Promise<WebUIStartResult>((resolve) => {
            if (!this.nextProcess) {
                resolve({ success: false, error: 'Process not started' });
                return;
            }

            const timer = setTimeout(() => {
                logger.info(`Next.js server startup timeout reached, assuming it's running`);
                logger.info(`Next.js web UI available at: ${config.frontUrl}`, null, 'green');
                resolve({ success: true, process: this.nextProcess });
            }, timeout);

            // Handle process errors
            this.nextProcess.once('error', (err) => {
                logger.error(`Next.js dev server failed to start: ${err}`);
                clearTimeout(timer);
                resolve({ success: false, error: err.message });
            });

            // Handle process exit
            this.nextProcess.once('exit', (code) => {
                const message =
                    code !== 0
                        ? `Next.js dev server exited with code ${code}`
                        : 'Next.js dev server exited normally';

                if (code !== 0) {
                    logger.error(message, null, 'red');
                } else {
                    logger.info(message, null, 'green');
                }
                clearTimeout(timer);
                resolve({ success: false, error: message });
            });

            // Monitor stdout for ready message
            if (this.nextProcess.stdout) {
                this.nextProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    process.stdout.write(data); // Echo output

                    if (output.includes('Ready in')) {
                        logger.info('Next.js server started successfully');
                        logger.info(
                            `Next.js web UI available at: ${config.frontUrl}`,
                            null,
                            'green'
                        );
                        clearTimeout(timer);
                        resolve({ success: true, process: this.nextProcess });
                    }
                });
            }
        });
    }
}
