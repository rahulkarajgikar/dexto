import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatSession } from './chat-session.js';
import type { LLMConfig } from '../../config/schemas.js';

// Mock all the dependencies
vi.mock('../llm/messages/history/factory.js');
vi.mock('../llm/messages/factory.js');
vi.mock('../llm/services/factory.js');
vi.mock('../llm/tokenizer/factory.js');
vi.mock('../llm/messages/formatters/factory.js');
vi.mock('../llm/registry.js');
vi.mock('../../logger/index.js');

// Import the mocked modules
import * as historyFactory from '../llm/messages/history/factory.js';
import * as messageFactory from '../llm/messages/factory.js';
import * as serviceFactory from '../llm/services/factory.js';
import * as tokenizerFactory from '../llm/tokenizer/factory.js';
import * as formatterFactory from '../llm/messages/formatters/factory.js';
import * as registry from '../llm/registry.js';

const mockHistoryFactory = vi.mocked(historyFactory);
const mockMessageFactory = vi.mocked(messageFactory);
const mockServiceFactory = vi.mocked(serviceFactory);
const mockTokenizerFactory = vi.mocked(tokenizerFactory);
const mockFormatterFactory = vi.mocked(formatterFactory);
const mockRegistry = vi.mocked(registry);

describe('ChatSession', () => {
    let chatSession: ChatSession;
    let mockServices: any;
    let mockHistoryProvider: any;
    let mockMessageManager: any;
    let mockLLMService: any;
    let mockCollectionProvider: any;

    const mockLLMConfig: LLMConfig = {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key',
        router: 'in-built',
        systemPrompt: 'You are a helpful assistant',
        maxIterations: 50,
        maxTokens: 128000,
        providerOptions: {},
    };

    const sessionId = 'test-session-123';

    beforeEach(() => {
        vi.resetAllMocks();

        // Mock history provider
        mockHistoryProvider = {
            addMessage: vi.fn(),
            getHistory: vi.fn().mockResolvedValue([]),
            clearHistory: vi.fn(),
            getMessageCount: vi.fn().mockReturnValue(0),
        };

        // Mock message manager
        mockMessageManager = {
            addUserMessage: vi.fn(),
            addAssistantMessage: vi.fn(),
            getHistory: vi.fn().mockResolvedValue([]),
            resetConversation: vi.fn(),
            updateConfig: vi.fn(),
            getTokenCount: vi.fn().mockReturnValue(100),
        };

        // Mock LLM service
        mockLLMService = {
            completeTask: vi.fn().mockResolvedValue('Test response'),
            getAllTools: vi.fn().mockResolvedValue({}),
            getConfig: vi.fn().mockReturnValue(mockLLMConfig),
        };

        // Mock collection provider
        mockCollectionProvider = {
            insert: vi.fn(),
            find: vi.fn().mockResolvedValue([]),
            update: vi.fn(),
            delete: vi.fn(),
            clear: vi.fn(),
        };

        // Mock services
        mockServices = {
            stateManager: {
                getLLMConfig: vi.fn().mockReturnValue(mockLLMConfig),
                updateLLM: vi.fn().mockReturnValue({ isValid: true, errors: [], warnings: [] }),
            },
            promptManager: {
                getSystemPrompt: vi.fn().mockReturnValue('System prompt'),
            },
            clientManager: {
                getAllTools: vi.fn().mockResolvedValue({}),
            },
            agentEventBus: {
                emit: vi.fn(),
            },
            storageManager: {
                getCollectionProvider: vi.fn().mockResolvedValue(mockCollectionProvider),
            },
        };

        // Setup factory mocks
        mockHistoryFactory.createHistoryProviderWithStorage.mockResolvedValue(mockHistoryProvider);
        mockMessageFactory.createMessageManager.mockReturnValue(mockMessageManager);
        mockServiceFactory.createLLMService.mockReturnValue(mockLLMService);
        mockRegistry.getEffectiveMaxTokens.mockReturnValue(128000);

        // Create ChatSession instance
        chatSession = new ChatSession(mockServices, sessionId);
    });

    afterEach(() => {
        // Clean up any resources
        if (chatSession) {
            chatSession.dispose();
        }
    });

    describe('Session Identity and Lifecycle', () => {
        test('should maintain session identity throughout lifecycle', () => {
            expect(chatSession.id).toBe(sessionId);
            expect(chatSession.eventBus).toBeDefined();
        });

        test('should initialize with unified storage system', async () => {
            await chatSession.init();

            // Verify it uses the unified storage approach
            expect(mockServices.storageManager.getCollectionProvider).toHaveBeenCalledWith(
                'history'
            );
            expect(mockHistoryFactory.createHistoryProviderWithStorage).toHaveBeenCalledWith(
                mockCollectionProvider
            );
        });

        test('should properly dispose resources to prevent memory leaks', () => {
            const eventSpy = vi.spyOn(chatSession.eventBus, 'off');

            chatSession.dispose();
            chatSession.dispose(); // Should not throw on multiple calls

            expect(eventSpy).toHaveBeenCalled();
        });
    });

    describe('Event System Integration', () => {
        beforeEach(async () => {
            await chatSession.init();
        });

        test('should forward all session events to agent bus with session context', () => {
            const testPayload = { message: 'test data' };

            chatSession.eventBus.emit('llmservice:response', testPayload);

            expect(mockServices.agentEventBus.emit).toHaveBeenCalledWith('llmservice:response', {
                ...testPayload,
                sessionId,
            });
        });

        test('should handle events with no payload by adding session context', () => {
            chatSession.eventBus.emit('llmservice:thinking');

            expect(mockServices.agentEventBus.emit).toHaveBeenCalledWith('llmservice:thinking', {
                sessionId,
            });
        });

        test('should emit conversation reset events at both session and agent level', async () => {
            const sessionEmitSpy = vi.spyOn(chatSession.eventBus, 'emit');

            await chatSession.reset();

            expect(sessionEmitSpy).toHaveBeenCalledWith('messageManager:conversationReset');
            expect(mockServices.agentEventBus.emit).toHaveBeenCalledWith(
                'saiki:conversationReset',
                { sessionId }
            );
        });
    });

    describe('LLM Configuration Management', () => {
        beforeEach(async () => {
            await chatSession.init();
        });

        test('should optimize LLM switching by only creating new components when necessary', async () => {
            const newLLMConfig: LLMConfig = {
                ...mockLLMConfig,
                model: 'gpt-4-turbo', // Same provider and router
            };

            await chatSession.switchLLM(newLLMConfig);

            // Should not create new tokenizer/formatter since provider and router didn't change
            expect(mockTokenizerFactory.createTokenizer).not.toHaveBeenCalled();
            expect(mockFormatterFactory.createMessageFormatter).not.toHaveBeenCalled();
        });

        test('should create new tokenizer when provider changes', async () => {
            const newLLMConfig: LLMConfig = {
                ...mockLLMConfig,
                provider: 'anthropic',
                model: 'claude-3-opus',
            };

            const newTokenizer = {
                encode: vi.fn(),
                decode: vi.fn(),
                countTokens: vi.fn().mockReturnValue(10),
                getProviderName: vi.fn().mockReturnValue('anthropic'),
            };
            mockTokenizerFactory.createTokenizer.mockReturnValue(newTokenizer);

            await chatSession.switchLLM(newLLMConfig);

            expect(mockTokenizerFactory.createTokenizer).toHaveBeenCalledWith(
                'anthropic',
                'claude-3-opus'
            );
        });

        test('should create new formatter when router changes', async () => {
            const newLLMConfig: LLMConfig = {
                ...mockLLMConfig,
                router: 'vercel', // Different router
            };

            const newFormatter = {
                formatMessages: vi.fn(),
                format: vi.fn(),
                parseResponse: vi.fn(),
            };
            mockFormatterFactory.createMessageFormatter.mockReturnValue(newFormatter);

            await chatSession.switchLLM(newLLMConfig);

            expect(mockFormatterFactory.createMessageFormatter).toHaveBeenCalledWith(
                'openai',
                'vercel'
            );
        });

        test('should update message manager configuration during LLM switch', async () => {
            const newLLMConfig: LLMConfig = {
                ...mockLLMConfig,
                provider: 'anthropic',
                model: 'claude-3-opus',
            };

            const newMaxTokens = 200000;
            const newTokenizer = {
                encode: vi.fn(),
                decode: vi.fn(),
                countTokens: vi.fn().mockReturnValue(10),
                getProviderName: vi.fn().mockReturnValue('anthropic'),
            };
            const newFormatter = {
                formatMessages: vi.fn(),
                format: vi.fn(),
                parseResponse: vi.fn(),
            };

            mockRegistry.getEffectiveMaxTokens.mockReturnValue(newMaxTokens);
            mockTokenizerFactory.createTokenizer.mockReturnValue(newTokenizer);
            mockFormatterFactory.createMessageFormatter.mockReturnValue(newFormatter);

            await chatSession.switchLLM(newLLMConfig);

            expect(mockMessageManager.updateConfig).toHaveBeenCalledWith(
                newMaxTokens,
                newTokenizer,
                newFormatter
            );
        });

        test('should emit LLM switched event with correct metadata', async () => {
            const newLLMConfig: LLMConfig = {
                ...mockLLMConfig,
                provider: 'anthropic',
                model: 'claude-3-opus',
            };

            const emitSpy = vi.spyOn(chatSession.eventBus, 'emit');

            await chatSession.switchLLM(newLLMConfig);

            expect(emitSpy).toHaveBeenCalledWith('llmservice:switched', {
                newConfig: newLLMConfig,
                router: newLLMConfig.router,
                historyRetained: true,
            });
        });
    });

    describe('Error Handling and Resilience', () => {
        test('should handle storage initialization failures gracefully', async () => {
            mockHistoryFactory.createHistoryProviderWithStorage.mockRejectedValue(
                new Error('Storage initialization failed')
            );

            await expect(chatSession.init()).rejects.toThrow('Storage initialization failed');
        });

        test('should handle message manager creation failures', async () => {
            mockMessageFactory.createMessageManager.mockImplementation(() => {
                throw new Error('Message manager creation failed');
            });

            await expect(chatSession.init()).rejects.toThrow('Message manager creation failed');
        });

        test('should handle LLM service creation failures', async () => {
            mockServiceFactory.createLLMService.mockImplementation(() => {
                throw new Error('LLM service creation failed');
            });

            await expect(chatSession.init()).rejects.toThrow('LLM service creation failed');
        });

        test('should handle LLM switch failures and propagate errors', async () => {
            await chatSession.init();

            const newLLMConfig: LLMConfig = {
                ...mockLLMConfig,
                provider: 'invalid',
                model: 'invalid-model',
            };

            mockServiceFactory.createLLMService.mockImplementation(() => {
                throw new Error('Invalid LLM configuration');
            });

            await expect(chatSession.switchLLM(newLLMConfig)).rejects.toThrow(
                'Invalid LLM configuration'
            );
        });

        test('should handle conversation errors from LLM service', async () => {
            await chatSession.init();

            const input = 'Test input';
            const error = new Error('LLM service error');

            mockLLMService.completeTask.mockRejectedValue(error);

            await expect(chatSession.run(input)).rejects.toThrow('LLM service error');
        });
    });

    describe('Service Integration Points', () => {
        beforeEach(async () => {
            await chatSession.init();
        });

        test('should delegate conversation operations to LLM service', async () => {
            const input = 'Hello, how are you?';
            const imageData = { image: 'base64-image-data', mimeType: 'image/jpeg' };

            await chatSession.run(input, imageData);

            expect(mockLLMService.completeTask).toHaveBeenCalledWith(input, imageData);
        });

        test('should delegate history operations to message manager', async () => {
            await chatSession.getHistory();
            await chatSession.reset();

            expect(mockMessageManager.getHistory).toHaveBeenCalled();
            expect(mockMessageManager.resetConversation).toHaveBeenCalled();
        });
    });

    describe('Session Isolation', () => {
        test('should create session-specific services with proper isolation', async () => {
            await chatSession.init();

            // Verify session-specific message manager creation
            expect(mockMessageFactory.createMessageManager).toHaveBeenCalledWith(
                mockLLMConfig,
                mockLLMConfig.router,
                mockServices.promptManager,
                chatSession.eventBus, // Session-specific event bus
                mockHistoryProvider,
                sessionId // Session ID for isolation
            );

            // Verify session-specific LLM service creation
            expect(mockServiceFactory.createLLMService).toHaveBeenCalledWith(
                mockLLMConfig,
                mockLLMConfig.router,
                mockServices.clientManager,
                chatSession.eventBus, // Session-specific event bus
                mockMessageManager
            );
        });
    });
});
