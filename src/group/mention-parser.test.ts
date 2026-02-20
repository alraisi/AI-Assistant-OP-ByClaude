import { describe, it, expect } from 'vitest';
import { parseMentions, normalizeJid, extractTextMentions } from './mention-parser.js';
import type { WAMessage } from '@whiskeysockets/baileys';

const BOT_JID = '1111111@s.whatsapp.net';

function makeMessage(overrides: Partial<WAMessage> = {}): WAMessage {
  return {
    key: { remoteJid: 'chat@s.whatsapp.net', fromMe: false, id: '1' },
    message: { conversation: 'hi' },
    messageTimestamp: 1000,
    ...overrides,
  } as WAMessage;
}

// =========================================================================
// normalizeJid
// =========================================================================

describe('normalizeJid', () => {
  it('strips @s.whatsapp.net part', () => {
    expect(normalizeJid('12345@s.whatsapp.net')).toBe('12345');
  });

  it('strips device suffix before @', () => {
    expect(normalizeJid('12345:3@s.whatsapp.net')).toBe('12345');
  });

  it('handles bare numbers', () => {
    expect(normalizeJid('12345')).toBe('12345');
  });
});

// =========================================================================
// extractTextMentions
// =========================================================================

describe('extractTextMentions', () => {
  it('extracts @mentions from text', () => {
    expect(extractTextMentions('hello @12345 and @67890')).toEqual(['12345', '67890']);
  });

  it('returns empty array when no mentions', () => {
    expect(extractTextMentions('no mentions here')).toEqual([]);
  });

  it('ignores non-numeric @mentions', () => {
    expect(extractTextMentions('@alice hello')).toEqual([]);
  });
});

// =========================================================================
// parseMentions
// =========================================================================

describe('parseMentions', () => {
  it('returns defaults when message has no content', () => {
    const msg = makeMessage({ message: undefined } as any);
    const result = parseMentions(msg, BOT_JID);

    expect(result.mentionedJids).toEqual([]);
    expect(result.isBotMentioned).toBe(false);
    expect(result.isReplyToBot).toBe(false);
  });

  it('detects bot mention in extendedTextMessage', () => {
    const msg = makeMessage({
      message: {
        extendedTextMessage: {
          text: 'hey @bot',
          contextInfo: {
            mentionedJid: [BOT_JID],
          },
        },
      },
    } as any);

    const result = parseMentions(msg, BOT_JID);
    expect(result.isBotMentioned).toBe(true);
    expect(result.mentionedJids).toContain(BOT_JID);
  });

  it('detects reply to bot', () => {
    const msg = makeMessage({
      message: {
        extendedTextMessage: {
          text: 'thanks',
          contextInfo: {
            participant: BOT_JID,
            quotedMessage: { conversation: 'you are welcome' },
          },
        },
      },
    } as any);

    const result = parseMentions(msg, BOT_JID);
    expect(result.isReplyToBot).toBe(true);
    expect(result.quotedMessage).toBe('you are welcome');
    expect(result.quotedParticipant).toBe(BOT_JID);
  });

  it('does not flag reply when participant differs from bot', () => {
    const msg = makeMessage({
      message: {
        extendedTextMessage: {
          text: 'ok',
          contextInfo: {
            participant: '9999@s.whatsapp.net',
          },
        },
      },
    } as any);

    const result = parseMentions(msg, BOT_JID);
    expect(result.isReplyToBot).toBe(false);
  });

  it('extracts contextInfo from imageMessage', () => {
    const msg = makeMessage({
      message: {
        imageMessage: {
          url: 'https://example.com/img.jpg',
          contextInfo: { mentionedJid: [BOT_JID] },
        },
      },
    } as any);

    const result = parseMentions(msg, BOT_JID);
    expect(result.isBotMentioned).toBe(true);
  });

  it('extracts quoted message from extendedTextMessage in quotedMessage', () => {
    const msg = makeMessage({
      message: {
        extendedTextMessage: {
          text: 'reply',
          contextInfo: {
            participant: '5555@s.whatsapp.net',
            quotedMessage: {
              extendedTextMessage: { text: 'original extended' },
            },
          },
        },
      },
    } as any);

    const result = parseMentions(msg, BOT_JID);
    expect(result.quotedMessage).toBe('original extended');
  });

  it('handles bot JID with device suffix', () => {
    const botWithDevice = '1111111:5@s.whatsapp.net';
    const msg = makeMessage({
      message: {
        extendedTextMessage: {
          text: 'yo',
          contextInfo: {
            mentionedJid: [botWithDevice],
          },
        },
      },
    } as any);

    // normalizeJid strips device suffix, so '1111111:5' → '1111111' matches '1111111'
    const result = parseMentions(msg, BOT_JID);
    expect(result.isBotMentioned).toBe(true);
  });
});
