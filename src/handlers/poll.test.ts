import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => true),
}));

const mockMemory = {
  logConversation: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../memory/index.js', () => ({
  getMemoryOrchestrator: vi.fn(() => mockMemory),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handlePollCreation, handlePollVote, handlePollStatus, handlePollEnd } from './poll.js';
import { isEnabled } from '../config/index.js';
import { createMockSocket, createTextMessage, createContext, createGroupContext } from '../__tests__/test-helpers.js';

const mockIsEnabled = vi.mocked(isEnabled);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockReturnValue(true);
});

describe('handlePollCreation', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handlePollCreation(sock, createTextMessage('create poll: test?'), 'create poll: test?', createContext());
    expect(result).toBeNull();
  });

  it('returns null when text is not a poll request', async () => {
    const sock = createMockSocket();
    const result = await handlePollCreation(sock, createTextMessage('hello'), 'hello', createContext());
    expect(result).toBeNull();
  });

  it('returns format help when poll cannot be parsed', async () => {
    const sock = createMockSocket();
    const result = await handlePollCreation(sock, createTextMessage('create a poll'), 'create a poll', createContext());

    expect(result).not.toBeNull();
    expect(result!.response).toContain('format');
  });

  it('creates poll with valid options', async () => {
    const text = 'Create a poll: Best color? Options: Red, Blue, Green';
    const sock = createMockSocket();

    const result = await handlePollCreation(sock, createTextMessage(text), text, createContext());

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.response).toContain('Poll created');
  });

  it('includes question in response', async () => {
    const text = 'Create a poll: Favorite food? Options: Pizza, Sushi, Tacos';
    const sock = createMockSocket();

    const result = await handlePollCreation(sock, createTextMessage(text), text, createContext());

    expect(result!.response).toContain('Favorite food?');
  });

  it('logs to memory on creation', async () => {
    const text = 'Create a poll: Test? Options: A, B';
    const sock = createMockSocket();

    await handlePollCreation(sock, createTextMessage(text), text, createContext());

    expect(mockMemory.logConversation).toHaveBeenCalled();
  });
});

describe('handlePollVote', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handlePollVote(sock, createTextMessage('/1'), '/1', createContext());
    expect(result).toBeNull();
  });

  it('returns null when text is not a vote command', async () => {
    const sock = createMockSocket();
    const result = await handlePollVote(sock, createTextMessage('hello'), 'hello', createContext());
    expect(result).toBeNull();
  });

  it('returns no-poll message when no active poll', async () => {
    const sock = createMockSocket();
    const ctx = createContext({ chatJid: 'no-poll-chat@s.whatsapp.net' });
    const result = await handlePollVote(sock, createTextMessage('/1'), '/1', ctx);

    expect(result).not.toBeNull();
    expect(result!.response).toContain('no active poll');
  });

  it('records vote on active poll', async () => {
    const ctx = createContext();
    const sock = createMockSocket();

    // Create a poll first
    const text = 'Create a poll: Test? Options: A, B, C';
    await handlePollCreation(sock, createTextMessage(text), text, ctx);

    // Vote
    const result = await handlePollVote(sock, createTextMessage('/1'), '/1', ctx);

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.response).toContain('Vote recorded');
  });

  it('rejects invalid option index', async () => {
    const ctx = createContext();
    const sock = createMockSocket();

    const text = 'Create a poll: Test? Options: A, B';
    await handlePollCreation(sock, createTextMessage(text), text, ctx);

    const result = await handlePollVote(sock, createTextMessage('/99'), '/99', ctx);

    expect(result!.response).toContain('Invalid option');
  });
});

describe('handlePollStatus', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handlePollStatus(sock, createTextMessage('/poll status'), '/poll status', createContext());
    expect(result).toBeNull();
  });

  it('returns null when text is not a status command', async () => {
    const sock = createMockSocket();
    const result = await handlePollStatus(sock, createTextMessage('hello'), 'hello', createContext());
    expect(result).toBeNull();
  });

  it('returns no-poll message when no active poll', async () => {
    const sock = createMockSocket();
    const ctx = createContext({ chatJid: 'no-poll-status@s.whatsapp.net' });
    const result = await handlePollStatus(sock, createTextMessage('/poll status'), '/poll status', ctx);

    expect(result).not.toBeNull();
    expect(result!.response).toContain('no active poll');
  });

  it('returns poll results when poll exists', async () => {
    const ctx = createContext();
    const sock = createMockSocket();

    const text = 'Create a poll: Fav? Options: X, Y';
    await handlePollCreation(sock, createTextMessage(text), text, ctx);

    const result = await handlePollStatus(sock, createTextMessage('/poll status'), '/poll status', ctx);

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.response).toContain('Fav?');
  });
});

describe('handlePollEnd', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handlePollEnd(sock, createTextMessage('/end poll'), '/end poll', createContext());
    expect(result).toBeNull();
  });

  it('returns null when text is not an end command', async () => {
    const sock = createMockSocket();
    const result = await handlePollEnd(sock, createTextMessage('hello'), 'hello', createContext());
    expect(result).toBeNull();
  });

  it('returns no-poll message when no active poll', async () => {
    const sock = createMockSocket();
    const ctx = createContext({ chatJid: 'no-poll-end@s.whatsapp.net' });
    const result = await handlePollEnd(sock, createTextMessage('/end poll'), '/end poll', ctx);

    expect(result).not.toBeNull();
    expect(result!.response).toContain('no active poll');
  });

  it('ends poll when called by creator', async () => {
    const ctx = createContext();
    const sock = createMockSocket();

    const text = 'Create a poll: End me? Options: Yes, No';
    await handlePollCreation(sock, createTextMessage(text), text, ctx);

    const result = await handlePollEnd(sock, createTextMessage('/end poll'), '/end poll', ctx);

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.response).toContain('Poll Ended');
  });

  it('rejects end from non-creator', async () => {
    const creatorCtx = createContext({ senderJid: 'creator@s.whatsapp.net' });
    const otherCtx = createContext({ senderJid: 'other@s.whatsapp.net' });
    const sock = createMockSocket();

    const text = 'Create a poll: Private? Options: A, B';
    await handlePollCreation(sock, createTextMessage(text), text, creatorCtx);

    const result = await handlePollEnd(sock, createTextMessage('/end poll'), '/end poll', otherCtx);

    expect(result!.response).toContain('Only the poll creator');
  });

  it('includes winner in final results', async () => {
    const ctx = createContext();
    const sock = createMockSocket();

    const text = 'Create a poll: Winner? Options: Alpha, Beta';
    await handlePollCreation(sock, createTextMessage(text), text, ctx);

    // Vote for option 1
    await handlePollVote(sock, createTextMessage('/1'), '/1', ctx);

    const result = await handlePollEnd(sock, createTextMessage('/end poll'), '/end poll', ctx);

    expect(result!.response).toContain('Winner');
  });
});
