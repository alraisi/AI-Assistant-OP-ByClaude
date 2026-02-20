import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE the module under test is imported
// ---------------------------------------------------------------------------

vi.mock('./message-router.js', () => ({
  routeMessage: vi.fn(),
  extractMessageText: vi.fn(() => ''),
  detectContentType: vi.fn(() => 'text'),
}));

vi.mock('@whiskeysockets/baileys', () => ({
  isJidGroup: vi.fn((jid: string) => jid.endsWith('@g.us')),
  jidNormalizedUser: vi.fn((jid: string) => jid.split(':')[0]),
}));

vi.mock('../safety/whitelist.js', () => ({
  isAllowed: vi.fn(() => true),
}));

vi.mock('../safety/rate-limiter.js', () => ({
  getRateLimiter: vi.fn(() => ({
    isRateLimited: vi.fn(() => false),
    recordMessage: vi.fn(),
  })),
}));

vi.mock('../group/etiquette.js', () => ({
  evaluateGroupEtiquette: vi.fn(() => ({ shouldRespond: true, reason: 'test', priority: 'high' })),
  shouldShowTyping: vi.fn(() => false),
}));

vi.mock('../group/mention-parser.js', () => ({
  parseMentions: vi.fn(() => ({
    mentionedJids: [],
    isBotMentioned: false,
    isReplyToBot: false,
  })),
}));

vi.mock('../utils/message-chunker.js', () => ({
  sendChunkedMessage: vi.fn(async (fn: (t: string) => Promise<void>, text: string) => {
    await fn(text);
  }),
}));

