import path from 'path';
import fs from 'fs'; // Needed if you re-implement a simplified monorepo root finder for test
import { resolvePackagePath, DEFAULT_CONFIG_PATH } from './path.js';
import { describe, it, expect } from 'vitest';

// Helper to find monorepo root for test purposes (simplified)
function getTestMonorepoRoot(startDir: string): string | null {
    let dir = startDir;
    while (dir !== path.dirname(dir)) {
        // Stop at filesystem root
        if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
            // Or other monorepo marker
            return dir;
        }
        dir = path.dirname(dir);
    }
    return null;
}

describe('resolvePackagePath', () => {
    it('resolves absolute paths as-is', () => {
        const absolute = path.resolve('/tmp/config.yml');
        expect(resolvePackagePath(absolute, false)).toBe(absolute);
        expect(resolvePackagePath(absolute, true)).toBe(absolute);
    });

    it('resolves relative paths from CWD when resolveFromPackageRoot is false', () => {
        const relative = 'my/config.yml';
        const expected = path.resolve(process.cwd(), relative);
        expect(resolvePackagePath(relative, false)).toBe(expected);
    });

    it('resolves the default config path to the monorepo root config during local development', () => {
        const resolved = resolvePackagePath(DEFAULT_CONFIG_PATH, true);

        const monorepoRoot = getTestMonorepoRoot(process.cwd());
        if (!monorepoRoot) {
            throw new Error(
                "Test error: Could not determine monorepo root for testing path.js. Ensure 'pnpm-workspace.yaml' is present."
            );
        }
        const expectedMonorepoConfigPath = path.resolve(monorepoRoot, DEFAULT_CONFIG_PATH);

        if (fs.existsSync(expectedMonorepoConfigPath)) {
            expect(resolved).toBe(expectedMonorepoConfigPath);
        } else {
            const expectedCwdFallback = path.resolve(process.cwd(), DEFAULT_CONFIG_PATH);
            expect(resolved).toBe(expectedCwdFallback);
            console.warn(
                `Test for monorepo default config path skipped/adapted: ${expectedMonorepoConfigPath} not found. Testing CWD fallback.`
            );
        }
    });

    // Test for resolving OTHER paths relative to package root (not DEFAULT_CONFIG_PATH)
    it('resolves other paths relative to the current package root when resolveFromPackageRoot is true', () => {
        const otherPath = 'some/other/resource.json';
        const resolved = resolvePackagePath(otherPath, true);
        // process.cwd() for this test is packages/core/
        const expected = path.resolve(process.cwd(), otherPath);
        expect(resolved).toBe(expected);
    });
});
