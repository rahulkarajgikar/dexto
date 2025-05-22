import { logger } from '@core/index.js';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Manages WebUI dependencies installation and verification
 */
export class WebUIDependencyManager {
    /**
     * Ensure that all required dependencies are installed
     */
    async ensureDependencies(webuiPath: string): Promise<boolean> {
        if (this.areDependenciesInstalled(webuiPath)) {
            logger.debug('WebUI dependencies are already installed');
            return true;
        }

        logger.info(
            'Installing Next.js dependencies (first run after installation)...',
            null,
            'cyanBright'
        );

        return await this.installDependencies(webuiPath);
    }

    /**
     * Check if dependencies are already installed
     */
    private areDependenciesInstalled(webuiPath: string): boolean {
        const nodeModulesPath = path.join(webuiPath, 'node_modules');
        const nextPath = path.join(nodeModulesPath, 'next');

        return existsSync(nodeModulesPath) && existsSync(nextPath);
    }

    /**
     * Install dependencies using npm
     */
    private async installDependencies(webuiPath: string): Promise<boolean> {
        try {
            const success = await this.runNpmInstall(webuiPath);

            if (success) {
                logger.info('Dependencies installed successfully');
                return true;
            } else {
                logger.error('Failed to install dependencies');
                return false;
            }
        } catch (error) {
            logger.error(`Error during dependency installation: ${error}`);
            return false;
        }
    }

    /**
     * Run npm install in the webui directory
     */
    private async runNpmInstall(webuiPath: string): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            const installProcess = spawn('npm', ['install', '--omit=dev'], {
                cwd: webuiPath,
                stdio: 'inherit',
            });

            installProcess.on('error', (err) => {
                logger.error(`Failed to start npm install: ${err}`);
                resolve(false);
            });

            installProcess.on('exit', (code) => {
                if (code !== 0) {
                    logger.error(`npm install exited with code ${code}`);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    /**
     * Verify that critical dependencies are available
     */
    async verifyDependencies(webuiPath: string): Promise<boolean> {
        const criticalDependencies = ['next', 'react', 'react-dom'];

        for (const dep of criticalDependencies) {
            const depPath = path.join(webuiPath, 'node_modules', dep);
            if (!existsSync(depPath)) {
                logger.error(`Critical dependency missing: ${dep}`);
                return false;
            }
        }

        logger.debug('All critical dependencies verified');
        return true;
    }
}
