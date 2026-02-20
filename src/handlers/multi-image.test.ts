import { describe, it, expect, vi } from 'vitest';
import { isMultiImageMessage } from './multi-image.js';

// Mock dependencies to prevent side-effect imports
vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => true),
}));

vi.mock('../llm/index.js', () => ({
  getClaudeProvider: vi.fn(),
}));

vi.mock('../memory/index.js', () => ({
  getMemoryOrchestrator: vi.fn(),
}));

vi.mock('../../persona/loader.js', () => ({
  loadPersona: vi.fn(),
  buildDMSystemPrompt: vi.fn(),
  buildGroupSystemPrompt: vi.fn(),
}));

vi.mock('../setup/index.js', () => ({
  getPersonaConfig: vi.fn(),
}));

vi.mock('../safety/privacy.js', () => ({
  sanitizeForLogging: vi.fn((t: string) => t),
}));

vi.mock('@whiskeysockets/baileys', () => ({
  downloadMediaMessage: vi.fn(),
}));

describe('isMultiImageMessage', () => {
  it('should return true for message with imageMessage', () => {
    const message = {
      message: {
        imageMessage: {
          url: 'https://example.com/image.jpg',
          mimetype: 'image/jpeg',
        },
      },
    } as any;
    expect(isMultiImageMessage(message)).toBe(true);
  });

  it('should return false for text message', () => {
    const message = {
      message: {
        conversation: 'Hello',
      },
    } as any;
    expect(isMultiImageMessage(message)).toBe(false);
  });

  it('should return false for undefined message', () => {
    const message = {
      message: undefined,
    } as any;
    expect(isMultiImageMessage(message)).toBe(false);
  });

  it('should return false for message with extendedTextMessage', () => {
    const message = {
      message: {
        extendedTextMessage: { text: 'Hello' },
      },
    } as any;
    expect(isMultiImageMessage(message)).toBe(false);
  });

  it('should return false for empty message object', () => {
    const message = {
      message: {},
    } as any;
    expect(isMultiImageMessage(message)).toBe(false);
  });
});
