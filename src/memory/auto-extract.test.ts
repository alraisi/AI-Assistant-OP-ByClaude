import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => true),
}));

vi.mock('../llm/index.js', () => ({
  getChatProvider: vi.fn(() => ({
    chat: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        memories: [
          {
            content: 'User works at Acme Corp',
            category: 'fact',
            subject: 'Employment',
            importance: 'medium',
            reason: 'Mentioned workplace',
          },
        ],
      }),
    }),
  })),
}));

const mockLongTermMemory = {
  addMemory: vi.fn().mockResolvedValue({ id: 'mem_123' }),
};

vi.mock('./long-term.js', () => ({
  getLongTermMemory: vi.fn(() => mockLongTermMemory),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { AutoMemoryExtractor, type ExtractionContext } from './auto-extract.js';
import { isEnabled } from '../config/index.js';
import { getChatProvider } from '../llm/index.js';

const mockIsEnabled = vi.mocked(isEnabled);
const mockGetChatProvider = vi.mocked(getChatProvider);

let extractor: AutoMemoryExtractor;

beforeEach(() => {
  vi.clearAllMocks();
  extractor = new AutoMemoryExtractor();
  mockIsEnabled.mockReturnValue(true);
  mockGetChatProvider.mockReturnValue({
    chat: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        memories: [
          {
            content: 'User works at Acme Corp',
            category: 'fact',
            subject: 'Employment',
            importance: 'medium',
            reason: 'Mentioned workplace',
          },
        ],
      }),
    }),
  } as any);
});

function makeContext(overrides: Partial<ExtractionContext> = {}): ExtractionContext {
  return {
    userMessage: 'I work at Acme Corp as a software engineer',
    assistantResponse: 'That sounds great! Software engineering at Acme.',
    senderJid: 'user@s.whatsapp.net',
    senderName: 'TestUser',
    chatJid: 'user@s.whatsapp.net',
    isGroup: false,
    ...overrides,
  };
}

describe('AutoMemoryExtractor', () => {
  describe('extractMemories', () => {
    it('returns empty when feature is disabled', async () => {
      mockIsEnabled.mockReturnValue(false);
      const result = await extractor.extractMemories(makeContext());
      expect(result).toEqual([]);
    });

    it('skips short messages', async () => {
      const result = await extractor.extractMemories(makeContext({ userMessage: 'hi' }));
      expect(result).toEqual([]);
    });

    it('extracts memories from conversation', async () => {
      const result = await extractor.extractMemories(makeContext());
      expect(result.length).toBe(1);
      expect(result[0].content).toContain('Acme Corp');
    });

    it('handles markdown code blocks in response', async () => {
      mockGetChatProvider.mockReturnValue({
        chat: vi.fn().mockResolvedValue({
          content: '```json\n{"memories": [{"content": "Test memory content", "category": "fact", "subject": "Test", "importance": "low", "reason": "test"}]}\n```',
        }),
      } as any);

      const result = await extractor.extractMemories(makeContext({ chatJid: 'markdown@s.whatsapp.net' }));
      expect(result.length).toBe(1);
    });

    it('returns empty for no-memories response', async () => {
      mockGetChatProvider.mockReturnValue({
        chat: vi.fn().mockResolvedValue({ content: '{"memories": []}' }),
      } as any);

      const result = await extractor.extractMemories(makeContext());
      expect(result).toEqual([]);
    });

    it('limits to 3 memories max', async () => {
      mockGetChatProvider.mockReturnValue({
        chat: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            memories: [
              { content: 'One memory content here', category: 'fact', subject: 'A', importance: 'low', reason: 'r' },
              { content: 'Two memory content here', category: 'fact', subject: 'B', importance: 'low', reason: 'r' },
              { content: 'Three memory content here', category: 'fact', subject: 'C', importance: 'low', reason: 'r' },
              { content: 'Four memory content here', category: 'fact', subject: 'D', importance: 'low', reason: 'r' },
            ],
          }),
        }),
      } as any);

      const result = await extractor.extractMemories(makeContext({ chatJid: 'limit@s.whatsapp.net' }));
      expect(result.length).toBe(3);
    });

    it('returns empty on LLM error', async () => {
      mockGetChatProvider.mockReturnValue({
        chat: vi.fn().mockRejectedValue(new Error('LLM down')),
      } as any);

      const result = await extractor.extractMemories(makeContext());
      expect(result).toEqual([]);
    });

    it('skips extraction from same chat within cooldown', async () => {
      // First extraction succeeds
      await extractor.extractMemories(makeContext());

      // Second extraction from same chat should be skipped
      const result = await extractor.extractMemories(makeContext());
      expect(result).toEqual([]);
    });

    it('filters out invalid memory entries', async () => {
      mockGetChatProvider.mockReturnValue({
        chat: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            memories: [
              { content: '', category: 'fact', subject: 'A', importance: 'low', reason: 'r' },
              { content: 'Valid memory here', category: 'fact', subject: 'B', importance: 'low', reason: 'r' },
            ],
          }),
        }),
      } as any);

      const result = await extractor.extractMemories(makeContext({ chatJid: 'other@s.whatsapp.net' }));
      expect(result.length).toBe(1);
      expect(result[0].content).toContain('Valid');
    });
  });

  describe('storeMemories', () => {
    it('does nothing for empty array', async () => {
      await extractor.storeMemories([], makeContext());
      expect(mockLongTermMemory.addMemory).not.toHaveBeenCalled();
    });

    it('stores each memory to long-term storage', async () => {
      const memories = [
        { content: 'Fact 1', category: 'fact' as const, subject: 'A', importance: 'low' as const, reason: 'test' },
        { content: 'Fact 2', category: 'fact' as const, subject: 'B', importance: 'medium' as const, reason: 'test' },
      ];

      await extractor.storeMemories(memories, makeContext());

      expect(mockLongTermMemory.addMemory).toHaveBeenCalledTimes(2);
    });

    it('includes sender JID in related JIDs', async () => {
      const memories = [
        { content: 'Test', category: 'fact' as const, subject: 'A', importance: 'low' as const, reason: 'r' },
      ];
      const ctx = makeContext({ senderJid: 'specific@s.whatsapp.net' });

      await extractor.storeMemories(memories, ctx);

      expect(mockLongTermMemory.addMemory).toHaveBeenCalledWith(
        expect.objectContaining({ relatedJids: ['specific@s.whatsapp.net'] }),
      );
    });
  });

  describe('processConversation', () => {
    it('extracts and stores in one call', async () => {
      await extractor.processConversation(makeContext({ chatJid: 'process@s.whatsapp.net' }));

      expect(mockLongTermMemory.addMemory).toHaveBeenCalled();
    });

    it('does nothing when no memories extracted', async () => {
      mockGetChatProvider.mockReturnValue({
        chat: vi.fn().mockResolvedValue({ content: '{"memories": []}' }),
      } as any);

      await extractor.processConversation(makeContext({ chatJid: 'empty@s.whatsapp.net' }));

      expect(mockLongTermMemory.addMemory).not.toHaveBeenCalled();
    });
  });
});
