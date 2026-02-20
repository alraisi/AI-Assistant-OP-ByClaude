import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage = {
  exists: vi.fn().mockResolvedValue(false),
  read: vi.fn().mockResolvedValue(null),
  write: vi.fn().mockResolvedValue(undefined),
  append: vi.fn().mockResolvedValue(undefined),
  getSize: vi.fn().mockResolvedValue(0),
};

vi.mock('./storage.js', () => ({
  getStorage: vi.fn(() => mockStorage),
  MemoryStorage: vi.fn(() => mockStorage),
}));

vi.mock('../utils/sanitize.js', () => ({
  sanitizeJid: vi.fn((jid: string) => {
    const parts = jid.split('@');
    return parts.map((p: string) => p.replace(/[^a-zA-Z0-9]/g, '_')).join('--');
  }),
}));

import { DailyNotes, type ConversationEntry } from './daily-notes.js';

let dailyNotes: DailyNotes;

beforeEach(() => {
  vi.clearAllMocks();
  dailyNotes = new DailyNotes(mockStorage as any);
  mockStorage.exists.mockResolvedValue(false);
  mockStorage.read.mockResolvedValue(null);
});

function makeEntry(overrides: Partial<ConversationEntry> = {}): ConversationEntry {
  return {
    timestamp: new Date('2025-06-15T14:30:00Z'),
    chatJid: '123@s.whatsapp.net',
    chatName: 'TestUser',
    senderJid: '123@s.whatsapp.net',
    senderName: 'TestUser',
    userMessage: 'Hello buddy',
    buddyResponse: 'Hi there!',
    isGroup: false,
    ...overrides,
  };
}

describe('DailyNotes', () => {
  describe('logConversation', () => {
    it('creates header for new file', async () => {
      await dailyNotes.logConversation(makeEntry());

      expect(mockStorage.write).toHaveBeenCalledWith(
        expect.stringContaining('2025-06-15'),
        expect.stringContaining('# Daily Notes'),
      );
    });

    it('appends formatted entry', async () => {
      await dailyNotes.logConversation(makeEntry());

      expect(mockStorage.append).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('TestUser'),
      );
    });

    it('includes user message and response', async () => {
      await dailyNotes.logConversation(makeEntry());

      const appendedContent = mockStorage.append.mock.calls[0][1];
      expect(appendedContent).toContain('Hello buddy');
      expect(appendedContent).toContain('Hi there!');
    });

    it('includes group context for group messages', async () => {
      await dailyNotes.logConversation(makeEntry({ isGroup: true, chatName: 'TestGroup' }));

      const appendedContent = mockStorage.append.mock.calls[0][1];
      expect(appendedContent).toContain('[Group: TestGroup]');
    });

    it('includes DM context for DM messages', async () => {
      await dailyNotes.logConversation(makeEntry({ isGroup: false }));

      const appendedContent = mockStorage.append.mock.calls[0][1];
      expect(appendedContent).toContain('[DM: TestUser]');
    });

    it('does not recreate header for existing file', async () => {
      mockStorage.exists.mockResolvedValue(true);
      await dailyNotes.logConversation(makeEntry());

      expect(mockStorage.write).not.toHaveBeenCalled();
      expect(mockStorage.append).toHaveBeenCalled();
    });

    it('stores per-chat for privacy isolation', async () => {
      await dailyNotes.logConversation(makeEntry({ chatJid: 'user1@s.whatsapp.net' }));
      await dailyNotes.logConversation(makeEntry({ chatJid: 'user2@s.whatsapp.net' }));

      const paths = mockStorage.append.mock.calls.map((c: any) => c[0]);
      expect(paths[0]).not.toBe(paths[1]);
    });
  });

  describe('getTodaysNotes', () => {
    it('reads notes for chat', async () => {
      mockStorage.read.mockResolvedValue('# Daily Notes\n## Entry');
      const result = await dailyNotes.getTodaysNotes('123@s.whatsapp.net');
      expect(result).toContain('Daily Notes');
    });

    it('returns null when no notes exist', async () => {
      const result = await dailyNotes.getTodaysNotes('123@s.whatsapp.net');
      expect(result).toBeNull();
    });
  });

  describe('getNotesForDate', () => {
    it('reads notes for specific date', async () => {
      mockStorage.read.mockResolvedValue('notes for date');
      const result = await dailyNotes.getNotesForDate('123@s.whatsapp.net', new Date('2025-06-14'));
      expect(result).toBe('notes for date');
    });
  });

  describe('searchConversations', () => {
    it('returns empty array when no notes exist', async () => {
      const result = await dailyNotes.searchConversations('123@s.whatsapp.net');
      expect(result).toEqual([]);
    });

    it('returns parsed entries from notes', async () => {
      mockStorage.read.mockResolvedValue(
        '# Daily Notes - 2025-06-15\n## 14:30:00 [DM: User]\n**User**: hello\n**Buddy**: hi',
      );
      const result = await dailyNotes.searchConversations('123@s.whatsapp.net', 1);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
