/**
 * Utility to redact sensitive information from objects, arrays, and strings.
 * - Redacts by field name (e.g., apiKey, token, password, etc.)
 * - Redacts by value pattern (e.g., OpenAI keys, Bearer tokens, emails)
 * - Handles deeply nested structures and circular references
 * - Recursive and preserves structure
 * - Easy to extend
 */

// List of sensitive field names to redact (case-insensitive)
const SENSITIVE_FIELDS = [
    'apikey',
    'api_key',
    'token',
    'access_token',
    'refresh_token',
    'password',
    'secret',
];

// List of file data field names that should be truncated for logging
const FILE_DATA_FIELDS = [
    'base64',
    'filedata',
    'file_data',
    'imagedata',
    'image_data',
    'audiodata',
    'audio_data',
    'data',
];

// List of regex patterns to redact sensitive values
const SENSITIVE_PATTERNS: RegExp[] = [
    /\bsk-[A-Za-z0-9]{20,}\b/g, // OpenAI API keys (at least 20 chars after sk-)
    /\bBearer\s+[A-Za-z0-9\-_.=]+\b/gi, // Bearer tokens
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, // Emails
];

// JWT pattern - applied selectively (not to signed URLs)
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g;

// Pre-existing policy: signed storage URLs keep their tokens. This remains a telemetry exposure
// risk, but changing that policy is outside the bounded-memory experiment.
const SIGNED_URL_PATTERNS = [
    /supabase\.co\/storage\/.*\?token=/i, // Supabase signed URLs
    /\.r2\.cloudflarestorage\.com\/.*\?/i, // Cloudflare R2 signed URLs
    /\.s3\..*amazonaws\.com\/.*\?(X-Amz-|AWSAccessKeyId)/i, // AWS S3 presigned URLs
    /storage\.googleapis\.com\/.*\?/i, // Google Cloud Storage signed URLs
];

const REDACTED = '[REDACTED]';
const REDACTED_CIRCULAR = '[REDACTED_CIRCULAR]';
const FILE_DATA_TRUNCATED = '[FILE_DATA_TRUNCATED]';
const TRUNCATED = '[TRUNCATED]';
const REDACTION_FAILED = '[UNSERIALIZABLE]';

interface TraversalBudget {
    remaining: number;
    truncated: boolean;
}

interface TraversalState {
    seen: WeakSet<object>;
    budget?: TraversalBudget;
}

/**
 * Determines if a string looks like base64-encoded file data
 * @param value - String to check
 * @returns true if it appears to be large base64 data
 */
function isLargeBase64Data(value: string): boolean {
    // Check if it's a long string that looks like base64
    return value.length > 1000 && /^[A-Za-z0-9+/=]{1000,}$/.test(value.substring(0, 1000));
}

/**
 * Truncates large file data for logging purposes
 * @param value - The value to potentially truncate
 * @param key - The field name
 * @param parent - The parent object for context checking
 * @returns Truncated value with metadata or original value
 */
function truncateFileData(value: unknown, key: string, parent?: object): unknown {
    if (typeof value !== 'string') return value;
    const lowerKey = key.toLowerCase();
    // Gate "data" by presence of file-ish sibling metadata to avoid false positives
    const hasFileContext =
        !!parent && ('mimeType' in parent || 'filename' in parent || 'fileName' in parent);
    const looksLikeFileField =
        FILE_DATA_FIELDS.includes(lowerKey) || (lowerKey === 'data' && hasFileContext);
    if (looksLikeFileField && isLargeBase64Data(value)) {
        // Only log a concise marker + size; no content preview to prevent leakage
        return `${FILE_DATA_TRUNCATED} (${value.length} chars)`;
    }
    return value;
}

/**
 * Redacts sensitive data from an object, array, or string.
 * Handles circular references gracefully.
 * @param input - The data to redact
 * @param seen - Internal set to track circular references
 * @returns The redacted data
 */
/**
 * Checks if a string is a signed URL that should not have its token redacted
 */
function isSignedUrl(value: string): boolean {
    return SIGNED_URL_PATTERNS.some((pattern) => pattern.test(value));
}

function redactString(input: string): string {
    let result = input;
    for (const pattern of SENSITIVE_PATTERNS) {
        result = result.replace(pattern, REDACTED);
    }
    if (!isSignedUrl(result)) {
        result = result.replace(JWT_PATTERN, REDACTED);
    }
    return result;
}

