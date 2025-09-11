import * as path from 'path';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { createRequire } from 'module';
import { walkUpDirectories } from './fs-walk.js';
import {
    getExecutionContext,
    findDextoSourceRoot,
    findDextoProjectRoot,
} from './execution-context.js';
import { logger } from '../logger/index.js';

/**
 * Standard path resolver for logs/db/config/anything in dexto projects
 * @param type Path type (logs, database, config, etc.)
 * @param filename Optional filename to append
 * @param startPath Starting directory for project detection
 * @returns Absolute path to the requested location
 */
export function getDextoPath(type: string, filename?: string, startPath?: string): string {
    const context = getExecutionContext(startPath);

    let basePath: string;

    switch (context) {
        case 'dexto-source': {
            const sourceRoot = findDextoSourceRoot(startPath);
            if (!sourceRoot) {
                throw new Error('Not in dexto source context');
            }
            basePath = path.join(sourceRoot, '.dexto', type);
            break;
        }
        case 'dexto-project': {
            const projectRoot = findDextoProjectRoot(startPath);
            if (!projectRoot) {
                throw new Error('Not in dexto project context');
            }
            basePath = path.join(projectRoot, '.dexto', type);
            break;
        }
        case 'global-cli': {
            basePath = path.join(homedir(), '.dexto', type);
            break;
        }
        default: {
            throw new Error(`Unknown execution context: ${context}`);
        }
    }

    return filename ? path.join(basePath, filename) : basePath;
}

/**
 * Global path resolver that ALWAYS returns paths in the user's home directory
 * Used for agent registry and other global-only resources that should not be project-relative
 * @param type Path type (agents, cache, etc.)
 * @param filename Optional filename to append
 * @returns Absolute path to the global location (~/.dexto/...)
 */
export function getDextoGlobalPath(type: string, filename?: string): string {
    // ALWAYS return global path, ignore project context
    const basePath = path.join(homedir(), '.dexto', type);
    return filename ? path.join(basePath, filename) : basePath;
}

/**
 * Copy entire directory recursively
 * @param src Source directory path
 * @param dest Destination directory path
 */
export async function copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

/**
 * Check if string looks like a file path vs registry name
 * @param str String to check
 * @returns True if looks like a path, false if looks like a registry name
 */
export function isPath(str: string): boolean {
    // Absolute paths
    if (path.isAbsolute(str)) return true;

    // Relative paths with separators
    if (/[\\/]/.test(str)) return true;

    // File extensions
    if (/\.(ya?ml|json)$/i.test(str)) return true;

    return false;
}

/**
 * Find package root (for other utilities)
 * @param startPath Starting directory path
 * @returns Directory containing package.json or null
 */
export function findPackageRoot(startPath: string = process.cwd()): string | null {
    return walkUpDirectories(startPath, (dirPath) => {
        const pkgPath = path.join(dirPath, 'package.json');
        return existsSync(pkgPath);
    });
}

/**
 * Resolve bundled script paths for MCP servers
 * @param scriptPath Relative script path
 * @returns Absolute path to bundled script
 */
export function resolveBundledScript(scriptPath: string): string {
    // Build list of candidate relative paths to try, favoring packaged (dist) first
    const candidates = scriptPath.startsWith('dist/')
        ? [scriptPath, scriptPath.replace(/^dist\//, '')]
        : [`dist/${scriptPath}`, scriptPath];

    // 1) Try to resolve from installed CLI package root (global/local install)
    try {
        const require = createRequire(import.meta.url);
        const pkgJson = require.resolve('dexto/package.json');
        const pkgRoot = path.dirname(pkgJson);
        for (const rel of candidates) {
            const abs = path.resolve(pkgRoot, rel);
            if (existsSync(abs)) return abs;
        }
    } catch {
        // ignore, fall through to dev/project resolution
    }

    // 2) Fallback to repo/project root (development)
    const repoRoot = findPackageRoot();
    if (repoRoot) {
        for (const rel of candidates) {
            const abs = path.resolve(repoRoot, rel);
            if (existsSync(abs)) return abs;
        }
    }

    // 3) Not found anywhere: throw with helpful message
    throw new Error(`Bundled script not found: ${scriptPath} (tried: ${candidates.join(', ')})`);
}

/**
 * Ensure ~/.dexto directory exists for global storage
 */
export async function ensureDextoGlobalDirectory(): Promise<void> {
    const dextoDir = path.join(homedir(), '.dexto');
    try {
        await fs.mkdir(dextoDir, { recursive: true });
    } catch (error) {
        // Directory might already exist, ignore EEXIST errors
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
            throw error;
        }
    }
}

/**
 * Get the appropriate .env file path for saving API keys.
 * Uses the same project detection logic as other dexto paths.
 *
 * @param startPath Starting directory for project detection
 * @returns Absolute path to .env file for saving
 */
export function getDextoEnvPath(startPath: string = process.cwd()): string {
    const context = getExecutionContext(startPath);
    let envPath = '';
    switch (context) {
        case 'dexto-source': {
            const sourceRoot = findDextoSourceRoot(startPath);
            if (!sourceRoot) {
                throw new Error('Not in dexto source context');
            }
            envPath = path.join(sourceRoot, '.env');
            break;
        }
        case 'dexto-project': {
            const projectRoot = findDextoProjectRoot(startPath);
            if (!projectRoot) {
                throw new Error('Not in dexto project context');
            }
            envPath = path.join(projectRoot, '.env');
            break;
        }
        case 'global-cli': {
            envPath = path.join(homedir(), '.dexto', '.env');
            break;
        }
    }
    logger.debug(`Dexto env path: ${envPath}, context: ${context}`);
    return envPath;
}
