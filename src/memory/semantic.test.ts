import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../llm/openai.js', () => ({
  openai: {
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0.1) }],
      }),
    },
  },
}));

vi.mock('../config/index.js', () => ({
  getConfig: vi.fn(() => ({ memoryStoragePath: '/test/memory' })),
  isEnabled: vi.fn(() => true),
}));

vi.mock('./long-term.js', () => ({
  getLongTermMemory: vi.fn(() => ({
    getAllMemories: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock('./daily-notes.js', () => ({
  getDailyNotes: vi.fn(() => ({
    getRecentDays: vi.fn().mockResolvedValue(new Map()),
  })),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { getSemanticMemory } from './semantic.js';
import { isEnabled } from '../config/index.js';
import { openai } from '../llm/openai.js';

const mockIsEnabled = vi.mocked(isEnabled);
const mockOpenai = vi.mocked(openai);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockReturnValue(true);
  mockOpenai.embeddings.create = vi.fn().mockResolvedValue({
    data: [{ embedding: new Array(1536).fill(0.1) }],
  });
});

describe('SemanticMemory', () => {
  describe('generateEmbedding', () => {
    it('generates embedding via OpenAI', async () => {
      const sm = getSemanticMemory();
      const embedding = await sm.generateEmbedding('test text');

      expect(embedding).toHaveLength(1536);
      expect(mockOpenai.embeddings.create).toHaveBeenCalledWith(
        expect.objectContaining({ input: 'test text' }),
      );
    });

    it('truncates long text to 8000 chars', async () => {
      const sm = getSemanticMemory();
      const longText = 'a'.repeat(10000);
      await sm.generateEmbedding(longText);

      const call = (mockOpenai.embeddings.create as any).mock.calls[0][0];
      expect(call.input.length).toBe(8000);
    });
  });

  describe('addMemory', () => {
    it('skips when feature is disabled', async () => {
      mockIsEnabled.mockReturnValue(false);
      const sm = getSemanticMemory();
      await sm.addMemory('test', 'long-term', { timestamp: new Date() });

      expect(mockOpenai.embeddings.create).not.toHaveBeenCalled();
    });

    it('skips very short text', async () => {
      const sm = getSemanticMemory();
      await sm.addMemory('short', 'long-term', { timestamp: new Date() });

      expect(mockOpenai.embeddings.create).not.toHaveBeenCalled();
    });

    it('adds memory entry to store', async () => {
      const sm = getSemanticMemory();
      await sm.addMemory('This is a test memory for storage', 'long-term', {
        timestamp: new Date(),
        category: 'fact',
      });

      const stats = sm.getStats();
      expect(stats.totalEntries).toBeGreaterThanOrEqual(1);
    });
  });

  describe('search', () => {
    it('returns empty when disabled', async () => {
      mockIsEnabled.mockReturnValue(false);
      const sm = getSemanticMemory();
      const results = await sm.search('test');
      expect(results).toEqual([]);
    });

    it('filters by senderJid for privacy', async () => {
      const sm = getSemanticMemory();

      // Add memory for user A
      let callCount = 0;
      mockOpenai.embeddings.create = vi.fn().mockImplementation(() => {
        callCount++;
        const val = callCount === 1 ? 0.9 : 0.1; // Different embeddings
        return Promise.resolve({
          data: [{ embedding: new Array(1536).fill(val) }],
        });
      });

      await sm.addMemory('User A secret info here', 'user', {
        timestamp: new Date(),
        senderJid: 'userA@s.whatsapp.net',
      });

      // Search as user B — should not find user A's memory
      const results = await sm.search('secret', { senderJid: 'userB@s.whatsapp.net' });
      const hasUserAMemory = results.some((r) => r.text.includes('User A'));
      expect(hasUserAMemory).toBe(false);
    });
  });

  describe('getStats', () => {
    it('returns store statistics', () => {
      const sm = getSemanticMemory();
      const stats = sm.getStats();

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('lastUpdated');
      expect(stats.totalEntries).toBeGreaterThanOrEqual(0);
    });
  });
});
