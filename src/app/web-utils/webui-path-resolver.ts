import { logger } from '@core/index.js';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Resolves the WebUI directory path across different installation scenarios
 */
export class WebUIPathResolver {
    private readonly scriptDir: string;

    constructor() {
        this.scriptDir = path.dirname(fileURLToPath(import.meta.url));
    }

    /**
     * Resolve the WebUI directory path
     * Handles different installation scenarios:
     * - Built/distributed package (webui in dist)
     * - Development mode (webui in src)
     * - npm link scenarios (webui in cwd)
     */
    async resolve(): Promise<string | null> {
        const candidates = this.getPathCandidates();

        for (const candidate of candidates) {
            if (this.isValidWebUIPath(candidate.path)) {
                logger.debug(`Found webui at: ${candidate.path} (${candidate.type})`);
                return candidate.path;
            }
        }

        logger.warn('Could not locate webui directory in any expected location');
        this.logTroubleshootingInfo();
        return null;
    }

    /**
     * Get the path to the Next.js binary
     */
    getNextBinaryPath(webuiPath: string): string | null {
        const nextBin = path.join(webuiPath, 'node_modules', '.bin', 'next');
        return existsSync(nextBin) ? nextBin : null;
    }

    /**
     * Get all possible path candidates in order of preference
     */
    private getPathCandidates(): Array<{ path: string; type: string }> {
        return [
            // 1. Built/distributed package location
            {
                path: path.resolve(this.scriptDir, 'webui'),
                type: 'distributed package',
            },
            // 2. Development source location
            {
                path: path.resolve(this.scriptDir, '..', '..', 'src', 'app', 'webui'),
                type: 'development source',
            },
            // 3. npm link scenario - cwd relative
            {
                path: path.resolve(process.cwd(), 'src', 'app', 'webui'),
                type: 'npm link (cwd)',
            },
            // 4. Alternative development location
            {
                path: path.resolve(this.scriptDir, '..', 'webui'),
                type: 'alternative development',
            },
        ];
    }

    /**
     * Check if a path is a valid WebUI directory
     */
    private isValidWebUIPath(candidatePath: string): boolean {
        if (!existsSync(candidatePath)) {
            return false;
        }

        const packageJsonPath = path.join(candidatePath, 'package.json');
        if (!existsSync(packageJsonPath)) {
            return false;
        }

        // Additional validation: check if it's actually a Next.js project
        try {
            const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(packageJsonContent);
            return packageJson.dependencies?.next || packageJson.devDependencies?.next;
        } catch {
            return false;
        }
    }

    /**
     * Log troubleshooting information when WebUI is not found
     */
    private logTroubleshootingInfo(): void {
        logger.error(
            'WebUI directory not found. This is unexpected as the webui should be included in the package.',
            null,
            'red'
        );

        logger.debug('Searched locations:');
        const candidates = this.getPathCandidates();
        candidates.forEach((candidate) => {
            const exists = existsSync(candidate.path);
            logger.debug(`  ${exists ? '✓' : '✗'} ${candidate.path} (${candidate.type})`);
        });

        logger.info('Possible fixes:');
        logger.info(
            '  1. Reinstall: npm uninstall -g @truffle-ai/saiki && npm install -g @truffle-ai/saiki'
        );
        logger.info('  2. Update: npm update -g @truffle-ai/saiki');
        logger.info('  3. Run from source: git clone repo && npm install && npm run build');
    }
}
