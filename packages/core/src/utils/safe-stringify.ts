import { redactSensitiveData, redactSensitiveDataBounded } from './redactor.js';

/**
 * Safe stringify that handles circular references and BigInt.
 * Also redacts sensitive data to prevent PII leaks.
 *
 * @param value - Value to stringify
 * @param maxLen - Optional maximum length. If provided, truncates with '…(truncated)' suffix.
 */
export function safeStringify(value: unknown, maxLen?: number): string {
    try {
        // Handle top-level BigInt without triggering JSON.stringify errors
        if (typeof value === 'bigint') {
            if (maxLen !== undefined && Number.isFinite(maxLen) && maxLen > 0) {
                const digitLimit = 10n ** BigInt(Math.floor(maxLen) + 1);
                if (value >= digitLimit || value <= -digitLimit) {
                    return truncateString('[BIGINT_TRUNCATED]', maxLen);
                }
            }
            return truncateString(value.toString(), maxLen);
        }
        // Bound traversal before cloning and JSON serialization for telemetry-sized values.
        const hasLimit = maxLen !== undefined && Number.isFinite(maxLen) && maxLen > 0;
        const redacted = hasLimit
            ? redactSensitiveDataBounded(value, maxLen)
            : redactSensitiveData(value);
        const str = JSON.stringify(redacted, (_, v) => {
            if (v instanceof Error) {
                return { name: v.name, message: v.message, stack: v.stack };
            }
            if (typeof v === 'bigint') return v.toString();
            return v;
        });
        if (typeof str === 'string') {
            return truncateString(str, maxLen);
        }
        return String(value);
    } catch {
        try {
            return String(value);
        } catch {
            return '[Unserializable value]';
        }
    }
}

function truncateString(value: string, maxLen?: number): string {
    if (maxLen === undefined || maxLen <= 0 || value.length <= maxLen) return value;
    const indicator = '…(truncated)';
    if (maxLen <= indicator.length) return value.slice(0, maxLen);
    return `${value.slice(0, maxLen - indicator.length)}${indicator}`;
}
