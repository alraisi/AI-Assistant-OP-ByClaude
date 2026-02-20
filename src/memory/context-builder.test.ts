import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDailyNotes = {
  searchConversations: vi.fn().mockResolvedValue([]),
};

const mockLongTermMemory = {
  getUserMemories: vi.fn().mockResolvedValue(null),
  getUserHighImportanceMemories: vi.fn().mockResolvedValue([]),
  getAllMemories: vi.fn().mockResolvedValue(null),
};

vi.mock('./daily-notes.js', () => ({
  getDailyNotes: vi.fn(() => mockDailyNotes),
  DailyNotes: vi.fn(() => mockDailyNotes),
}));

vi.mock('./long-term.js', () => ({
  getLongTermMemory: vi.fn(() => mockLongTermMemory),
  LongTermMemory: vi.fn(() => mockLongTermMemory),
}));

vi.mock('./semantic.js', () => ({
  getSemanticMemory: vi.fn(() => ({
    search: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => false),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { ContextBuilder } from './context-builder.js';

let builder: ContextBuilder;

beforeEach(() => {
  vi.clearAllMocks();
  builder = new ContextBuilder(mockDailyNotes as any, mockLongTermMemory as any);
  mockDailyNotes.searchConversations.mockResolvedValue([]);
  mockLongTermMemory.getUserMemories.mockResolvedValue(null);
  mockLongTermMemory.getUserHighImportanceMemories.mockResolvedValue([]);
});

describe('ContextBuilder', () => {
  describe('buildContext', () => {
    it('returns empty context when no memories exist', async () => {
      const result = await builder.buildContext({
        chatJid: '123@s.whatsapp.net',
        senderJid: '123@s.whatsapp.net',
        senderName: 'TestUser',
        isGroup: false,
      });

      expect(result.systemContext).toBe('');
      expect(result.recentMessages).toEqual([]);
    });

    it('includes long-term context when available', async () => {
      mockLongTermMemory.getUserMemories.mockResolvedValue('User likes coffee');

      const result = await builder.buildContext({
        chatJid: '123@s.whatsapp.net',
        senderJid: '123@s.whatsapp.net',
        senderName: 'TestUser',
        isGroup: false,
      });

      expect(result.systemContext).toContain('coffee');
    });

    it('includes daily context when conversations exist', async () => {
      mockDailyNotes.searchConversations.mockResolvedValue([
        '## 14:30:00 [DM: User]\n**User**: hello\n**Buddy**: hi there',
      ]);

      const result = await builder.buildContext({
        chatJid: '123@s.whatsapp.net',
        senderJid: '123@s.whatsapp.net',
        senderName: 'TestUser',
        isGroup: false,
      });

      expect(result.systemContext).toContain('Recent Conversations');
    });

    it('extracts recent messages as conversation history', async () => {
      mockDailyNotes.searchConversations.mockResolvedValue([
        '## 14:30:00\n**User**: how are you\n**Buddy**: I am doing great',
      ]);

      const result = await builder.buildContext({
        chatJid: '123@s.whatsapp.net',
        senderJid: '123@s.whatsapp.net',
        senderName: 'TestUser',
        isGroup: false,
        maxMessages: 10,
      });

      expect(result.recentMessages.length).toBeGreaterThan(0);
    });

    it('skips long-term context when disabled', async () => {
      mockLongTermMemory.getUserMemories.mockResolvedValue('Should not appear');

      const result = await builder.buildContext({
        chatJid: '123@s.whatsapp.net',
        senderJid: '123@s.whatsapp.net',
        senderName: 'TestUser',
        isGroup: false,
        includeLongTerm: false,
      });

      expect(result.systemContext).not.toContain('Should not appear');
    });

    it('skips daily context when disabled', async () => {
      mockDailyNotes.searchConversations.mockResolvedValue(['## 14:30:00\n**User**: hi\n**Buddy**: hey']);

      const result = await builder.buildContext({
        chatJid: '123@s.whatsapp.net',
        senderJid: '123@s.whatsapp.net',
        senderName: 'TestUser',
        isGroup: false,
        includeDaily: false,
      });

      expect(result.systemContext).not.toContain('Recent Conversations');
    });

    it('includes high importance memories', async () => {
      mockLongTermMemory.getUserHighImportanceMemories.mockResolvedValue([
        '### Important: User birthday is June 15',
      ]);

      const result = await builder.buildContext({
        chatJid: '123@s.whatsapp.net',
        senderJid: '123@s.whatsapp.net',
        senderName: 'TestUser',
        isGroup: false,
      });

      expect(result.systemContext).toContain('Important Memories');
    });
  });

  describe('getSummaryForChat', () => {
    it('returns chat summary', async () => {
      mockDailyNotes.searchConversations.mockResolvedValue(['entry1', 'entry2']);
      mockLongTermMemory.getAllMemories.mockResolvedValue('some memories here');

      const result = await builder.getSummaryForChat('123@s.whatsapp.net');

      expect(result).toContain('123@s.whatsapp.net');
      expect(result).toContain('2'); // conversation count
    });

    it('indicates when no memories stored', async () => {
      const result = await builder.getSummaryForChat('empty@s.whatsapp.net');

      expect(result).toContain('No');
    });
  });
});
