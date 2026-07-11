import { describe, expect, test } from 'vitest';
import { safeStringify } from './safe-stringify.js';

describe('safeStringify', () => {
    test('bounds object traversal when a maximum length is supplied', () => {
        let tailReads = 0;
        const value: Record<string, unknown> = {
            apiKey: 'secret',
            payload: 'x'.repeat(10_000),
        };

        for (let index = 0; index < 100; index += 1) {
            Object.defineProperty(value, `tail${index}`, {
                enumerable: true,
                get() {
                    tailReads += 1;
                    return 'unvisited';
                },
            });
        }

        const result = safeStringify(value, 80);

        expect(result.length).toBeLessThanOrEqual(80);
        expect(result).toContain('[REDACTED]');
        expect(result).toContain('[TRUNCATED]');
        expect(tailReads).toBe(0);
    });

    test('does not invoke toJSON while serializing a bounded value', () => {
        let toJsonCalls = 0;
        const value = {
            toJSON() {
                toJsonCalls += 1;
                return { expanded: 'x'.repeat(10_000) };
            },
            apiKey: 'secret',
        };

        const result = safeStringify(value, 80);

        expect(result.length).toBeLessThanOrEqual(80);
        expect(result).toContain('[REDACTED]');
        expect(toJsonCalls).toBe(0);
    });

    test('preserves redaction, circular, BigInt, and Error output when the value fits', () => {
        const value: Record<string, unknown> = {
            apiKey: 'secret',
            count: 42n,
            error: new Error('boom'),
            message: 'Contact test@example.com',
        };
        value.self = value;

        expect(safeStringify(value, 1_000)).toBe(safeStringify(value));
    });

    test('bounds a top-level BigInt without changing small BigInt output', () => {
        const large = BigInt(`1${'0'.repeat(1_000)}`);

        expect(safeStringify(42n, 40)).toBe('42');
        expect(safeStringify(large, 40).length).toBeLessThanOrEqual(40);
        expect(safeStringify(large, 40)).toContain('TRUNCATED');
    });

    test('bounds nested BigInt conversion before visiting later fields', () => {
        let tailReads = 0;
        const value: Record<string, unknown> = {
            count: BigInt(`1${'0'.repeat(1_000)}`),
        };
        Object.defineProperty(value, 'tail', {
            enumerable: true,
            get() {
                tailReads += 1;
                return 'unvisited';
            },
        });

        const result = safeStringify(value, 80);

        expect(result.length).toBeLessThanOrEqual(80);
        expect(result).toContain('BIGINT_TRUNCATED');
        expect(tailReads).toBe(0);
    });
});
