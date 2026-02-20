import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@whiskeysockets/baileys', () => ({
  downloadMediaMessage: vi.fn().mockResolvedValue(Buffer.from('image-data')),
}));

vi.mock('../llm/index.js', () => ({
  getVisionProvider: vi.fn(() => ({
    analyzeImage: vi.fn().mockResolvedValue({ content: 'I see a cat', usage: { inputTokens: 5, outputTokens: 10 } }),
  })),
}));

vi.mock('../../persona/loader.js', () => ({
  loadPersona: vi.fn().mockResolvedValue({ name: 'Buddy' }),
  buildDMSystemPrompt: vi.fn(() => 'dm prompt'),
  buildGroupSystemPrompt: vi.fn(() => 'group prompt'),
}));

const mockMemory = {
  getContext: vi.fn().mockResolvedValue({ systemContext: '', recentMessages: [] }),
  logConversation: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../memory/index.js', () => ({
  getMemoryOrchestrator: vi.fn(() => mockMemory),
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

import { handleImageMessage } from './image.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getVisionProvider } from '../llm/index.js';
import { createMockSocket, createImageMessage, createContext, createGroupContext } from '../__tests__/test-helpers.js';

const mockDownload = vi.mocked(downloadMediaMessage);
const mockVisionProvider = vi.mocked(getVisionProvider);

beforeEach(() => {
  vi.clearAllMocks();
  mockDownload.mockResolvedValue(Buffer.from('image-data') as any);
  mockVisionProvider.mockReturnValue({
    analyzeImage: vi.fn().mockResolvedValue({ content: 'I see a cat', usage: { inputTokens: 5, outputTokens: 10 } }),
  } as any);
});

describe('handleImageMessage', () => {
  it('analyzes image and returns response', async () => {
    const sock = createMockSocket();
    const result = await handleImageMessage(sock, createImageMessage(), createContext());

    expect(result.success).toBe(true);
    expect(result.response).toBe('I see a cat');
  });

  it('shows typing indicator', async () => {
    const sock = createMockSocket();
    await handleImageMessage(sock, createImageMessage(), createContext());

    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('composing', expect.any(String));
  });

  it('includes caption in the prompt when present', async () => {
    const sock = createMockSocket();
    const analyzeImage = vi.fn().mockResolvedValue({ content: 'response' });
    mockVisionProvider.mockReturnValue({ analyzeImage } as any);

    await handleImageMessage(sock, createImageMessage('what is this?'), createContext());

    const prompt = analyzeImage.mock.calls[0][0].prompt;
    expect(prompt).toContain('what is this?');
  });

  it('returns error when download fails', async () => {
    mockDownload.mockResolvedValue(Buffer.alloc(0) as any);
    const sock = createMockSocket();

    const result = await handleImageMessage(sock, createImageMessage(), createContext());

    expect(result.success).toBe(false);
  });

  it('returns error when vision provider throws', async () => {
    mockVisionProvider.mockReturnValue({
      analyzeImage: vi.fn().mockRejectedValue(new Error('vision fail')),
    } as any);
    const sock = createMockSocket();

    const result = await handleImageMessage(sock, createImageMessage(), createContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain('vision fail');
  });

  it('logs to memory after analysis', async () => {
    const sock = createMockSocket();

    await handleImageMessage(sock, createImageMessage(), createContext());

    expect(mockMemory.logConversation).toHaveBeenCalled();
  });
});
