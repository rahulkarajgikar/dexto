import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
    BasicTracerProvider,
    InMemorySpanExporter,
    SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { withSpan } from './decorators.js';

class InstrumentedValues {
    value(argument: unknown, result: unknown): unknown {
        return result;
    }

    async asyncValue(result: unknown): Promise<unknown> {
        return result;
    }

    fail(): never {
        throw new Error('operation failed');
    }
}

for (const method of ['value', 'asyncValue', 'fail']) {
    const descriptor = Object.getOwnPropertyDescriptor(InstrumentedValues.prototype, method);
    if (descriptor === undefined) {
        throw new Error(`Expected ${method} descriptor.`);
    }
    Object.defineProperty(
        InstrumentedValues.prototype,
        method,
        withSpan({ spanName: `test.${method}`, skipIfNoTelemetry: false })(
            InstrumentedValues.prototype,
            method,
            descriptor
        )
    );
}

describe('withSpan', () => {
    let contextManager: AsyncHooksContextManager | undefined;
    let exporter: InMemorySpanExporter;
    let provider: BasicTracerProvider | undefined;

    beforeEach(() => {
        contextManager = new AsyncHooksContextManager().enable();
        exporter = new InMemorySpanExporter();
        provider = new BasicTracerProvider();
        provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
        provider.register({ contextManager });
    });

    afterEach(async () => {
        if (provider !== undefined) {
            await provider.shutdown();
            provider = undefined;
        }
        contextManager?.disable();
        contextManager = undefined;
        trace.disable();
    });

    it('keeps scalar attributes while summarizing complex arguments and results', () => {
        const instrumented = new InstrumentedValues();

        expect(instrumented.value('small value', 42)).toBe(42);
        expect(instrumented.value({ nested: 'content' }, ['content'])).toEqual(['content']);

        const spans = exporter.getFinishedSpans().filter((span) => span.name === 'test.value');
        expect(spans[0]?.attributes).toEqual(
            expect.objectContaining({
                'test.value.argument.0': '"small value"',
                'test.value.argument.1': '42',
                'test.value.result': '42',
            })
        );
        expect(spans[1]?.attributes).toEqual(
            expect.objectContaining({
                'test.value.argument.0': '[Object]',
                'test.value.argument.1': '[Array]',
                'test.value.result': '[Array]',
            })
        );
    });

    it('does not expose secrets or inspect complex values', () => {
        let getterCalls = 0;
        const secretObject = {
            apiKey: 'sk-abcdefghijklmnopqrstuvwxyz',
            get payload() {
                getterCalls += 1;
                return 'test@example.com';
            },
        };

        const instrumented = new InstrumentedValues();
        instrumented.value(secretObject, 'Bearer abc.def-123');
        instrumented.value('sk-abcdefghijklmnopqrstuvwxyz'.repeat(100), true);

        const spans = exporter.getFinishedSpans().filter((span) => span.name === 'test.value');
        expect(spans[0]?.attributes).toEqual(
            expect.objectContaining({
                'test.value.argument.0': '[Object]',
                'test.value.result': '"[REDACTED]"',
            })
        );
        expect(spans[1]?.attributes).toEqual(
            expect.objectContaining({
                'test.value.argument.0': '[String(2900)]',
                'test.value.result': 'true',
            })
        );
        const attributes = JSON.stringify(spans.map((span) => span.attributes));
        expect(attributes).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
        expect(attributes).not.toContain('test@example.com');
        expect(getterCalls).toBe(0);
    });

    it('summarizes complex async results', async () => {
        await expect(new InstrumentedValues().asyncValue({ nested: 'content' })).resolves.toEqual({
            nested: 'content',
        });

        const span = exporter.getFinishedSpans().find((span) => span.name === 'test.asyncValue');
        expect(span?.attributes).toEqual(
            expect.objectContaining({
                'test.asyncValue.argument.0': '[Object]',
                'test.asyncValue.result': '[Object]',
            })
        );
    });

    it('preserves baggage, error status, and recorded exceptions', () => {
        const baggage = propagation.createBaggage({
            runId: { value: 'run-123' },
            sessionId: { value: 'session-123' },
        });

        expect(() =>
            context.with(propagation.setBaggage(context.active(), baggage), () =>
                new InstrumentedValues().fail()
            )
        ).toThrow('operation failed');

        const span = exporter.getFinishedSpans().find((span) => span.name === 'test.fail');
        expect(span?.attributes).toEqual(
            expect.objectContaining({
                'baggage.runId': 'run-123',
                'baggage.sessionId': 'session-123',
                runId: 'run-123',
                sessionId: 'session-123',
            })
        );
        expect(span?.status).toEqual(
            expect.objectContaining({ code: SpanStatusCode.ERROR, message: 'operation failed' })
        );
        expect(span?.events).toEqual(
            expect.arrayContaining([expect.objectContaining({ name: 'exception' })])
        );
    });
});
