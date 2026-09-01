import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import { isSafeRelativeSkillPath } from '@dexto/core';
import type { LoadedSkill, SkillSummary, Skills } from '@dexto/core';
import { discoverClaudeCodePlugins } from './discover-plugins.js';
import { discoverStandaloneSkills } from './discover-skills.js';
import { loadClaudeCodePlugin } from './load-plugin.js';
import { getSkillFrontmatter, stripSkillFrontmatter } from './skill-markdown.js';

export interface LocalSkillRoot {
    /** Exact name exposed to callers and accepted by `skill_load`. */
    name: string;
    /** Absolute path to the skill's SKILL.md file. */
    skillFile: string;
    /** Optional host-provided routing description. */
    description?: string | undefined;
}

export interface CreateLocalSkillsOptions {
    workspaceRoot?: string | undefined;
    bundledPlugins?: string[] | undefined;
}

type SkillFile = {
    root: LocalSkillRoot;
    instructions: string;
    description: string;
};

/**
 * Local host implementation of the Core `Skills` contract.
 *
 * Roots are rediscovered for each operation so creator tools and ordinary file edits are visible
 * without a Core-level refresh/source abstraction.
 */
export class LocalSkills implements Skills {
    constructor(
        private readonly discoverRoots: () =>
            | readonly LocalSkillRoot[]
            | Promise<readonly LocalSkillRoot[]>
    ) {}

    async list(): Promise<readonly SkillSummary[]> {
        const summaries: SkillSummary[] = [];
        for (const root of await this.discoverRoots()) {
            const skill = await this.readSkillFile(root);
            if (!skill) continue;
            summaries.push({ name: skill.root.name, description: skill.description });
        }
        return summaries;
    }

    async load(name: string): Promise<LoadedSkill | null> {
        const skill = await this.findSkill(name);
        if (!skill) return null;

        return {
            name: skill.root.name,
            instructions: skill.instructions,
            supportingFiles: await listSupportingFiles(path.dirname(skill.root.skillFile)),
            filesLocation: 'workspace',
            baseDirectory: path.dirname(skill.root.skillFile),
        };
    }

    async readFile(name: string, requestedPath: string): Promise<string> {
        const skill = await this.findSkill(name);
        const skillDirectory = skill ? path.dirname(skill.root.skillFile) : undefined;
        const skillFile = skill?.root.skillFile;
        if (!skillDirectory || skillFile === undefined || !isSafeRelativeSkillPath(requestedPath)) {
            throw new Error(`Skill file not found: ${name}/${requestedPath}`);
        }

        const resolvedPath = path.resolve(skillDirectory, requestedPath);
        const directoryPrefix = `${path.resolve(skillDirectory)}${path.sep}`;
        if (!resolvedPath.startsWith(directoryPrefix) || resolvedPath === path.resolve(skillFile)) {
            throw new Error(`Skill file not found: ${name}/${requestedPath}`);
        }

        const notFoundMessage = `Skill file not found: ${name}/${requestedPath}`;
        try {
            const [physicalSkillDirectory, physicalResolvedPath, physicalSkillFile] =
                await Promise.all([
                    fs.realpath(skillDirectory),
                    fs.realpath(resolvedPath),
                    fs.realpath(skillFile),
                ]);
            const relativePath = path.relative(physicalSkillDirectory, physicalResolvedPath);
            if (
                relativePath.length === 0 ||
                relativePath === '..' ||
                relativePath.startsWith(`..${path.sep}`) ||
                path.isAbsolute(relativePath) ||
                physicalResolvedPath === physicalSkillFile
            ) {
                throw new Error(notFoundMessage);
            }

            return await fs.readFile(physicalResolvedPath, 'utf8');
        } catch {
            throw new Error(notFoundMessage);
        }
    }

    private async findSkill(name: string): Promise<SkillFile | null> {
        for (const root of await this.discoverRoots()) {
            if (root.name !== name) continue;
            const skill = await this.readSkillFile(root);
            if (skill) return skill;
        }
        return null;
    }

    private async readSkillFile(root: LocalSkillRoot): Promise<SkillFile | null> {
        let instructions: string;
        try {
            instructions = await fs.readFile(root.skillFile, 'utf8');
        } catch {
            return null;
        }

        const frontmatter = getSkillFrontmatter(instructions);
        if (frontmatter.name !== undefined && frontmatter.name !== root.name) {
            return null;
        }

        const description = root.description ?? frontmatter.description;
        return {
            root,
            instructions,
            description: description?.trim() || deriveDescription(instructions, root.name),
        };
    }
}

export function createLocalSkills(options: CreateLocalSkillsOptions = {}): LocalSkills {
    return new LocalSkills(() => discoverLocalSkillRoots(options));
}

function discoverLocalSkillRoots(options: CreateLocalSkillsOptions): LocalSkillRoot[] {
    const roots: LocalSkillRoot[] = [];
    const seenNames = new Set<string>();
    const addRoot = (root: LocalSkillRoot) => {
        if (seenNames.has(root.name)) return;
        seenNames.add(root.name);
        roots.push({ ...root, skillFile: path.resolve(root.skillFile) });
    };

    for (const skill of discoverStandaloneSkills(options.workspaceRoot)) {
        addRoot({ name: skill.name, skillFile: skill.skillFile });
    }

    for (const plugin of discoverClaudeCodePlugins(
        options.workspaceRoot,
        options.bundledPlugins ?? []
    )) {
        const loaded = loadClaudeCodePlugin(plugin);
        for (const command of loaded.commands) {
            if (!command.isSkill) continue;
            const skillName = path.basename(path.dirname(command.file));
            addRoot({
                name: `${command.namespace}:${skillName}`,
                skillFile: command.file,
            });
        }
    }

    return roots;
}

async function listSupportingFiles(skillDirectory: string): Promise<string[]> {
    const files: string[] = [];
    await walk(skillDirectory, skillDirectory, files);
    return files.sort();
}

async function walk(directory: string, rootDirectory: string, files: string[]): Promise<void> {
    let entries: Dirent[];
    try {
        entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            await walk(absolutePath, rootDirectory, files);
            continue;
        }
        if (!entry.isFile() || absolutePath === path.join(rootDirectory, 'SKILL.md')) continue;
        files.push(path.relative(rootDirectory, absolutePath).split(path.sep).join('/'));
    }
}

function deriveDescription(markdown: string, name: string): string {
    const withoutFrontmatter = stripSkillFrontmatter(markdown);
    const line = withoutFrontmatter
        .split('\n')
        .map((candidate) => candidate.trim())
        .find((candidate) => candidate.length > 0 && !candidate.startsWith('#'));
    return line ?? `Instructions for the ${name} skill.`;
}
