import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../logger/index.js';
import type { StorageContext } from './types.js';

/**
 * Resolves storage paths intelligently based on context
 */
export class StoragePathResolver {
    private static readonly SAIKI_DIR = '.saiki';
    private static readonly GLOBAL_SAIKI_DIR = '.saiki';

    /**
     * Resolve the base storage directory based on context
     */
    static async resolveStorageRoot(context: StorageContext): Promise<string> {
        // 1. Custom root takes precedence
        if (context.customRoot) {
            await this.ensureDirectory(context.customRoot);
            return context.customRoot;
        }

        // 2. Force global if specified
        if (context.forceGlobal) {
            const globalPath = path.join(os.homedir(), this.GLOBAL_SAIKI_DIR);
            await this.ensureDirectory(globalPath);
            return globalPath;
        }

        // 3. Try project-local first if we have a project root
        if (context.projectRoot) {
            const projectPath = path.join(context.projectRoot, this.SAIKI_DIR);

            // In development mode, prefer project-local
            if (context.isDevelopment) {
                await this.ensureDirectory(projectPath);
                logger.debug(`Using project-local storage: ${projectPath}`);
                return projectPath;
            }

            // In production, check if project-local exists and is writable
            try {
                await fs.access(projectPath, fs.constants.F_OK | fs.constants.W_OK);
                logger.debug(`Using existing project-local storage: ${projectPath}`);
                return projectPath;
            } catch {
                // Project-local doesn't exist or isn't writable, fall back to global
            }
        }

        // 4. Fall back to global storage
        const globalPath = path.join(os.homedir(), this.GLOBAL_SAIKI_DIR);
        await this.ensureDirectory(globalPath);
        logger.debug(`Using global storage: ${globalPath}`);
        return globalPath;
    }

    /**
     * Resolve a specific storage path within the storage root
     */
    static async resolveStoragePath(
        context: StorageContext,
        namespace: string,
        filename?: string
    ): Promise<string> {
        const root = await this.resolveStorageRoot(context);
        const namespacePath = path.join(root, namespace);
        await this.ensureDirectory(namespacePath);

        if (filename) {
            return path.join(namespacePath, filename);
        }

        return namespacePath;
    }

    /**
     * Detect if we're in a Saiki project by looking for indicators
     */
    static async detectProjectRoot(startPath: string = process.cwd()): Promise<string | null> {
        let currentPath = path.resolve(startPath);
        const rootPath = path.parse(currentPath).root;

        while (currentPath !== rootPath) {
            // Look for package.json with saiki dependency or .saiki directory
            const packageJsonPath = path.join(currentPath, 'package.json');
            const saikiFolderPath = path.join(currentPath, this.SAIKI_DIR);

            try {
                // Check for existing .saiki directory
                await fs.access(saikiFolderPath, fs.constants.F_OK);
                return currentPath;
            } catch {
                // Check for package.json with saiki dependency
                try {
                    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
                    if (this.isSaikiProject(packageJson)) {
                        return currentPath;
                    }
                } catch {
                    // Continue searching
                }
            }

            currentPath = path.dirname(currentPath);
        }

        return null;
    }

    /**
     * Create storage context from environment
     */
    static async createContext(
        options: {
            isDevelopment?: boolean;
            projectRoot?: string;
            forceGlobal?: boolean;
            customRoot?: string;
        } = {}
    ): Promise<StorageContext> {
        const isDevelopment = options.isDevelopment ?? process.env.NODE_ENV !== 'production';
        const projectRoot = options.projectRoot ?? (await this.detectProjectRoot());
        const forceGlobal = options.forceGlobal ?? false;

        // Create partial context to resolve storage root
        const partialContext: StorageContext = {
            isDevelopment,
            projectRoot: projectRoot || undefined,
            forceGlobal,
            customRoot: options.customRoot,
            storageRoot: '', // Will be resolved below
        };

        // Resolve the storage root
        const storageRoot = await this.resolveStorageRoot(partialContext);

        return {
            isDevelopment,
            projectRoot: projectRoot || undefined,
            forceGlobal,
            customRoot: options.customRoot,
            storageRoot,
        };
    }

    /**
     * Ensure a directory exists
     */
    private static async ensureDirectory(dirPath: string): Promise<void> {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error: any) {
            if (error.code !== 'EEXIST') {
                throw new Error(`Failed to create storage directory ${dirPath}: ${error.message}`);
            }
        }
    }

    /**
     * Check if a package.json indicates a Saiki project
     */
    private static isSaikiProject(packageJson: any): boolean {
        const dependencies = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
            ...packageJson.peerDependencies,
        };

        return (
            packageJson.name === 'saiki' ||
            'saiki' in dependencies ||
            '@saiki/core' in dependencies ||
            packageJson.keywords?.includes('saiki') ||
            packageJson.description?.toLowerCase().includes('saiki')
        );
    }
}
