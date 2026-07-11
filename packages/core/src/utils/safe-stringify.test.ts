import { describe, expect, test } from 'vitest';
import { safeStringify } from './safe-stringify.js';

describe('safeStringify', () => {
    test('uses fixed markers for functions and symbols instead of stringifying their contents', () => {
        const secretFunction = function sk_thisMustNotBeSerialized() {
            return 'test@example.com';
        };

        expect(safeStringify(secretFunction)).toBe('[FUNCTION]');
        expect(safeStringify(secretFunction, 40)).toBe('[FUNCTION]');
        expect(safeStringify(Symbol('test@example.com'))).toBe('[SYMBOL]');
        expect(safeStringify(Symbol('test@example.com'), 40)).toBe('[SYMBOL]');
        expect(safeStringify('[UNSERIALIZABLE]')).toBe('"[UNSERIALIZABLE]"');
    });

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

    test('does not invoke toJSON while serializing bounded or unbounded values', () => {
        let toJsonCalls = 0;
        const value = {
            toJSON() {
                toJsonCalls += 1;
                return { expanded: 'x'.repeat(10_000) };
            },
            apiKey: 'secret',
        };

        const unboundedResult = safeStringify(value);
        const boundedResult = safeStringify(value, 80);

        expect(unboundedResult).toBe('{"apiKey":"[REDACTED]"}');
        expect(boundedResult.length).toBeLessThanOrEqual(80);
        expect(boundedResult).toContain('[REDACTED]');
        expect(toJsonCalls).toBe(0);
    });

    test('omits accessors without invoking them in bounded or unbounded values', () => {
        let accessorCalls = 0;
        const value: Record<string, unknown> = {};
        Object.defineProperty(value, 'dangerous', {
            enumerable: true,
            get() {
                accessorCalls += 1;
                throw new Error('getter must not run');
            },
        });
        value.safe = 'ok';

        expect(safeStringify(value)).toBe('{"safe":"ok"}');
        expect(safeStringify(value, 80)).toBe('{"safe":"ok"}');
        expect(accessorCalls).toBe(0);
    });

    test('preserves redaction, circular, and BigInt output when the value fits', () => {
        const value: Record<string, unknown> = {
            apiKey: 'secret',
            count: 42n,
            message: 'Contact test@example.com',
        };
        value.self = value;

        expect(safeStringify(value, 1_000)).toBe(safeStringify(value));
    });

    test('serializes and redacts Error name, message, and stack data properties', () => {
        const error = new TypeError('Contact test@example.com');
        error.stack = 'TypeError: Contact test@example.com\n    at safe-location';

        const expected = {
            name: 'TypeError',
            message: 'Contact [REDACTED]',
            stack: 'TypeError: Contact [REDACTED]\n    at safe-location',
        };

        expect(JSON.parse(safeStringify(error))).toEqual(expected);
        expect(JSON.parse(safeStringify(error, 1_000))).toEqual(expected);
    });

    test('returns a fixed marker when proxy enumeration fails without calling toString', () => {
        let toStringCalls = 0;
        const value = new Proxy(
            {
                toString() {
                    toStringCalls += 1;
                    return 'test@example.com';
                },
            },
            {
                ownKeys() {
                    throw new Error('enumeration failed');
                },
            }
        );

        expect(safeStringify(value)).toBe('[UNSERIALIZABLE]');
        expect(safeStringify(value, 80)).toBe('[UNSERIALIZABLE]');
        expect(toStringCalls).toBe(0);
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
