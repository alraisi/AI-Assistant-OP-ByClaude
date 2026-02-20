import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../llm/index.js', () => ({
  getChatProvider: vi.fn(() => ({
    chat: vi.fn().mockResolvedValue({ content: 'bot reply', usage: { inputTokens: 10, outputTokens: 20 } }),
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

vi.mock('../config/index.js', () => ({
  getConfig: vi.fn(() => ({ buddyName: 'Buddy' })),
}));

vi.mock('../safety/privacy.js', () => ({
  sanitizeForLogging: vi.fn((t: string) => t),
}));

vi.mock('../setup/index.js', () => ({
  getPersonaConfig: vi.fn(() => ({})),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleTextMessage } from './text.js';
import { getChatProvider, getTTSProvider } from '../llm/index.js';
import { buildDMSystemPrompt, buildGroupSystemPrompt } from '../../persona/loader.js';
import { createMockSocket, createTextMessage, createContext, createGroupContext } from '../__tests__/test-helpers.js';

const mockChatProvider = vi.mocked(getChatProvider);

beforeEach(() => {
  vi.clearAllMocks();
  mockChatProvider.mockReturnValue({
    chat: vi.fn().mockResolvedValue({ content: 'bot reply', usage: { inputTokens: 10, outputTokens: 20 } }),
  } as any);
});

describe('handleTextMessage', () => {
  it('returns successful response from LLM', async () => {
    const sock = createMockSocket();
    const msg = createTextMessage('hello');
    const ctx = createContext();

    const result = await handleTextMessage(sock, msg, 'hello', ctx);

    expect(result.success).toBe(true);
    expect(result.response).toBe('bot reply');
  });

  it('shows typing indicator before calling LLM', async () => {
    const sock = createMockSocket();
    const ctx = createContext();

    await handleTextMessage(sock, createTextMessage('hi'), 'hi', ctx);

    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('composing', ctx.chatJid);
  });

  it('stops typing after LLM responds', async () => {
    const sock = createMockSocket();
    const ctx = createContext();

    await handleTextMessage(sock, createTextMessage('hi'), 'hi', ctx);

    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('paused', ctx.chatJid);
  });

  it('logs conversation to memory', async () => {
    const sock = createMockSocket();
    const ctx = createContext();

    await handleTextMessage(sock, createTextMessage('hi'), 'hi', ctx);

    expect(mockMemory.logConversation).toHaveBeenCalled();
  });

  it('uses DM system prompt for non-group context', async () => {
    const sock = createMockSocket();
    const ctx = createContext({ isGroup: false });

    await handleTextMessage(sock, createTextMessage('hi'), 'hi', ctx);

    expect(buildDMSystemPrompt).toHaveBeenCalled();
    expect(buildGroupSystemPrompt).not.toHaveBeenCalled();
  });

  it('uses group system prompt for group context', async () => {
    const sock = createMockSocket();
    const ctx = createGroupContext();

    await handleTextMessage(sock, createTextMessage('hi'), 'hi', ctx);

    expect(buildGroupSystemPrompt).toHaveBeenCalled();
  });

  it('includes quoted message in conversation history', async () => {
    const sock = createMockSocket();
    const ctx = createContext({ quotedMessage: 'previous message' });
    const chatFn = vi.fn().mockResolvedValue({ content: 'reply' });
    mockChatProvider.mockReturnValue({ chat: chatFn } as any);

    await handleTextMessage(sock, createTextMessage('hi'), 'hi', ctx);

    const messages = chatFn.mock.calls[0][0].messages;
    expect(messages.some((m: any) => m.content === 'previous message')).toBe(true);
  });

  it('generates voice response when respondWithVoice is true', async () => {
    const sock = createMockSocket();
    const ctx = createContext({ respondWithVoice: true });

    const result = await handleTextMessage(sock, createTextMessage('hi'), 'hi', ctx);

    expect(result.audioBuffer).toBeDefined();
    expect(result.respondWithVoice).toBe(true);
  });

  it('returns error result when LLM throws', async () => {
    const sock = createMockSocket();
    const ctx = createContext();
    mockChatProvider.mockReturnValue({
      chat: vi.fn().mockRejectedValue(new Error('LLM down')),
    } as any);

    const result = await handleTextMessage(sock, createTextMessage('hi'), 'hi', ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM down');
  });

  it('stops typing on error', async () => {
    const sock = createMockSocket();
    const ctx = createContext();
    mockChatProvider.mockReturnValue({
      chat: vi.fn().mockRejectedValue(new Error('fail')),
    } as any);

    await handleTextMessage(sock, createTextMessage('hi'), 'hi', ctx);

    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('paused', ctx.chatJid);
  });
});
