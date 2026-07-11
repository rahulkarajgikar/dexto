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

// Patterns that indicate a URL contains a signed token that should NOT be redacted
// These are legitimate shareable URLs, not sensitive credentials
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

interface RedactionBudget {
    remaining: number;
    truncated: boolean;
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
    if (typeof input === 'string') {
        return redactString(input);
    }
    if (Array.isArray(input)) {
        if (seen.has(input)) return REDACTED_CIRCULAR;
        seen.add(input);
        return input.map((item) => redactSensitiveData(item, seen));
    }
    if (input && typeof input === 'object') {
        if (seen.has(input)) return REDACTED_CIRCULAR;
        seen.add(input);
        const result: any = {};
        for (const [key, value] of Object.entries(input)) {
            if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
                result[key] = REDACTED;
            } else {
                // First truncate file data (with parent context), then recursively redact
                const truncatedValue = truncateFileData(value, key, input);
                result[key] = redactSensitiveData(truncatedValue, seen);
            }
        }
        return result;
    }
    return input;
}

/**
 * Redacts while limiting how much of the input is visited and cloned.
 * Used for telemetry values that will be length-limited after serialization.
 */
export function redactSensitiveDataBounded(input: unknown, maxLen: number): unknown {
    return redactBounded(input, new WeakSet(), {
        remaining: Math.floor(maxLen),
        truncated: false,
    });
}

function redactBounded(input: unknown, seen: WeakSet<object>, budget: RedactionBudget): unknown {
    if (typeof input === 'bigint') {
        const maxDigits = Math.max(0, budget.remaining - 2);
        const digitLimit = 10n ** BigInt(maxDigits);
        if (maxDigits === 0 || input >= digitLimit || input <= -digitLimit) {
            budget.remaining = 0;
            budget.truncated = true;
            return '[BIGINT_TRUNCATED]';
        }
        const result = input.toString();
        if (result.length + 2 > budget.remaining) {
            budget.remaining = 0;
            budget.truncated = true;
            return '[BIGINT_TRUNCATED]';
        }
        budget.remaining -= result.length + 2;
        return result;
    }

    if (typeof input === 'string') {
        if (input.length + 2 > budget.remaining) {
            budget.remaining = 0;
            budget.truncated = true;
            return TRUNCATED;
        }
        budget.remaining -= input.length + 2;
        return redactString(input);
    }

    if (Array.isArray(input)) {
        if (seen.has(input)) return REDACTED_CIRCULAR;
        seen.add(input);
        budget.remaining = Math.max(0, budget.remaining - 2);
        const result: unknown[] = [];
        for (let index = 0; index < input.length; index += 1) {
            if (budget.remaining <= 1) {
                budget.truncated = true;
                result.push(TRUNCATED);
                break;
            }
            budget.remaining -= 1;
            result.push(redactBounded(input[index], seen, budget));
            if (budget.truncated) break;
        }
        return result;
    }

    if (input && typeof input === 'object') {
        if (seen.has(input)) return REDACTED_CIRCULAR;
        seen.add(input);
        budget.remaining = Math.max(0, budget.remaining - 2);
        const result: Record<string, unknown> = {};
        for (const key in input) {
            if (!Object.hasOwn(input, key)) continue;
            if (key === 'toJSON') continue;
            const propertyCost = key.length + 4;
            if (propertyCost > budget.remaining) {
                budget.truncated = true;
                result.__dexto_truncated__ = TRUNCATED;
                break;
            }
            budget.remaining -= propertyCost;
            if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
                result[key] = REDACTED;
                budget.remaining = Math.max(0, budget.remaining - REDACTED.length - 2);
                continue;
            }

            const value = Reflect.get(input, key);
            const truncatedValue = truncateFileData(value, key, input);
            result[key] = redactBounded(truncatedValue, seen, budget);
            if (budget.truncated) break;
        }
        return result;
    }

    budget.remaining = Math.max(0, budget.remaining - 8);
    return input;
}
