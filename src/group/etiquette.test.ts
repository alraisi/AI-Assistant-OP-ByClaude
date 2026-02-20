import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./mention-parser.js', () => ({
  parseMentions: vi.fn(() => ({
    mentionedJids: [],
    isBotMentioned: false,
    isReplyToBot: false,
  })),
}));

vi.mock('../config/index.js', () => ({
  getConfig: vi.fn(() => ({
    groupResponseThreshold: 0.6,
    groupMinMessageLength: 10,
  })),
}));

vi.mock('../handlers/group-admin.js', () => ({
  getGroupResponseRate: vi.fn(() => 30),
}));

import { evaluateGroupEtiquette, shouldShowTyping, type EtiquetteDecision } from './etiquette.js';
import { parseMentions } from './mention-parser.js';
import { getGroupResponseRate } from '../handlers/group-admin.js';

const mockParseMentions = vi.mocked(parseMentions);
const mockGetGroupResponseRate = vi.mocked(getGroupResponseRate);

const BOT_JID = 'bot@s.whatsapp.net';
const CHAT_JID = 'group@g.us';

function makeMsg(text?: string) {
  return {
    key: { remoteJid: CHAT_JID, fromMe: false, id: '1' },
    message: text ? { conversation: text } : undefined,
    messageTimestamp: 1000,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockParseMentions.mockReturnValue({
    mentionedJids: [],
    isBotMentioned: false,
    isReplyToBot: false,
  });
  mockGetGroupResponseRate.mockResolvedValue(30);
});

// =========================================================================
// evaluateGroupEtiquette
// =========================================================================

describe('evaluateGroupEtiquette', () => {
  it('responds with high priority when bot is @mentioned', async () => {
    mockParseMentions.mockReturnValue({
      mentionedJids: [BOT_JID],
      isBotMentioned: true,
      isReplyToBot: false,
    });

    const decision = await evaluateGroupEtiquette(makeMsg('hey @bot'), 'hey @bot', BOT_JID, CHAT_JID);

    expect(decision.shouldRespond).toBe(true);
    expect(decision.priority).toBe('high');
  });

  it('responds with high priority when replying to bot', async () => {
    mockParseMentions.mockReturnValue({
      mentionedJids: [],
      isBotMentioned: false,
      isReplyToBot: true,
    });

    const decision = await evaluateGroupEtiquette(makeMsg('thanks'), 'thanks', BOT_JID, CHAT_JID);

    expect(decision.shouldRespond).toBe(true);
    expect(decision.priority).toBe('high');
  });

  it('skips very short messages', async () => {
    const decision = await evaluateGroupEtiquette(makeMsg('hi'), 'hi', BOT_JID, CHAT_JID);

    expect(decision.shouldRespond).toBe(false);
    expect(decision.reason).toContain('short');
  });

  it('skips banter messages', async () => {
    const decision = await evaluateGroupEtiquette(makeMsg('lol'), 'lol', BOT_JID, CHAT_JID);

    expect(decision.shouldRespond).toBe(false);
  });

  it('skips emoji-only messages', async () => {
    const decision = await evaluateGroupEtiquette(makeMsg('😂😂😂😂😂'), '😂😂😂😂😂', BOT_JID, CHAT_JID);

    expect(decision.shouldRespond).toBe(false);
    expect(decision.reason).toContain('Emoji');
  });

  it('responds to questions with medium priority', async () => {
    const decision = await evaluateGroupEtiquette(
      makeMsg('What time is the meeting tomorrow?'),
      'What time is the meeting tomorrow?',
      BOT_JID,
      CHAT_JID,
    );

    expect(decision.shouldRespond).toBe(true);
    expect(decision.priority).toBe('medium');
  });

  it('responds to questions ending with ?', async () => {
    const decision = await evaluateGroupEtiquette(
      makeMsg('anyone going to the party tonight?'),
      'anyone going to the party tonight?',
      BOT_JID,
      CHAT_JID,
    );

    expect(decision.shouldRespond).toBe(true);
  });

  it('skips general group chat', async () => {
    // Long enough message but not a question, and Math.random will be above threshold
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const decision = await evaluateGroupEtiquette(
      makeMsg('I just had lunch at the new restaurant downtown'),
      'I just had lunch at the new restaurant downtown',
      BOT_JID,
      CHAT_JID,
    );

    expect(decision.shouldRespond).toBe(false);
    vi.restoreAllMocks();
  });

  it('may respond to substantive messages based on response rate', async () => {
    mockGetGroupResponseRate.mockResolvedValue(100); // 100% response rate
    vi.spyOn(Math, 'random').mockReturnValue(0.01);

    const decision = await evaluateGroupEtiquette(
      makeMsg('I just had lunch at the new restaurant downtown'),
      'I just had lunch at the new restaurant downtown',
      BOT_JID,
      CHAT_JID,
    );

    expect(decision.shouldRespond).toBe(true);
    expect(decision.priority).toBe('low');
    vi.restoreAllMocks();
  });

  it('skips substantive messages when response rate is 0', async () => {
    mockGetGroupResponseRate.mockResolvedValue(0);

    const decision = await evaluateGroupEtiquette(
      makeMsg('I just had lunch at the new restaurant downtown'),
      'I just had lunch at the new restaurant downtown',
      BOT_JID,
      CHAT_JID,
    );

    expect(decision.shouldRespond).toBe(false);
  });

  it('recognises repeated-character banter', async () => {
    const decision = await evaluateGroupEtiquette(makeMsg('aaaaaaa'), 'aaaaaaa', BOT_JID, CHAT_JID);

    expect(decision.shouldRespond).toBe(false);
  });
});

// =========================================================================
// shouldShowTyping
// =========================================================================

describe('shouldShowTyping', () => {
  it('returns true when shouldRespond is true and priority is not none', () => {
    expect(shouldShowTyping({ shouldRespond: true, reason: '', priority: 'high' })).toBe(true);
    expect(shouldShowTyping({ shouldRespond: true, reason: '', priority: 'medium' })).toBe(true);
    expect(shouldShowTyping({ shouldRespond: true, reason: '', priority: 'low' })).toBe(true);
  });

  it('returns false when priority is none', () => {
    expect(shouldShowTyping({ shouldRespond: true, reason: '', priority: 'none' })).toBe(false);
  });

  it('returns false when shouldRespond is false', () => {
    expect(shouldShowTyping({ shouldRespond: false, reason: '', priority: 'high' })).toBe(false);
  });
});
