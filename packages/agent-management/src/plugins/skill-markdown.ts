import { parse as parseYaml } from 'yaml';

export interface SkillFrontmatter {
    name?: string;
    description?: string;
}

/**
 * Reads the small metadata subset used by standalone Skills.
 * Invalid or absent frontmatter is treated as empty metadata so the file remains loadable.
 */
export function getSkillFrontmatter(markdown: string): SkillFrontmatter {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown);
    if (!match) return {};
    const rawFrontmatter = match[1];
    if (rawFrontmatter === undefined) return {};

    let parsed: unknown;
    try {
        parsed = parseYaml(rawFrontmatter);
    } catch {
        return {};
    }

    if (!isRecord(parsed)) return {};

    const name = stringField(parsed.name);
    const description = stringField(parsed.description);
    return {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
