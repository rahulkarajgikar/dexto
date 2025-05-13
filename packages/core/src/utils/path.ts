import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

/**
 * Default config file path (relative to package root)
 */
export const DEFAULT_CONFIG_PATH = 'configuration/saiki.yml';

/**
 * Resolve the configuration file path.
 * - If it's absolute, return as-is.
 * - If it's the default config, resolve relative to the package installation root.
 * - Otherwise resolve relative to the current working directory.
 */
export function resolvePackagePath(targetPath: string, resolveFromPackageRoot: boolean): string {
    if (path.isAbsolute(targetPath)) {
        return targetPath;
    }
    // If resolving from package root (typically for the default config path)
    // or if it's a user-specified relative path, resolve from CWD.
    // This assumes CWD is the project root when loading the default config.
    return path.resolve(process.cwd(), targetPath);
}
