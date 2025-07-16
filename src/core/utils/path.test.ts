import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { resolvePackagePath, DEFAULT_CONFIG_PATH } from './path.js';
import { walkUpDirectories } from './path.js';
import { walkUpDirectoriesAsync } from './path.js';
import { findPackageRoot } from './path.js';
import { findProjectRootByLockFiles } from './path.js';
import { isDirectoryPackage } from './path.js';
import { findPackageByName } from './path.js';
import { isCurrentDirectorySaikiProject } from './path.js';
import { findSaikiProjectRoot } from './path.js';
import { resolveSaikiLogPath } from './path.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

function createTempDir() {
    return fs.mkdtempSync(path.join(tmpdir(), 'saiki-test-'));
}

describe('resolvePackagePath', () => {
    it('returns the same path when given an absolute path', () => {
        const absolute = '/tmp/some/path';
        expect(resolvePackagePath(absolute, false)).toBe(absolute);
    });

    it('resolves a relative path against process.cwd when resolveFromPackageRoot is false', () => {
        const relative = 'some/relative/path';
        const expected = path.resolve(process.cwd(), relative);
        expect(resolvePackagePath(relative, false)).toBe(expected);
    });

    it('resolves the default config path from the package root when resolveFromPackageRoot is true', () => {
        const resolved = resolvePackagePath(DEFAULT_CONFIG_PATH, true);
        const expected = path.resolve(process.cwd(), DEFAULT_CONFIG_PATH);
        expect(resolved).toBe(expected);
    });
});

describe('walkUpDirectories', () => {
    it('returns null when no directories match the predicate', () => {
        const result = walkUpDirectories('/tmp', (dirPath) => dirPath === '/not/a/match');
        expect(result).toBeNull();
    });

    it('returns the first directory that matches the predicate', () => {
        const result = walkUpDirectories('/tmp', (dirPath) => dirPath.includes('tmp'));
        expect(result).toBe('/tmp');
    });
});

describe('walkUpDirectoriesAsync', () => {
    it('returns null if async predicate never matches', async () => {
        const result = await walkUpDirectoriesAsync(process.cwd(), async () => false);
        expect(result).toBeNull();
    });

    it('returns startPath if async predicate matches immediately', async () => {
        const start = process.cwd();
        const result = await walkUpDirectoriesAsync(start, async (dir) => dir === start);
        expect(result).toBe(start);
    });
});

describe('findPackageRoot', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempDir();
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns null if no package.json found', () => {
        const result = findPackageRoot(tempDir);
        expect(result).toBeNull();
    });

    it('returns the directory containing package.json', () => {
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-pkg' }));
        const result = findPackageRoot(tempDir);
        expect(result).toBe(tempDir);
    });
});

describe('findProjectRootByLockFiles', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempDir();
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns null if no lock file found', () => {
        const result = findProjectRootByLockFiles(tempDir);
        expect(result).toBeNull();
    });

    it('returns the directory containing package-lock.json', () => {
        fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');
        const result = findProjectRootByLockFiles(tempDir);
        expect(result).toBe(tempDir);
    });
});

describe('isDirectoryPackage', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempDir();
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns false if package.json does not exist', async () => {
        const result = await isDirectoryPackage(tempDir, 'some-package');
        expect(result).toBe(false);
    });

    it('returns true if package.json exists in the directory', async () => {
        fs.writeFileSync(
            path.join(tempDir, 'package.json'),
            JSON.stringify({ name: 'some-package' })
        );
        const result = await isDirectoryPackage(tempDir, 'some-package');
        expect(result).toBe(true);
    });
});

describe('findPackageByName', () => {
    it('returns null if package not found', async () => {
        const result = await findPackageByName('non-existent-package', '/tmp');
        expect(result).toBeNull();
    });

    it('returns the package path if found', async () => {
        const result = await findPackageByName('@truffle-ai/saiki', process.cwd());
        expect(result).toBe(process.cwd());
    });
});

describe('isCurrentDirectorySaikiProject', () => {
    it('returns false if not in a Saiki project', async () => {
        const result = await isCurrentDirectorySaikiProject('/tmp');
        expect(result).toBe(false);
    });

    it('returns true if in a Saiki project', async () => {
        const result = await isCurrentDirectorySaikiProject(process.cwd());
        expect(result).toBe(true);
    });
});

describe('findSaikiProjectRoot', () => {
    it('returns null if not in a Saiki project', async () => {
        const result = await findSaikiProjectRoot('/tmp');
        expect(result).toBeNull();
    });

    it('returns the Saiki project root if found', async () => {
        const result = await findSaikiProjectRoot(process.cwd());
        expect(result).toBe(process.cwd());
    });
});

describe('resolveSaikiLogPath', () => {
    it('resolves to local project .saiki/logs when in a Saiki project', async () => {
        // We're in a Saiki project (has agents/agent.yml)
        const result = await resolveSaikiLogPath();
        expect(result).toBe(path.join(process.cwd(), '.saiki', 'logs', 'saiki.log'));
    });

    it('accepts custom log file name', async () => {
        const result = await resolveSaikiLogPath('custom.log');
        expect(result).toBe(path.join(process.cwd(), '.saiki', 'logs', 'custom.log'));
    });
});
