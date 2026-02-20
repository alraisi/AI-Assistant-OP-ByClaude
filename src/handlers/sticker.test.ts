import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@whiskeysockets/baileys', () => ({
  downloadMediaMessage: vi.fn().mockResolvedValue(Buffer.from('image-data')),
}));

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => true),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('webp-sticker')),
  })),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleStickerMessage, handleStickerCommand } from './sticker.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { isEnabled } from '../config/index.js';
import { createMockSocket, createImageMessage, createContext, createGroupContext } from '../__tests__/test-helpers.js';
import type { WAMessage } from '@whiskeysockets/baileys';

const mockIsEnabled = vi.mocked(isEnabled);
const mockDownload = vi.mocked(downloadMediaMessage);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockReturnValue(true);
  mockDownload.mockResolvedValue(Buffer.from('image-data') as any);
});

describe('handleStickerMessage', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleStickerMessage(sock, createImageMessage('sticker'), createContext());
    expect(result).toBeNull();
  });

  it('returns null when message has no image', async () => {
    const sock = createMockSocket();
    const msg = {
      key: { remoteJid: '123@s.whatsapp.net', fromMe: false, id: '1' },
      message: { conversation: 'sticker' },
      messageTimestamp: 1000,
    } as unknown as WAMessage;

    const result = await handleStickerMessage(sock, msg, createContext());
    expect(result).toBeNull();
  });

  it('returns null when caption has no sticker intent', async () => {
    const sock = createMockSocket();
    const result = await handleStickerMessage(sock, createImageMessage('look at this'), createContext());
    expect(result).toBeNull();
  });

  it('creates sticker when caption says sticker', async () => {
    const sock = createMockSocket();
    const result = await handleStickerMessage(sock, createImageMessage('sticker'), createContext());

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(sock.sendMessage).toHaveBeenCalled();
  });

  it('sends sticker buffer to chat', async () => {
    const sock = createMockSocket();
    const ctx = createContext();
    await handleStickerMessage(sock, createImageMessage('make this a sticker'), ctx);

    expect(sock.sendMessage).toHaveBeenCalledWith(
      ctx.chatJid,
      expect.objectContaining({ sticker: expect.any(Buffer) }),
      expect.any(Object),
    );
  });

  it('quotes original message in groups', async () => {
    const sock = createMockSocket();
    const msg = createImageMessage('sticker');
    const ctx = createGroupContext();

    await handleStickerMessage(sock, msg, ctx);

    expect(sock.sendMessage).toHaveBeenCalledWith(
      ctx.chatJid,
      expect.any(Object),
      expect.objectContaining({ quoted: msg }),
    );
  });

  it('returns error when download fails', async () => {
    mockDownload.mockResolvedValue(Buffer.alloc(0) as any);
    const sock = createMockSocket();

    const result = await handleStickerMessage(sock, createImageMessage('sticker'), createContext());

    expect(result!.success).toBe(false);
  });

  it('shows typing indicator', async () => {
    const sock = createMockSocket();
    const ctx = createContext();
    await handleStickerMessage(sock, createImageMessage('sticker'), ctx);

    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('composing', ctx.chatJid);
  });
});

describe('handleStickerCommand', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const msg = createImageMessage();
    const result = await handleStickerCommand(sock, msg, 'sticker', createContext());
    expect(result).toBeNull();
  });

  it('returns null when text has no sticker intent', async () => {
    const sock = createMockSocket();
    const result = await handleStickerCommand(sock, createImageMessage(), 'hello', createContext());
    expect(result).toBeNull();
  });

  it('asks user to reply to image when no quoted image', async () => {
    const sock = createMockSocket();
    const msg = {
      key: { remoteJid: '123@s.whatsapp.net', fromMe: false, id: '1' },
      message: { extendedTextMessage: { text: 'sticker' } },
      messageTimestamp: 1000,
    } as unknown as WAMessage;

    const result = await handleStickerCommand(sock, msg, 'sticker', createContext());

    expect(result).not.toBeNull();
    expect(result!.response).toContain('reply to an image');
  });

  it('creates sticker from quoted image', async () => {
    const sock = createMockSocket();
    const msg = {
      key: { remoteJid: '123@s.whatsapp.net', fromMe: false, id: '1' },
      message: {
        extendedTextMessage: {
          text: 'sticker',
          contextInfo: {
            stanzaId: 'quoted-id',
            participant: 'sender@s.whatsapp.net',
            quotedMessage: {
              imageMessage: {
                url: 'https://example.com/image.jpg',
                mimetype: 'image/jpeg',
              },
            },
          },
        },
      },
      messageTimestamp: 1000,
    } as unknown as WAMessage;

    const result = await handleStickerCommand(sock, msg, 'sticker', createContext());

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(sock.sendMessage).toHaveBeenCalled();
  });

  it('returns error when download throws', async () => {
    mockDownload.mockRejectedValue(new Error('download fail'));
    const sock = createMockSocket();
    const msg = {
      key: { remoteJid: '123@s.whatsapp.net', fromMe: false, id: '1' },
      message: {
        extendedTextMessage: {
          text: 'sticker',
          contextInfo: {
            stanzaId: 'quoted-id',
            participant: 'sender@s.whatsapp.net',
            quotedMessage: { imageMessage: { url: 'https://example.com/img.jpg' } },
          },
        },
      },
      messageTimestamp: 1000,
    } as unknown as WAMessage;

    const result = await handleStickerCommand(sock, msg, 'sticker', createContext());

    expect(result!.success).toBe(false);
  });
});
