import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => true),
}));

const mockSummarizer = {
  getLatestSummary: vi.fn().mockResolvedValue(null),
  getAllSummaries: vi.fn().mockResolvedValue([]),
};

vi.mock('../memory/conversation-summarizer.js', () => ({
  getConversationSummarizer: vi.fn(() => mockSummarizer),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleSummaryCommand } from './summary.js';
import { isEnabled } from '../config/index.js';
import { createMockSocket, createTextMessage, createContext } from '../__tests__/test-helpers.js';

const mockIsEnabled = vi.mocked(isEnabled);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockReturnValue(true);
  mockSummarizer.getLatestSummary.mockResolvedValue(null);
  mockSummarizer.getAllSummaries.mockResolvedValue([]);
});

describe('handleSummaryCommand', () => {
  it('returns null when text is not a summary command', async () => {
    const sock = createMockSocket();
    const result = await handleSummaryCommand(sock, createTextMessage('hello'), 'hello', createContext());
    expect(result).toBeNull();
  });

  it('returns disabled message when feature is off', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleSummaryCommand(sock, createTextMessage('/summary'), '/summary', createContext());

    expect(result).not.toBeNull();
    expect(result!.success).toBe(false);
    expect(result!.response).toContain('disabled');
  });

  it('returns no-summary message when no summaries exist', async () => {
    const sock = createMockSocket();
    const result = await handleSummaryCommand(sock, createTextMessage('/summary'), '/summary', createContext());

    expect(result).not.toBeNull();
    expect(result!.response).toContain('No conversation summary');
  });

  it('returns latest summary', async () => {
    mockSummarizer.getLatestSummary.mockResolvedValue({
      date: '2025-06-15',
      summary: 'We discussed project planning and deadlines.',
      keyTopics: ['planning', 'deadlines'],
      importantDecisions: ['Launch on Monday'],
      messageCount: 50,
    });
    const sock = createMockSocket();
    const ctx = createContext();

    const result = await handleSummaryCommand(sock, createTextMessage('/summary'), '/summary', ctx);

    expect(result!.success).toBe(true);
    expect(sock.sendMessage).toHaveBeenCalledWith(
      ctx.chatJid,
      expect.objectContaining({ text: expect.stringContaining('planning') }),
      expect.any(Object),
    );
  });

  it('handles /summary all with no summaries', async () => {
    const sock = createMockSocket();
    const result = await handleSummaryCommand(sock, createTextMessage('/summary all'), '/summary all', createContext());

    expect(result!.response).toContain('No conversation summaries');
  });

  it('lists all summaries', async () => {
    mockSummarizer.getAllSummaries.mockResolvedValue([
      { date: '2025-06-15', summary: 'First summary', messageCount: 50 },
      { date: '2025-06-14', summary: 'Second summary', messageCount: 30 },
    ]);
    const sock = createMockSocket();
    const ctx = createContext();

    const result = await handleSummaryCommand(sock, createTextMessage('/summary all'), '/summary all', ctx);

    expect(result!.success).toBe(true);
    expect(sock.sendMessage).toHaveBeenCalled();
  });

  it('returns error on failure', async () => {
    mockSummarizer.getLatestSummary.mockRejectedValue(new Error('db error'));
    const sock = createMockSocket();

    const result = await handleSummaryCommand(sock, createTextMessage('/summary'), '/summary', createContext());

    expect(result!.success).toBe(false);
    expect(result!.response).toContain('trouble');
  });
});
