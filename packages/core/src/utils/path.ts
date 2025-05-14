import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

/**
 * Default config file path (relative to package root)
 */
export const DEFAULT_CONFIG_PATH = 'configuration/saiki.yml';

function findMonorepoRootWithConfig(startDir: string): string | null {
    let dir = startDir;
    while (true) {
        const isPnpm = fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'));
        const isLerna = fs.existsSync(path.join(dir, 'lerna.json'));
        const isRootPkgJsonWithWorkspaces =
            fs.existsSync(path.join(dir, 'package.json')) &&
            JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'))?.workspaces;

        if (isPnpm || isLerna || isRootPkgJsonWithWorkspaces) {
            // This is a potential monorepo root. Check if DEFAULT_CONFIG_PATH exists here.
            if (fs.existsSync(path.resolve(dir, DEFAULT_CONFIG_PATH))) {
                return path.resolve(dir, DEFAULT_CONFIG_PATH); // Return the full path to the config
            }
            // If it's a monorepo root but doesn't have the config, we don't want this path for DEFAULT_CONFIG_PATH.
            // We'll let it fall through or be handled by other logic.
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            return null; // Reached filesystem root
        }
        dir = parent;
    }
}

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

    const scriptPath = fileURLToPath(import.meta.url);
    const scriptDir = path.dirname(scriptPath);

    if (resolveFromPackageRoot) {
        // Special handling if we're trying to resolve the DEFAULT_CONFIG_PATH from a package root context
        if (targetPath === DEFAULT_CONFIG_PATH) {
            const monorepoConfigPath = findMonorepoRootWithConfig(scriptDir);
            if (monorepoConfigPath) {
                return monorepoConfigPath; // Found in monorepo root
            }
            // If not in monorepo root, or monorepo root doesn't have DEFAULT_CONFIG_PATH,
            // then we don't assume @truffle-ai/saiki-core has it either.
            // Fall through to CWD resolution for DEFAULT_CONFIG_PATH as a last resort for local execution from root.
            // This means if main.ts calls with DEFAULT_CONFIG_PATH and resolveFromPackageRoot=true,
            // and findMonorepoRootWithConfig fails, it will try to resolve 'configuration/saiki.yml' from CWD.
        } else {
            // If resolveFromPackageRoot is true for OTHER paths (not DEFAULT_CONFIG_PATH),
            // resolve relative to the current package's (@truffle-ai/saiki-core) root.
            let currentPackageRoot = scriptDir;
            while (true) {
                const pkgPath = path.join(currentPackageRoot, 'package.json');
                if (fs.existsSync(pkgPath)) {
                    return path.resolve(currentPackageRoot, targetPath);
                }
                const parent = path.dirname(currentPackageRoot);
                if (parent === currentPackageRoot) {
                    throw new Error(
                        `Cannot find package root for ${scriptDir} when resolving path: ${targetPath}`
                    );
                }
                currentPackageRoot = parent;
            }
        }
    }

    // For:
    // 1. User-specified relative paths (resolveFromPackageRoot = false).
    // 2. DEFAULT_CONFIG_PATH when resolveFromPackageRoot=true but monorepo lookup failed.
    return path.resolve(process.cwd(), targetPath);
}
