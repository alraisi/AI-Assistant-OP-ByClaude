import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContentBlock } from '../llm/types.js';

// Mock config first (before imports)
const mockIsEnabled = vi.fn((flag: string) => false);
vi.mock('../config/index.js', () => ({
  getConfig: vi.fn(() => ({ buddyName: 'Buddy' })),
  isEnabled: (...args: unknown[]) => mockIsEnabled(...args),
}));

const mockChatWithTools = vi.fn();
vi.mock('../llm/index.js', () => ({
  getChatProvider: vi.fn(() => ({
    chat: vi.fn().mockResolvedValue({ content: 'bot reply', usage: { inputTokens: 10, outputTokens: 20 } }),
  })),
  getClaudeProvider: vi.fn(() => ({
    chatWithTools: mockChatWithTools,
  })),
  getTTSProvider: vi.fn(() => ({
    synthesize: vi.fn().mockResolvedValue({ audioBuffer: Buffer.from('audio'), mimeType: 'audio/ogg' }),
  })),
}));

const mockMemory = {
  getContext: vi.fn().mockResolvedValue({
    systemContext: 'memory context',
    recentMessages: [],
  }),
  logConversation: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../memory/index.js', () => ({
  getMemoryOrchestrator: vi.fn(() => mockMemory),
}));

