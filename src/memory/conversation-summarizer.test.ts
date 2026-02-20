import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => true),
}));

vi.mock('../llm/index.js', () => ({
  getChatProvider: vi.fn(() => ({
    chat: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        summary: 'We discussed project planning.',
        keyTopics: ['planning', 'deadlines'],
        importantDecisions: ['Launch on Monday'],
      }),
    }),
  })),
}));

const mockStorage = {
  ensureDir: vi.fn().mockResolvedValue(undefined),
  readJson: vi.fn().mockResolvedValue(null),
  writeJson: vi.fn().mockResolvedValue(undefined),
  listFiles: vi.fn().mockResolvedValue([]),
  getStats: vi.fn().mockResolvedValue({ mtime: new Date(), size: 100 }),
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

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { ConversationSummarizer } from './conversation-summarizer.js';
import { isEnabled } from '../config/index.js';

const mockIsEnabled = vi.mocked(isEnabled);

let summarizer: ConversationSummarizer;

beforeEach(() => {
  vi.clearAllMocks();
  summarizer = new ConversationSummarizer(mockStorage as any);
  mockIsEnabled.mockReturnValue(true);
  mockStorage.readJson.mockResolvedValue(null);
  mockStorage.listFiles.mockResolvedValue([]);
});

describe('ConversationSummarizer', () => {
  describe('analyzeAndSummarize', () => {
    it('returns null when feature is disabled', async () => {
      mockIsEnabled.mockReturnValue(false);
      const result = await summarizer.analyzeAndSummarize('chat@s.whatsapp.net', '**User**: hi\n**Buddy**: hello');
      expect(result).toBeNull();
    });

    it('returns null when too few messages', async () => {
      const content = '**User**: hi\n**Buddy**: hello';
      const result = await summarizer.analyzeAndSummarize('chat@s.whatsapp.net', content);
      expect(result).toBeNull();
    });

    it('generates summary when enough messages', async () => {
      // Build content with 15+ messages in the format daily-notes produces: **Name**: message
      const lines: string[] = [];
      for (let i = 0; i < 15; i++) {
        lines.push(`**User**: Message ${i}`);
        lines.push(`**Buddy**: Response ${i}`);
      }

      const result = await summarizer.analyzeAndSummarize('chat@s.whatsapp.net', lines.join('\n'));

      expect(result).not.toBeNull();
      expect(result!.summary).toContain('project planning');
      expect(result!.keyTopics).toContain('planning');
    });

    it('saves summary to storage', async () => {
      const lines: string[] = [];
      for (let i = 0; i < 15; i++) {
        lines.push(`**User**: Message ${i}`);
        lines.push(`**Buddy**: Response ${i}`);
      }

      await summarizer.analyzeAndSummarize('chat@s.whatsapp.net', lines.join('\n'));

      expect(mockStorage.writeJson).toHaveBeenCalled();
    });

    it('skips if recent summary exists', async () => {
      mockStorage.listFiles.mockResolvedValue(['chat--s_whatsapp_net_2025-06-15.json']);
      mockStorage.getStats.mockResolvedValue({ mtime: new Date(), size: 100 });
      mockStorage.readJson.mockResolvedValue({
        summary: 'Existing',
        timestamp: new Date().toISOString(), // Recent
        keyTopics: [],
        importantDecisions: [],
      });

      const lines: string[] = [];
      for (let i = 0; i < 15; i++) {
        lines.push(`**User**: Msg ${i}`);
      }

      const result = await summarizer.analyzeAndSummarize('chat@s.whatsapp.net', lines.join('\n'));
      expect(result).toBeNull();
    });
  });

  describe('getLatestSummary', () => {
    it('returns null when no summaries exist', async () => {
      const result = await summarizer.getLatestSummary('chat@s.whatsapp.net');
      expect(result).toBeNull();
    });

    it('returns latest summary when files exist', async () => {
      const chatId = 'chat--s_whatsapp_net';
      mockStorage.listFiles.mockResolvedValue([
        `${chatId}_2025-06-14.json`,
        `${chatId}_2025-06-15.json`,
      ]);
      mockStorage.getStats.mockResolvedValue({ mtime: new Date(), size: 100 });
      mockStorage.readJson.mockResolvedValue({
        summary: 'Latest summary',
        keyTopics: ['topic1'],
        importantDecisions: [],
        timestamp: new Date().toISOString(),
        messageCount: 50,
      });

      const result = await summarizer.getLatestSummary('chat@s.whatsapp.net');

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Latest summary');
    });
  });

  describe('getAllSummaries', () => {
    it('returns empty array when no summaries', async () => {
      const result = await summarizer.getAllSummaries('chat@s.whatsapp.net');
      expect(result).toEqual([]);
    });

    it('returns all summaries sorted by date', async () => {
      const chatId = 'chat--s_whatsapp_net';
      mockStorage.listFiles.mockResolvedValue([
        `${chatId}_2025-06-13.json`,
        `${chatId}_2025-06-15.json`,
        `${chatId}_2025-06-14.json`,
      ]);
      mockStorage.readJson.mockImplementation(async (path: string) => {
        if (path.includes('13')) return { summary: 'Day 13', timestamp: '2025-06-13', keyTopics: [], importantDecisions: [] };
        if (path.includes('14')) return { summary: 'Day 14', timestamp: '2025-06-14', keyTopics: [], importantDecisions: [] };
        if (path.includes('15')) return { summary: 'Day 15', timestamp: '2025-06-15', keyTopics: [], importantDecisions: [] };
        return null;
      });

      const result = await summarizer.getAllSummaries('chat@s.whatsapp.net');

      expect(result.length).toBe(3);
      // Most recent first
      expect(result[0].summary).toBe('Day 15');
    });
  });

  describe('getSummaryForContext', () => {
    it('returns null when no summary', async () => {
      const result = await summarizer.getSummaryForContext('chat@s.whatsapp.net');
      expect(result).toBeNull();
    });

    it('returns formatted context string', async () => {
      const chatId = 'chat--s_whatsapp_net';
      mockStorage.listFiles.mockResolvedValue([`${chatId}_2025-06-15.json`]);
      mockStorage.getStats.mockResolvedValue({ mtime: new Date(), size: 100 });
      mockStorage.readJson.mockResolvedValue({
        summary: 'We discussed project plans.',
        date: '2025-06-15',
        keyTopics: ['planning'],
        importantDecisions: ['Launch Monday'],
        timestamp: new Date().toISOString(),
        messageCount: 50,
      });

      const result = await summarizer.getSummaryForContext('chat@s.whatsapp.net');

      expect(result).toContain('Previous Conversation Summary');
      expect(result).toContain('planning');
      expect(result).toContain('Launch Monday');
    });
  });
});