vi.mock('../handlers/group-admin.js', () => ({
  handleModeration: vi.fn(() => null),
  handleNewMember: vi.fn(),
  handleAdminCommand: vi.fn(() => null),
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { EventHandler } from './event-handler.js';
import { routeMessage, extractMessageText, detectContentType } from './message-router.js';
import { isAllowed } from '../safety/whitelist.js';
import { getRateLimiter } from '../safety/rate-limiter.js';
import { evaluateGroupEtiquette, shouldShowTyping } from '../group/etiquette.js';
import { parseMentions } from '../group/mention-parser.js';
import { sendChunkedMessage } from '../utils/message-chunker.js';
import { handleModeration } from '../handlers/group-admin.js';

import {
  createTextMessage,
  createGroupTextMessage,
  createEmptyMessage,
  createImageMessage,
  createMockSocket,
} from '../__tests__/test-helpers.js';

// ---------------------------------------------------------------------------
// Typed mocks
// ---------------------------------------------------------------------------

const mockRouteMessage = vi.mocked(routeMessage);
const mockExtractMessageText = vi.mocked(extractMessageText);
const mockDetectContentType = vi.mocked(detectContentType);
const mockIsAllowed = vi.mocked(isAllowed);
const mockGetRateLimiter = vi.mocked(getRateLimiter);
const mockEvaluateGroupEtiquette = vi.mocked(evaluateGroupEtiquette);
const mockShouldShowTyping = vi.mocked(shouldShowTyping);
const mockParseMentions = vi.mocked(parseMentions);
const mockSendChunkedMessage = vi.mocked(sendChunkedMessage);
const mockHandleModeration = vi.mocked(handleModeration);

// ---------------------------------------------------------------------------
// Shared state rebuilt each test
// ---------------------------------------------------------------------------

let sock: ReturnType<typeof createMockSocket>;
let handler: EventHandler;
let mockRateLimiter: { isRateLimited: ReturnType<typeof vi.fn>; recordMessage: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();

  sock = createMockSocket();

  mockRateLimiter = {
    isRateLimited: vi.fn(() => false),
    recordMessage: vi.fn(),
  };
  mockGetRateLimiter.mockReturnValue(mockRateLimiter as any);

  handler = new EventHandler(sock, 'bot@s.whatsapp.net');

  // Defaults
  mockIsAllowed.mockReturnValue(true);
  mockRouteMessage.mockResolvedValue({
    response: 'hello',
    success: true,
    contentType: 'text',
  });
  mockExtractMessageText.mockReturnValue('');
  mockDetectContentType.mockReturnValue('text');
  mockHandleModeration.mockResolvedValue(null);
  mockEvaluateGroupEtiquette.mockResolvedValue({ shouldRespond: true, reason: 'test', priority: 'high' } as any);
  mockShouldShowTyping.mockReturnValue(false);
  mockParseMentions.mockReturnValue({
    mentionedJids: [],
    isBotMentioned: false,
    isReplyToBot: false,
  });
  mockSendChunkedMessage.mockImplementation(async (fn, text) => {
    await (fn as any)(text);
  });
});

// =========================================================================
// F. Message filtering
// =========================================================================

describe('processMessage — filtering', () => {
  it('skips messages with no content', async () => {
    await handler.handleMessagesUpsert({
      messages: [createEmptyMessage()],
      type: 'notify',
    });

    expect(mockRouteMessage).not.toHaveBeenCalled();
  });

  it('skips messages from self', async () => {
    const msg = createTextMessage('hi', {
      key: { remoteJid: '1234@s.whatsapp.net', fromMe: false, id: '1', participant: 'bot@s.whatsapp.net' },
    });

    await handler.handleMessagesUpsert({ messages: [msg], type: 'notify' });

    expect(mockRouteMessage).not.toHaveBeenCalled();
  });

  it('skips status@broadcast messages', async () => {
    const msg = createTextMessage('hi', {
      key: { remoteJid: 'status@broadcast', fromMe: false, id: '1' },
    });

    await handler.handleMessagesUpsert({ messages: [msg], type: 'notify' });

    expect(mockRouteMessage).not.toHaveBeenCalled();
  });

  it('skips messages with no remoteJid', async () => {
    const msg = createTextMessage('hi', {
      key: { remoteJid: undefined as any, fromMe: false, id: '1' },
    });

    await handler.handleMessagesUpsert({ messages: [msg], type: 'notify' });

    expect(mockRouteMessage).not.toHaveBeenCalled();
  });

  it('skips messages blocked by whitelist', async () => {
    mockIsAllowed.mockReturnValue(false);

    await handler.handleMessagesUpsert({
      messages: [createTextMessage('hi')],
      type: 'notify',
    });

    expect(mockRouteMessage).not.toHaveBeenCalled();
  });

  it('skips messages when rate limited', async () => {
    mockRateLimiter.isRateLimited.mockReturnValue(true);

    await handler.handleMessagesUpsert({
      messages: [createTextMessage('hi')],
      type: 'notify',
    });

    expect(mockRouteMessage).not.toHaveBeenCalled();
  });
});

// =========================================================================
// G. handleMessagesUpsert
// =========================================================================

describe('handleMessagesUpsert', () => {
  it('skips when type is not "notify"', async () => {
    await handler.handleMessagesUpsert({
      messages: [createTextMessage('hi')],
      type: 'append' as any,
    });

    expect(mockRouteMessage).not.toHaveBeenCalled();
  });

  it('processes all messages in a notify batch', async () => {
    const msg1 = createTextMessage('one', {
      key: { remoteJid: 'a@s.whatsapp.net', fromMe: false, id: '1' },
    });
    const msg2 = createTextMessage('two', {
      key: { remoteJid: 'b@s.whatsapp.net', fromMe: false, id: '2' },
    });

    await handler.handleMessagesUpsert({ messages: [msg1, msg2], type: 'notify' });

    expect(mockRouteMessage).toHaveBeenCalledTimes(2);
  });

  it('handles empty message array gracefully', async () => {
    await handler.handleMessagesUpsert({ messages: [], type: 'notify' });

    expect(mockRouteMessage).not.toHaveBeenCalled();
  });
});

// =========================================================================
// H. Group processing pipeline
// =========================================================================

describe('group processing pipeline', () => {
  const groupMsg = () => createGroupTextMessage('hello group', '5551234@s.whatsapp.net', '120363001@g.us');

  it('calls moderation for group messages', async () => {
    await handler.handleMessagesUpsert({ messages: [groupMsg()], type: 'notify' });

    expect(mockHandleModeration).toHaveBeenCalled();
  });

  it('blocks routing when moderation sets shouldDelete', async () => {
    mockHandleModeration.mockResolvedValue({ shouldDelete: true, warning: 'spam detected' });

    await handler.handleMessagesUpsert({ messages: [groupMsg()], type: 'notify' });

    expect(sock.sendMessage).toHaveBeenCalledWith(
      '120363001@g.us',
      { text: 'spam detected' },
    );
    expect(mockRouteMessage).not.toHaveBeenCalled();
  });

  it('continues routing when moderation is warning-only', async () => {
    mockHandleModeration.mockResolvedValue({ shouldDelete: false, warning: 'be nice' });

    await handler.handleMessagesUpsert({ messages: [groupMsg()], type: 'notify' });

    expect(sock.sendMessage).toHaveBeenCalledWith(
      '120363001@g.us',
      { text: 'be nice' },
    );
    expect(mockRouteMessage).toHaveBeenCalled();
  });

  it('evaluates etiquette for text messages', async () => {
    mockDetectContentType.mockReturnValue('text');

    await handler.handleMessagesUpsert({ messages: [groupMsg()], type: 'notify' });

    expect(mockEvaluateGroupEtiquette).toHaveBeenCalled();
  });

  it('skips routing when etiquette says shouldRespond=false', async () => {
    mockDetectContentType.mockReturnValue('text');
    mockEvaluateGroupEtiquette.mockResolvedValue({
      shouldRespond: false,
      reason: 'banter',
      priority: 'none',
    });

    await handler.handleMessagesUpsert({ messages: [groupMsg()], type: 'notify' });

    expect(mockRouteMessage).not.toHaveBeenCalled();
  });

  it('shows typing indicator when shouldShowTyping returns true', async () => {
    mockDetectContentType.mockReturnValue('text');
    mockEvaluateGroupEtiquette.mockResolvedValue({
      shouldRespond: true,
      reason: 'mentioned',
      priority: 'high',
    });
    mockShouldShowTyping.mockReturnValue(true);

    await handler.handleMessagesUpsert({ messages: [groupMsg()], type: 'notify' });

    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('composing', '120363001@g.us');
  });
});

// =========================================================================
// I. Context building
// =========================================================================

describe('context building', () => {
  it('builds DM context with isGroup=false', async () => {
    await handler.handleMessagesUpsert({
      messages: [createTextMessage('hi')],
      type: 'notify',
    });

    const ctx = mockRouteMessage.mock.calls[0][2];
    expect(ctx.isGroup).toBe(false);
    expect(ctx.groupName).toBeUndefined();
  });

  it('builds group context with groupName from metadata', async () => {
    (sock.groupMetadata as any).mockResolvedValue({
      id: '120363001@g.us',
      subject: 'My Group',
      participants: [],
    });

    await handler.handleMessagesUpsert({
      messages: [createGroupTextMessage('hi')],
      type: 'notify',
    });

    const ctx = mockRouteMessage.mock.calls[0][2];
    expect(ctx.isGroup).toBe(true);
    expect(ctx.groupName).toBe('My Group');
  });

  it('uses pushName for senderName', async () => {
    const msg = createTextMessage('hi');
    (msg as any).pushName = 'Alice';

    await handler.handleMessagesUpsert({ messages: [msg], type: 'notify' });

    const ctx = mockRouteMessage.mock.calls[0][2];
    expect(ctx.senderName).toBe('Alice');
  });

  it('falls back to JID prefix when pushName is absent', async () => {
    const msg = createTextMessage('hi', {
      key: { remoteJid: '9876543@s.whatsapp.net', fromMe: false, id: '1' },
    });
    (msg as any).pushName = undefined;

    await handler.handleMessagesUpsert({ messages: [msg], type: 'notify' });

    const ctx = mockRouteMessage.mock.calls[0][2];
    expect(ctx.senderName).toBe('9876543');
  });
});

// =========================================================================
// J. Response sending
// =========================================================================

describe('response sending', () => {
  it('sends text via sendChunkedMessage', async () => {
    mockRouteMessage.mockResolvedValue({
      response: 'hey there',
      success: true,
      contentType: 'text',
    });

    await handler.handleMessagesUpsert({
      messages: [createTextMessage('hi')],
      type: 'notify',
    });

    expect(mockSendChunkedMessage).toHaveBeenCalled();
    // The inner send function was called via the mock implementation
    expect(sock.sendMessage).toHaveBeenCalled();
  });

  it('does not send when success is false', async () => {
    mockRouteMessage.mockResolvedValue({
      response: 'error',
      success: false,
      contentType: 'text',
      error: 'something broke',
    });

    await handler.handleMessagesUpsert({
      messages: [createTextMessage('hi')],
      type: 'notify',
    });

    expect(mockSendChunkedMessage).not.toHaveBeenCalled();
  });

  it('does not send when response is empty', async () => {
    mockRouteMessage.mockResolvedValue({
      response: '',
      success: true,
      contentType: 'text',
    });

    await handler.handleMessagesUpsert({
      messages: [createTextMessage('hi')],
      type: 'notify',
    });

    expect(mockSendChunkedMessage).not.toHaveBeenCalled();
  });

  it('sends voice note when audioBuffer is present', async () => {
    const audioBuf = Buffer.from('fake-audio');
    mockRouteMessage.mockResolvedValue({
      response: 'voice response',
      success: true,
      contentType: 'audio',
      audioBuffer: audioBuf,
    });

    await handler.handleMessagesUpsert({
      messages: [createTextMessage('hi')],
      type: 'notify',
    });

    expect(sock.sendMessage).toHaveBeenCalledWith(
      '1234567890@s.whatsapp.net',
      expect.objectContaining({
        audio: audioBuf,
        ptt: true,
      }),
      expect.objectContaining({ quoted: undefined }),
    );
  });

  it('quotes original message in group responses', async () => {
    mockRouteMessage.mockResolvedValue({
      response: 'group reply',
      success: true,
      contentType: 'text',
    });

    const msg = createGroupTextMessage('hello');

    // Override sendChunkedMessage to inspect the inner fn
    mockSendChunkedMessage.mockImplementation(async (fn) => {
      await (fn as any)('group reply');
    });

    await handler.handleMessagesUpsert({ messages: [msg], type: 'notify' });

    // The sock.sendMessage call should include quoted
    const sendCall = (sock.sendMessage as any).mock.calls[0];
    expect(sendCall[2]).toEqual(expect.objectContaining({ quoted: msg }));
  });
});

// =========================================================================
// K. Rate limiter interaction
// =========================================================================

describe('rate limiter interaction', () => {
  it('calls recordMessage after whitelist passes', async () => {
    mockIsAllowed.mockReturnValue(true);

    await handler.handleMessagesUpsert({
      messages: [createTextMessage('hi')],
      type: 'notify',
    });

    expect(mockRateLimiter.recordMessage).toHaveBeenCalled();
  });

  it('does not call recordMessage when whitelist rejects', async () => {
    mockIsAllowed.mockReturnValue(false);

    await handler.handleMessagesUpsert({
      messages: [createTextMessage('hi')],
      type: 'notify',
    });

    expect(mockRateLimiter.recordMessage).not.toHaveBeenCalled();
  });
});

// =========================================================================
// L. Error handling
// =========================================================================

describe('error handling', () => {
  it('catches routeMessage exceptions without crashing', async () => {
    mockRouteMessage.mockRejectedValue(new Error('routing explosion'));

    // Should not throw
    await expect(
      handler.handleMessagesUpsert({
        messages: [createTextMessage('hi')],
        type: 'notify',
      }),
    ).resolves.toBeUndefined();
  });

  it('catches sendResponse exceptions without crashing', async () => {
    mockRouteMessage.mockResolvedValue({
      response: 'hello',
      success: true,
      contentType: 'text',
    });
    mockSendChunkedMessage.mockRejectedValue(new Error('send failure'));

    // Should not throw
    await expect(
      handler.handleMessagesUpsert({
        messages: [createTextMessage('hi')],
        type: 'notify',
      }),
    ).resolves.toBeUndefined();
  });
});
