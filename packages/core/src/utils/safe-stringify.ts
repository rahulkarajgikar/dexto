import { redactSensitiveData, redactSensitiveDataBounded } from './redactor.js';

const REDACTION_FAILED = '[UNSERIALIZABLE]';

/**
 * Safe stringify that handles circular references and BigInt.
 * Also redacts sensitive data to prevent PII leaks.
 *
 * @param value - Value to stringify
 * @param maxLen - Optional maximum length. If provided, truncates with '…(truncated)' suffix.
 */
export function safeStringify(value: unknown, maxLen?: number): string {
    try {
        if (typeof value === 'function') return truncateString('[FUNCTION]', maxLen);
        if (typeof value === 'symbol') return truncateString('[SYMBOL]', maxLen);
        if (value === undefined) return truncateString('undefined', maxLen);
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
        if (redacted === REDACTION_FAILED && typeof value === 'object' && value !== null) {
            return truncateString(REDACTION_FAILED, maxLen);
        }
        const str = JSON.stringify(redacted, (_, v) => {
            if (typeof v === 'bigint') return v.toString();
            return v;
        });
        if (typeof str === 'string') {
            return truncateString(str, maxLen);
        }
        return truncateString(REDACTION_FAILED, maxLen);
    } catch {
        return truncateString(REDACTION_FAILED, maxLen);
    }
}

function truncateString(value: string, maxLen?: number): string {
    if (maxLen === undefined || maxLen <= 0 || value.length <= maxLen) return value;
    const indicator = '…(truncated)';
    if (maxLen <= indicator.length) return value.slice(0, maxLen);
    return `${value.slice(0, maxLen - indicator.length)}${indicator}`;
}
