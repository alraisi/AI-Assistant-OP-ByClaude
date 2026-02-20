import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => true),
}));

const mockStorage = {
  ensureDir: vi.fn().mockResolvedValue(undefined),
  readJson: vi.fn().mockResolvedValue(null),
  writeJson: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../memory/storage.js', () => ({
  getStorage: vi.fn(() => mockStorage),
  MemoryStorage: vi.fn(),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleModeration, handleNewMember, handleAdminCommand, getGroupResponseRate } from './group-admin.js';
import { isEnabled } from '../config/index.js';
import { createMockSocket, createTextMessage, createGroupContext, createContext } from '../__tests__/test-helpers.js';
import type { WAMessage } from '@whiskeysockets/baileys';

const mockIsEnabled = vi.mocked(isEnabled);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockReturnValue(true);
  mockStorage.readJson.mockResolvedValue(null);
});

function makeGroupMsg(text: string): WAMessage {
  return {
    key: { remoteJid: '120363001@g.us', fromMe: false, id: '1', participant: '5551234@s.whatsapp.net' },
    message: { conversation: text },
    messageTimestamp: 1000,
    pushName: 'TestUser',
  } as unknown as WAMessage;
}

describe('handleModeration', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleModeration(sock, makeGroupMsg('spam'), 'spam', createGroupContext());
    expect(result).toBeNull();
  });

  it('returns null for DM context', async () => {
    const sock = createMockSocket();
    const result = await handleModeration(sock, makeGroupMsg('spam'), 'spam', createContext({ isGroup: false }));
    expect(result).toBeNull();
  });

  it('returns null when all moderation features are disabled', async () => {
    mockStorage.readJson.mockResolvedValue({
      moderation: { spamDetection: false, linkBlocking: false, forwardBlocking: false },
      welcomeMessages: true,
      autoDeleteSpam: true,
      botResponseRate: 30,
    });
    const sock = createMockSocket();
    const result = await handleModeration(sock, makeGroupMsg('test'), 'test', createGroupContext());
    expect(result).toBeNull();
  });

  it('skips moderation for group admins', async () => {
    mockStorage.readJson.mockResolvedValue({
      moderation: { spamDetection: true, linkBlocking: true, forwardBlocking: false },
      welcomeMessages: true,
      autoDeleteSpam: true,
      botResponseRate: 30,
    });
    const sock = createMockSocket();
    (sock.groupMetadata as any).mockResolvedValue({
      id: '120363001@g.us',
      subject: 'Test Group',
      participants: [{ id: '5551234@s.whatsapp.net', admin: 'admin' }],
    });

    const result = await handleModeration(sock, makeGroupMsg('https://spam.com'), 'https://spam.com', createGroupContext());
    expect(result).toBeNull();
  });

  it('detects links when link blocking is enabled', async () => {
    mockStorage.readJson.mockResolvedValue({
      moderation: { spamDetection: false, linkBlocking: true, forwardBlocking: false },
      welcomeMessages: true,
      autoDeleteSpam: true,
      botResponseRate: 30,
    });
    const sock = createMockSocket();

    const result = await handleModeration(
      sock,
      makeGroupMsg('check https://example.com'),
      'check https://example.com',
      createGroupContext(),
    );

    expect(result).not.toBeNull();
    expect(result!.shouldDelete).toBe(true);
    expect(result!.warning).toContain('links are not allowed');
  });

  it('detects forwarded messages when forward blocking is enabled', async () => {
    mockStorage.readJson.mockResolvedValue({
      moderation: { spamDetection: false, linkBlocking: false, forwardBlocking: true },
      welcomeMessages: true,
      autoDeleteSpam: true,
      botResponseRate: 30,
    });
    const sock = createMockSocket();
    const msg = {
      key: { remoteJid: '120363001@g.us', fromMe: false, id: '1', participant: '5551234@s.whatsapp.net' },
      message: {
        extendedTextMessage: {
          text: 'forwarded content',
          contextInfo: { isForwarded: true },
        },
      },
      messageTimestamp: 1000,
    } as unknown as WAMessage;

    const result = await handleModeration(sock, msg, 'forwarded content', createGroupContext());

    expect(result).not.toBeNull();
    expect(result!.shouldDelete).toBe(true);
    expect(result!.warning).toContain('forwarded messages');
  });
});

describe('handleNewMember', () => {
  it('returns early when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    await handleNewMember(sock, '120363001@g.us', ['new@s.whatsapp.net']);
    expect(sock.sendMessage).not.toHaveBeenCalled();
  });

  it('sends welcome message when configured', async () => {
    mockStorage.readJson.mockImplementation(async (fileName: string) => {
      if (fileName.includes('welcome')) {
        return {
          '120363001@g.us': {
            chatJid: '120363001@g.us',
            message: 'Welcome @user to the group!',
            setBy: 'admin@s.whatsapp.net',
            setAt: '2025-06-15',
          },
        };
      }
      return {
        moderation: { spamDetection: true, linkBlocking: false, forwardBlocking: false },
        welcomeMessages: true,
        autoDeleteSpam: true,
        botResponseRate: 30,
      };
    });
    const sock = createMockSocket();

    await handleNewMember(sock, '120363001@g.us', ['newuser@s.whatsapp.net']);

    expect(sock.sendMessage).toHaveBeenCalledWith(
      '120363001@g.us',
      expect.objectContaining({
        text: expect.stringContaining('Welcome'),
        mentions: ['newuser@s.whatsapp.net'],
      }),
    );
  });

  it('does not send when welcome messages disabled', async () => {
    mockStorage.readJson.mockResolvedValue({
      moderation: { spamDetection: true, linkBlocking: false, forwardBlocking: false },
      welcomeMessages: false,
      autoDeleteSpam: true,
      botResponseRate: 30,
    });
    const sock = createMockSocket();

    await handleNewMember(sock, '120363001@g.us', ['new@s.whatsapp.net']);

    expect(sock.sendMessage).not.toHaveBeenCalled();
  });

  it('does not send when no welcome message is set', async () => {
    mockStorage.readJson.mockImplementation(async (fileName: string) => {
      if (fileName.includes('welcome')) return {};
      return {
        moderation: { spamDetection: true, linkBlocking: false, forwardBlocking: false },
        welcomeMessages: true,
        autoDeleteSpam: true,
        botResponseRate: 30,
      };
    });
    const sock = createMockSocket();

    await handleNewMember(sock, '120363001@g.us', ['new@s.whatsapp.net']);

    expect(sock.sendMessage).not.toHaveBeenCalled();
  });
});

