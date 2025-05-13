import { describe, it, expect, vi } from 'vitest';
import { ZodError } from 'zod';
import { validateCliOptions } from './options.js';
import * as CoreRegistry from '@saiki/core'; // Import core to mock

// Mock the core registry function used in validation
vi.mock('@saiki/core', async (importOriginal) => {
    const actual = await importOriginal<typeof CoreRegistry>();
    return {
        ...actual,
        getSupportedProviders: vi.fn(() => ['TestProvider1', 'TestProvider2']),
    };
});

describe('validateCliOptions', () => {
    it('does not throw for minimal valid options', () => {
        const opts = { configFile: 'config.yml' }; // Removed mode/webPort
        expect(() => validateCliOptions(opts)).not.toThrow();
    });

    it('does not throw for valid options with provider/model', () => {
        const opts = { configFile: 'config.yml', provider: 'testprovider1', model: 'testmodel' };
        expect(() => validateCliOptions(opts)).not.toThrow();
    });

    it('throws ZodError for missing configFile', () => {
        const opts = { provider: 'testprovider1' }; // Missing configFile
        expect(() => validateCliOptions(opts)).toThrow(ZodError);
        expect(() => validateCliOptions(opts)).toThrow(/Config file path must not be empty/);
    });

    it('throws ZodError for invalid provider', () => {
        const opts = { configFile: 'config.yml', provider: 'invalidprovider' };
        expect(() => validateCliOptions(opts)).toThrow(ZodError);
        expect(() => validateCliOptions(opts)).toThrow(
            /Provider must be one of: testprovider1, testprovider2/
        );
    });
});
