import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@whiskeysockets/baileys', () => ({
  downloadMediaMessage: vi.fn().mockResolvedValue(Buffer.from('audio-data')),
}));

vi.mock('../llm/index.js', () => ({
  getTranscriptionProvider: vi.fn(() => ({
    transcribe: vi.fn().mockResolvedValue({ text: 'hello world', duration: 3.5 }),
  })),
  getChatProvider: vi.fn(() => ({
    chat: vi.fn().mockResolvedValue({ content: 'text response' }),
  })),
  getTTSProvider: vi.fn(() => ({
    synthesize: vi.fn().mockResolvedValue({ audioBuffer: Buffer.from('audio'), mimeType: 'audio/ogg' }),
  })),
}));

vi.mock('./text.js', () => ({
  handleTextMessage: vi.fn().mockResolvedValue({
    response: 'text reply',
    success: true,
  }),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleVoiceMessage } from './voice.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { handleTextMessage } from './text.js';
import { createMockSocket, createAudioMessage, createContext } from '../__tests__/test-helpers.js';

const mockDownload = vi.mocked(downloadMediaMessage);
const mockHandleText = vi.mocked(handleTextMessage);

beforeEach(() => {
  vi.clearAllMocks();
  mockDownload.mockResolvedValue(Buffer.from('audio-data') as any);
  mockHandleText.mockResolvedValue({ response: 'text reply', success: true } as any);
});

describe('handleVoiceMessage', () => {
  it('transcribes and delegates to text handler', async () => {
    const sock = createMockSocket();
    const result = await handleVoiceMessage(sock, createAudioMessage(), createContext());

    expect(mockHandleText).toHaveBeenCalled();
    expect(result.transcription).toBe('hello world');
    expect(result.success).toBe(true);
  });

  it('sets respondWithVoice in context passed to text handler', async () => {
    const sock = createMockSocket();
    await handleVoiceMessage(sock, createAudioMessage(), createContext());

    const passedContext = mockHandleText.mock.calls[0][3];
    expect(passedContext.respondWithVoice).toBe(true);
  });

  it('shows recording indicator', async () => {
    const sock = createMockSocket();
    await handleVoiceMessage(sock, createAudioMessage(), createContext());

    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('recording', expect.any(String));
  });

  it('includes duration in result', async () => {
    const sock = createMockSocket();
    const result = await handleVoiceMessage(sock, createAudioMessage(), createContext());

    expect(result.duration).toBe(3.5);
  });

  it('returns error when download fails', async () => {
    mockDownload.mockResolvedValue(Buffer.alloc(0) as any);
    const sock = createMockSocket();

    const result = await handleVoiceMessage(sock, createAudioMessage(), createContext());

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error when download throws', async () => {
    mockDownload.mockRejectedValue(new Error('network error'));
    const sock = createMockSocket();

    const result = await handleVoiceMessage(sock, createAudioMessage(), createContext());

    expect(result.success).toBe(false);
  });

  it('stops presence on error', async () => {
    mockDownload.mockRejectedValue(new Error('fail'));
    const sock = createMockSocket();

    await handleVoiceMessage(sock, createAudioMessage(), createContext());

    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('paused', expect.any(String));
  });
});
