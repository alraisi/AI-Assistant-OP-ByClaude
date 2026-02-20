import type { Config } from '../config/schema.js';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import type { MessageContext } from '../llm/types.js';
import { vi } from 'vitest';

/**
 * Create a mock config object with sensible defaults for testing
 */
export function createMockConfig(overrides: Partial<Config> = {}): Config {
  return {
    anthropicApiKey: 'test-anthropic-key',
    openaiApiKey: 'test-openai-key',
    serperApiKey: undefined,
    geminiApiKey: undefined,
    anthropicModel: 'claude-sonnet-4-20250514',
    geminiModel: 'gemini-2.0-flash',
    whisperModel: 'whisper-1',
    buddyName: 'Buddy',
    buddyEmoji: '\u{1F916}',
    memoryStoragePath: './buddy-memory',
    whatsappAuthPath: './auth/baileys_auth_info',
    groupResponseThreshold: 0.6,
    groupMinMessageLength: 10,
    rateLimitWindowMs: 60000,
    rateLimitMaxMessages: 20,
    enablePrivacyFilter: true,
    logLevel: 'info',
    memoryRetentionDays: 30,
    allowedNumbers: 'all',
    ...overrides,
  };
}

/**
 * Create a stable reference date for time-based tests
 * Returns 2025-06-15 at 12:00:00 UTC
 */
export function createReferenceDate(): Date {
  return new Date('2025-06-15T12:00:00.000Z');
}

// ---------------------------------------------------------------------------
// WAMessage Factories
// ---------------------------------------------------------------------------

const DEFAULT_KEY = {
  remoteJid: '1234567890@s.whatsapp.net',
  fromMe: false,
  id: 'test-msg-id',
};

export function createTextMessage(
  text: string,
  overrides: Partial<WAMessage> = {},
): WAMessage {
  return {
    key: { ...DEFAULT_KEY },
    message: { conversation: text },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: 'TestUser',
    ...overrides,
  } as WAMessage;
}

export function createExtendedTextMessage(
  text: string,
  contextInfo?: Record<string, unknown>,
  overrides: Partial<WAMessage> = {},
): WAMessage {
  return {
    key: { ...DEFAULT_KEY },
    message: {
      extendedTextMessage: {
        text,
        ...(contextInfo ? { contextInfo } : {}),
      },
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: 'TestUser',
    ...overrides,
  } as WAMessage;
}

export function createImageMessage(
  caption?: string,
  overrides: Partial<WAMessage> = {},
): WAMessage {
  return {
    key: { ...DEFAULT_KEY },
    message: {
      imageMessage: {
        url: 'https://example.com/image.jpg',
        mimetype: 'image/jpeg',
        ...(caption ? { caption } : {}),
      },
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: 'TestUser',
    ...overrides,
  } as WAMessage;
}

export function createAudioMessage(
  overrides: Partial<WAMessage> = {},
): WAMessage {
  return {
    key: { ...DEFAULT_KEY },
    message: {
      audioMessage: {
        url: 'https://example.com/audio.ogg',
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
      },
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: 'TestUser',
    ...overrides,
  } as WAMessage;
}

export function createVideoMessage(
  caption?: string,
  overrides: Partial<WAMessage> = {},
): WAMessage {
  return {
    key: { ...DEFAULT_KEY },
    message: {
      videoMessage: {
        url: 'https://example.com/video.mp4',
        mimetype: 'video/mp4',
        ...(caption ? { caption } : {}),
      },
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: 'TestUser',
    ...overrides,
  } as WAMessage;
}

export function createStickerMessage(
  overrides: Partial<WAMessage> = {},
): WAMessage {
  return {
    key: { ...DEFAULT_KEY },
    message: {
      stickerMessage: {
        url: 'https://example.com/sticker.webp',
        mimetype: 'image/webp',
      },
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: 'TestUser',
    ...overrides,
  } as WAMessage;
}

export function createDocumentMessage(
  fileName?: string,
  overrides: Partial<WAMessage> = {},
): WAMessage {
  return {
    key: { ...DEFAULT_KEY },
    message: {
      documentMessage: {
        url: 'https://example.com/doc.pdf',
        mimetype: 'application/pdf',
        fileName: fileName ?? 'document.pdf',
      },
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: 'TestUser',
    ...overrides,
  } as WAMessage;
}

export function createGroupTextMessage(
  text: string,
  senderJid = '5551234@s.whatsapp.net',
  groupJid = '120363001@g.us',
): WAMessage {
  return createTextMessage(text, {
    key: {
      remoteJid: groupJid,
      fromMe: false,
      id: 'test-group-msg-id',
      participant: senderJid,
    },
  });
}

export function createEmptyMessage(): WAMessage {
  return {
    key: { ...DEFAULT_KEY },
    message: undefined,
    messageTimestamp: Math.floor(Date.now() / 1000),
  } as unknown as WAMessage;
}

// ---------------------------------------------------------------------------
// Context Factories
// ---------------------------------------------------------------------------

export function createContext(
  overrides: Partial<MessageContext> = {},
): MessageContext {
  return {
    isGroup: false,
    senderName: 'TestUser',
    senderJid: '1234567890@s.whatsapp.net',
    chatJid: '1234567890@s.whatsapp.net',
    timestamp: Date.now(),
    ...overrides,
  };
}

export function createGroupContext(
  overrides: Partial<MessageContext> = {},
): MessageContext {
  return {
    isGroup: true,
    groupName: 'Test Group',
    senderName: 'TestUser',
    senderJid: '5551234@s.whatsapp.net',
    chatJid: '120363001@g.us',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Socket
// ---------------------------------------------------------------------------

export function createMockSocket(): WASocket {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
    groupMetadata: vi.fn().mockResolvedValue({
      id: '120363001@g.us',
      subject: 'Test Group',
      participants: [],
    }),
  } as unknown as WASocket;
}