export function redactSensitiveData(input: unknown, seen = new WeakSet()): unknown {
    try {
        return redactValue(input, { seen });
    } catch {
        return REDACTION_FAILED;
    }
}

/**
 * Redacts while limiting how much of the input is visited and cloned.
 * Used for telemetry values that will be length-limited after serialization.
 * Proxy enumeration and descriptor failures return a fixed marker, but JavaScript cannot preempt
 * an arbitrary proxy trap that does not return.
 */
export function redactSensitiveDataBounded(input: unknown, maxLen: number): unknown {
    try {
        return redactValue(input, {
            seen: new WeakSet(),
            budget: {
                remaining: Math.floor(maxLen),
                truncated: false,
            },
        });
    } catch {
        return REDACTION_FAILED;
    }
}

function redactValue(input: unknown, state: TraversalState): unknown {
    if (typeof input === 'bigint') {
        if (state.budget === undefined) return input;
        const maxDigits = Math.max(0, state.budget.remaining - 2);
        const digitLimit = 10n ** BigInt(maxDigits);
        if (maxDigits === 0 || input >= digitLimit || input <= -digitLimit) {
            return truncateTraversal(state, '[BIGINT_TRUNCATED]');
        }
        const result = input.toString();
        if (!consume(state, result.length + 2)) {
            return '[BIGINT_TRUNCATED]';
        }
        return result;
    }

    if (typeof input === 'string') {
        if (!consume(state, input.length + 2)) return TRUNCATED;
        return redactString(input);
    }

    if (Array.isArray(input)) {
        if (state.seen.has(input)) return REDACTED_CIRCULAR;
        state.seen.add(input);
        consume(state, 2);
        const result: unknown[] = [];
        const lengthDescriptor = Object.getOwnPropertyDescriptor(input, 'length');
        const length = lengthDescriptor?.value;
        if (typeof length !== 'number') return REDACTION_FAILED;
        for (let index = 0; index < length; index += 1) {
            if (!consume(state, 1)) {
                result.push(TRUNCATED);
                break;
            }
            const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
            if (descriptor === undefined || !('value' in descriptor)) {
                result.push(undefined);
                continue;
            }
            result.push(redactValue(descriptor.value, state));
            if (state.budget?.truncated === true) break;
        }
        return result;
    }

    if (input && typeof input === 'object') {
        if (state.seen.has(input)) return REDACTED_CIRCULAR;
        state.seen.add(input);
        consume(state, 2);
        if (input instanceof Error) return redactError(input, state);

        const result: Record<string, unknown> = {};
        for (const key in input) {
            if (key === 'toJSON') continue;
            const descriptor = Object.getOwnPropertyDescriptor(input, key);
            if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
                continue;
            }
            const propertyCost = key.length + 4;
            if (!consume(state, propertyCost)) {
                result.__dexto_truncated__ = TRUNCATED;
                break;
            }
            if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
                result[key] = REDACTED;
                consume(state, REDACTED.length + 2);
                continue;
            }

            const truncatedValue = truncateFileData(descriptor.value, key, input);
            result[key] = redactValue(truncatedValue, state);
            if (state.budget?.truncated === true) break;
        }
        return result;
    }

    consume(state, 8);
    return input;
}

function redactError(error: Error, state: TraversalState): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const name = readDataProperty(error, 'name');
    const message = readDataProperty(error, 'message');
    const stack = readDataProperty(error, 'stack');

    result.name = redactValue(typeof name === 'string' ? name : 'Error', state);
    result.message = redactValue(typeof message === 'string' ? message : '', state);
    if (typeof stack === 'string') result.stack = redactValue(stack, state);
    return result;
}

function readDataProperty(input: object, key: string): unknown {
    let current: object | null = input;
    while (current !== null) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (descriptor !== undefined) {
            return 'value' in descriptor ? descriptor.value : undefined;
        }
        current = Object.getPrototypeOf(current);
    }
    return undefined;
}

function consume(state: TraversalState, amount: number): boolean {
    if (state.budget === undefined) return true;
    if (amount <= state.budget.remaining) {
        state.budget.remaining -= amount;
        return true;
    }
    truncateTraversal(state, TRUNCATED);
    return false;
}

function truncateTraversal(state: TraversalState, marker: string): string {
    if (state.budget !== undefined) {
        state.budget.remaining = 0;
        state.budget.truncated = true;
    }
    return marker;
}