describe('handleAdminCommand', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleAdminCommand(sock, makeGroupMsg('/admin help'), '/admin help', createGroupContext());
    expect(result).toBeNull();
  });

  it('returns null for DM context', async () => {
    const sock = createMockSocket();
    const result = await handleAdminCommand(sock, makeGroupMsg('/admin help'), '/admin help', createContext({ isGroup: false }));
    expect(result).toBeNull();
  });

  it('shows help even for non-admins', async () => {
    const sock = createMockSocket();
    (sock.groupMetadata as any).mockResolvedValue({
      id: '120363001@g.us',
      subject: 'Test Group',
      participants: [{ id: '5551234@s.whatsapp.net', admin: null }],
    });

    const result = await handleAdminCommand(sock, makeGroupMsg('/admin help'), '/admin help', createGroupContext());

    expect(result).not.toBeNull();
    expect(result!.response).toContain('Admin Commands');
    expect(result!.response).toContain('need admin rights');
  });

  it('shows help for admins without warning', async () => {
    const sock = createMockSocket();
    (sock.groupMetadata as any).mockResolvedValue({
      id: '120363001@g.us',
      subject: 'Test Group',
      participants: [{ id: '5551234@s.whatsapp.net', admin: 'admin' }],
    });

    const result = await handleAdminCommand(sock, makeGroupMsg('/admin help'), '/admin help', createGroupContext());

    expect(result).not.toBeNull();
    expect(result!.response).not.toContain('need admin rights');
  });

  it('sets welcome message', async () => {
    const sock = createMockSocket();
    (sock.groupMetadata as any).mockResolvedValue({
      id: '120363001@g.us',
      subject: 'Test Group',
      participants: [{ id: '5551234@s.whatsapp.net', admin: 'admin' }],
    });

    const result = await handleAdminCommand(
      sock,
      makeGroupMsg('/set welcome Hello @user!'),
      '/set welcome Hello @user!',
      createGroupContext(),
    );

    expect(result!.success).toBe(true);
    expect(result!.response).toContain('Welcome message set');
    expect(mockStorage.writeJson).toHaveBeenCalled();
  });

  it('sets response rate', async () => {
    const sock = createMockSocket();
    (sock.groupMetadata as any).mockResolvedValue({
      id: '120363001@g.us',
      subject: 'Test Group',
      participants: [{ id: '5551234@s.whatsapp.net', admin: 'admin' }],
    });

    const result = await handleAdminCommand(
      sock,
      makeGroupMsg('/response rate 50'),
      '/response rate 50',
      createGroupContext(),
    );

    expect(result!.success).toBe(true);
    expect(result!.response).toContain('50%');
  });

  it('rejects invalid response rate', async () => {
    const sock = createMockSocket();
    (sock.groupMetadata as any).mockResolvedValue({
      id: '120363001@g.us',
      subject: 'Test Group',
      participants: [{ id: '5551234@s.whatsapp.net', admin: 'admin' }],
    });

    const result = await handleAdminCommand(
      sock,
      makeGroupMsg('/response rate 200'),
      '/response rate 200',
      createGroupContext(),
    );

    expect(result!.success).toBe(false);
    expect(result!.response).toContain('Invalid rate');
  });

  it('toggles moderation features', async () => {
    const sock = createMockSocket();
    (sock.groupMetadata as any).mockResolvedValue({
      id: '120363001@g.us',
      subject: 'Test Group',
      participants: [{ id: '5551234@s.whatsapp.net', admin: 'admin' }],
    });

    const result = await handleAdminCommand(
      sock,
      makeGroupMsg('/enable links'),
      '/enable links',
      createGroupContext(),
    );

    expect(result!.success).toBe(true);
    expect(result!.response).toContain('links');
    expect(result!.response).toContain('enabled');
  });
});

describe('getGroupResponseRate', () => {
  it('returns default rate of 30 when no config', async () => {
    mockStorage.readJson.mockResolvedValue(null);
    const rate = await getGroupResponseRate('120363001@g.us');
    expect(rate).toBe(30);
  });

  it('returns configured rate', async () => {
    mockStorage.readJson.mockResolvedValue({
      moderation: { spamDetection: true, linkBlocking: false, forwardBlocking: false },
      welcomeMessages: true,
      autoDeleteSpam: true,
      botResponseRate: 75,
    });
    const rate = await getGroupResponseRate('120363001@g.us');
    expect(rate).toBe(75);
  });
});
