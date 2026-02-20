import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@whiskeysockets/baileys', () => ({
  downloadMediaMessage: vi.fn().mockResolvedValue(Buffer.from('pdf-data')),
}));

vi.mock('../llm/index.js', () => ({
  getDocumentAnalysisProvider: vi.fn(() => ({
    analyzeDocument: vi.fn().mockResolvedValue({ content: 'Document summary' }),
  })),
}));

vi.mock('../../persona/loader.js', () => ({
  loadPersona: vi.fn().mockResolvedValue({ name: 'Buddy' }),
  buildDMSystemPrompt: vi.fn(() => 'dm prompt'),
  buildGroupSystemPrompt: vi.fn(() => 'group prompt'),
}));

vi.mock('../memory/index.js', () => ({
  getMemoryOrchestrator: vi.fn(() => ({
    getContext: vi.fn().mockResolvedValue({ systemContext: '', recentMessages: [] }),
    logConversation: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../safety/privacy.js', () => ({
  sanitizeForLogging: vi.fn((t: string) => t),
}));

vi.mock('../setup/index.js', () => ({
  getPersonaConfig: vi.fn(() => ({})),
}));

vi.mock('../utils/document-extract.js', () => ({
  extractDocumentText: vi.fn().mockResolvedValue({ text: 'extracted text', format: 'pdf' }),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleDocumentMessage } from './document.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { createMockSocket, createDocumentMessage, createContext } from '../__tests__/test-helpers.js';
import type { WAMessage } from '@whiskeysockets/baileys';

const mockDownload = vi.mocked(downloadMediaMessage);

beforeEach(() => {
  vi.clearAllMocks();
  mockDownload.mockResolvedValue(Buffer.from('pdf-data') as any);
});

function makeDocMsg(overrides: Record<string, unknown> = {}): WAMessage {
  return {
    key: { remoteJid: '123@s.whatsapp.net', fromMe: false, id: '1' },
    message: {
      documentMessage: {
        url: 'https://example.com/doc.pdf',
        mimetype: 'application/pdf',
        fileName: 'report.pdf',
        fileLength: 1000,
        ...overrides,
      },
    },
    messageTimestamp: 1000,
    pushName: 'User',
  } as unknown as WAMessage;
}

describe('handleDocumentMessage', () => {
  it('analyzes document and returns response', async () => {
    const sock = createMockSocket();
    const result = await handleDocumentMessage(sock, makeDocMsg(), createContext());

    expect(result.success).toBe(true);
    expect(result.response).toBe('Document summary');
  });

  it('rejects files larger than 15MB', async () => {
    const sock = createMockSocket();
    const result = await handleDocumentMessage(
      sock,
      makeDocMsg({ fileLength: 20 * 1024 * 1024 }),
      createContext(),
    );

    expect(result.response).toContain('too large');
  });

  it('rejects unsupported mime types', async () => {
    const sock = createMockSocket();
    const result = await handleDocumentMessage(
      sock,
      makeDocMsg({ mimetype: 'application/zip' }),
      createContext(),
    );

    expect(result.response).toContain("can't read");
  });

  it('returns error when no document message found', async () => {
    const sock = createMockSocket();
    const msg = {
      key: { remoteJid: '123@s.whatsapp.net', fromMe: false, id: '1' },
      message: {},
      messageTimestamp: 1000,
    } as unknown as WAMessage;

    const result = await handleDocumentMessage(sock, msg, createContext());

    expect(result.success).toBe(false);
  });

  it('handles documentWithCaptionMessage nesting', async () => {
    const sock = createMockSocket();
    const msg = {
      key: { remoteJid: '123@s.whatsapp.net', fromMe: false, id: '1' },
      message: {
        documentWithCaptionMessage: {
          message: {
            documentMessage: {
              url: 'https://example.com/doc.pdf',
              mimetype: 'application/pdf',
              fileName: 'nested.pdf',
              fileLength: 500,
            },
          },
        },
      },
      messageTimestamp: 1000,
    } as unknown as WAMessage;

    const result = await handleDocumentMessage(sock, msg, createContext());
    expect(result.success).toBe(true);
  });

  it('returns user-friendly message for missing Gemini key', async () => {
    const sock = createMockSocket();
    const { getDocumentAnalysisProvider } = await import('../llm/index.js');
    vi.mocked(getDocumentAnalysisProvider).mockReturnValue({
      analyzeDocument: vi.fn().mockRejectedValue(new Error('GEMINI_API_KEY not set')),
    } as any);

    const result = await handleDocumentMessage(sock, makeDocMsg(), createContext());

    expect(result.response).toContain('Gemini');
  });

  it('returns generic error for other failures', async () => {
    const sock = createMockSocket();
    mockDownload.mockRejectedValue(new Error('network'));

    const result = await handleDocumentMessage(sock, makeDocMsg(), createContext());

    expect(result.success).toBe(false);
    expect(result.response).toContain("couldn't process");
  });
});