vi.mock('../memory/auto-extract.js', () => ({
  getAutoMemoryExtractor: vi.fn(() => ({
    processConversation: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../persona/loader.js', () => ({
  loadPersona: vi.fn().mockResolvedValue({ name: 'Buddy', personality: 'friendly' }),
  buildDMSystemPrompt: vi.fn(() => 'DM system prompt'),
  buildGroupSystemPrompt: vi.fn(() => 'Group system prompt'),
}));

vi.mock('../safety/privacy.js', () => ({
  sanitizeForLogging: vi.fn((t: string) => t),
}));

vi.mock('../setup/index.js', () => ({
  getPersonaConfig: vi.fn(() => ({})),
}));

vi.mock('../core/tool-definitions.js', () => ({
  getAvailableTools: vi.fn(() => [
    {
      name: 'generate_image',
      description: 'Generate an image',
      input_schema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
    },
  ]),
}));

const mockExecuteTool = vi.fn();
vi.mock('../core/tool-executor.js', () => ({
  executeTool: (...args: unknown[]) => mockExecuteTool(...args),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleTextMessage } from './text.js';
import { createMockSocket, createTextMessage, createContext } from '../__tests__/test-helpers.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockReturnValue(false);
});

describe('handleTextMessage with tool_use', () => {
  describe('when toolUse flag is disabled', () => {
    it('uses the legacy chat path', async () => {
      const sock = createMockSocket();
      const ctx = createContext();

      const result = await handleTextMessage(sock, createTextMessage('hello'), 'hello', ctx);

      expect(result.success).toBe(true);
      expect(result.response).toBe('bot reply');
      expect(mockChatWithTools).not.toHaveBeenCalled();
    });
  });

  describe('when toolUse flag is enabled', () => {
    beforeEach(() => {
      mockIsEnabled.mockImplementation((flag: string) => flag === 'toolUse');
    });

    it('calls chatWithTools instead of chat', async () => {
      mockChatWithTools.mockResolvedValue({
        content: [{ type: 'text', text: 'tool response' }] as ContentBlock[],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 20 },
      });

      const sock = createMockSocket();
      const ctx = createContext();

      const result = await handleTextMessage(sock, createTextMessage('hello'), 'hello', ctx);

      expect(result.success).toBe(true);
      expect(result.response).toBe('tool response');
      expect(mockChatWithTools).toHaveBeenCalledTimes(1);
    });

    it('end_turn response exits after single iteration', async () => {
      mockChatWithTools.mockResolvedValue({
        content: [{ type: 'text', text: 'direct answer' }] as ContentBlock[],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 20 },
      });

      const sock = createMockSocket();
      const result = await handleTextMessage(sock, createTextMessage('hi'), 'hi', createContext());

      expect(result.response).toBe('direct answer');
      expect(mockChatWithTools).toHaveBeenCalledTimes(1);
      expect(mockExecuteTool).not.toHaveBeenCalled();
    });

    it('tool_use triggers tool execution then second call', async () => {
      // First call: Claude decides to use a tool
      mockChatWithTools
        .mockResolvedValueOnce({
          content: [
            { type: 'text', text: '' },
            { type: 'tool_use', id: 'tool-1', name: 'generate_image', input: { prompt: 'sunset' } },
          ] as ContentBlock[],
          stopReason: 'tool_use',
          usage: { inputTokens: 10, outputTokens: 20 },
        })
        // Second call: Claude responds with final text
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Here is your sunset image!' }] as ContentBlock[],
          stopReason: 'end_turn',
          usage: { inputTokens: 30, outputTokens: 10 },
        });

      mockExecuteTool.mockResolvedValue({
        content: 'Image generated and sent.',
        isError: false,
      });

      const sock = createMockSocket();
      const result = await handleTextMessage(
        sock,
        createTextMessage('draw a sunset'),
        'draw a sunset',
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.response).toBe('Here is your sunset image!');
      expect(mockChatWithTools).toHaveBeenCalledTimes(2);
      expect(mockExecuteTool).toHaveBeenCalledWith(
        'generate_image',
        { prompt: 'sunset' },
        expect.objectContaining({ originalText: 'draw a sunset' })
      );
    });

    it('caps at MAX_TOOL_ITERATIONS (5)', async () => {
      // Always return tool_use to trigger max iterations
      mockChatWithTools.mockResolvedValue({
        content: [
          { type: 'tool_use', id: 'tool-x', name: 'generate_image', input: { prompt: 'test' } },
        ] as ContentBlock[],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 20 },
      });

      mockExecuteTool.mockResolvedValue({
        content: 'done',
        isError: false,
      });

      const sock = createMockSocket();
      const result = await handleTextMessage(
        sock,
        createTextMessage('loop'),
        'loop',
        createContext()
      );

      expect(mockChatWithTools).toHaveBeenCalledTimes(5);
      expect(result.success).toBe(true);
      expect(result.response).toBe(''); // No end_turn text was produced
    });

    it('handles multiple tool_use blocks in single response', async () => {
      mockChatWithTools
        .mockResolvedValueOnce({
          content: [
            { type: 'tool_use', id: 'tool-1', name: 'generate_image', input: { prompt: 'cat' } },
            { type: 'tool_use', id: 'tool-2', name: 'generate_image', input: { prompt: 'dog' } },
          ] as ContentBlock[],
          stopReason: 'tool_use',
          usage: { inputTokens: 10, outputTokens: 20 },
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Both images created!' }] as ContentBlock[],
          stopReason: 'end_turn',
          usage: { inputTokens: 30, outputTokens: 10 },
        });

      mockExecuteTool.mockResolvedValue({ content: 'Image generated.', isError: false });

      const sock = createMockSocket();
      const result = await handleTextMessage(
        sock,
        createTextMessage('draw a cat and a dog'),
        'draw a cat and a dog',
        createContext()
      );

      expect(mockExecuteTool).toHaveBeenCalledTimes(2);
      expect(result.response).toBe('Both images created!');
    });

    it('shows and stops typing indicators', async () => {
      mockChatWithTools.mockResolvedValue({
        content: [{ type: 'text', text: 'reply' }] as ContentBlock[],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 20 },
      });

      const sock = createMockSocket();
      const ctx = createContext();
      await handleTextMessage(sock, createTextMessage('hi'), 'hi', ctx);

      expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('composing', ctx.chatJid);
      expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('paused', ctx.chatJid);
    });

    it('logs conversation to memory', async () => {
      mockChatWithTools.mockResolvedValue({
        content: [{ type: 'text', text: 'hi there' }] as ContentBlock[],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 20 },
      });

      const sock = createMockSocket();
      await handleTextMessage(sock, createTextMessage('hello'), 'hello', createContext());

      expect(mockMemory.logConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: 'hello',
          buddyResponse: 'hi there',
        })
      );
    });

    it('returns error on exception', async () => {
      mockChatWithTools.mockRejectedValue(new Error('API failure'));

      const sock = createMockSocket();
      const result = await handleTextMessage(
        sock,
        createTextMessage('hi'),
        'hi',
        createContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('API failure');
    });

    it('handles max_tokens stop reason like end_turn', async () => {
      mockChatWithTools.mockResolvedValue({
        content: [{ type: 'text', text: 'truncated response' }] as ContentBlock[],
        stopReason: 'max_tokens',
        usage: { inputTokens: 10, outputTokens: 2048 },
      });

      const sock = createMockSocket();
      const result = await handleTextMessage(
        sock,
        createTextMessage('hi'),
        'hi',
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.response).toBe('truncated response');
      expect(mockChatWithTools).toHaveBeenCalledTimes(1);
    });
  });
});
