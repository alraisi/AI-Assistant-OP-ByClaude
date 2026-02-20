import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage = {
  ensureDir: vi.fn().mockResolvedValue(undefined),
  getFullPath: vi.fn((p: string) => `/test/${p}`),
};

const mockDailyNotes = {
  logConversation: vi.fn().mockResolvedValue(undefined),
  getTodaysNotes: vi.fn().mockResolvedValue(null),
};

const mockLongTermMemory = {
  addMemory: vi.fn().mockResolvedValue({ id: 'mem_1' }),
  getAllMemories: vi.fn().mockResolvedValue(null),
  getUserMemories: vi.fn().mockResolvedValue(null),
  searchMemories: vi.fn().mockResolvedValue([]),
};

const mockContextBuilder = {
  buildContext: vi.fn().mockResolvedValue({ systemContext: '', recentMessages: [] }),
  getSummaryForChat: vi.fn().mockResolvedValue('Summary text'),
};

const mockRotation = {
  rotateOldDailyNotes: vi.fn().mockResolvedValue(undefined),
};

vi.mock('./storage.js', () => ({
  getStorage: vi.fn(() => mockStorage),
  MemoryStorage: vi.fn(),
}));

vi.mock('./daily-notes.js', () => ({
  getDailyNotes: vi.fn(() => mockDailyNotes),
  DailyNotes: vi.fn(),
}));

vi.mock('./long-term.js', () => ({
  getLongTermMemory: vi.fn(() => mockLongTermMemory),
  LongTermMemory: vi.fn(),
}));

vi.mock('./context-builder.js', () => ({
  getContextBuilder: vi.fn(() => mockContextBuilder),
  ContextBuilder: vi.fn(),
}));

vi.mock('./rotation.js', () => ({
  getMemoryRotation: vi.fn(() => mockRotation),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { MemoryOrchestrator } from './index.js';

let orchestrator: MemoryOrchestrator;

beforeEach(() => {
  vi.clearAllMocks();
  orchestrator = new MemoryOrchestrator();
});

describe('MemoryOrchestrator', () => {
  describe('initialize', () => {
    it('ensures directories exist', async () => {
      await orchestrator.initialize();
      expect(mockStorage.ensureDir).toHaveBeenCalledTimes(3);
    });

    it('runs memory rotation', async () => {
      await orchestrator.initialize();
      expect(mockRotation.rotateOldDailyNotes).toHaveBeenCalled();
    });

    it('handles rotation failure gracefully', async () => {
      mockRotation.rotateOldDailyNotes.mockRejectedValue(new Error('rotation fail'));
      await expect(orchestrator.initialize()).resolves.toBeUndefined();
    });
  });

  describe('logConversation', () => {
    it('delegates to daily notes', async () => {
      const entry = {
        timestamp: new Date(),
        chatJid: '123@s.whatsapp.net',
        chatName: 'User',
        senderJid: '123@s.whatsapp.net',
        senderName: 'User',
        userMessage: 'hello',
        buddyResponse: 'hi',
        isGroup: false,
      };

      await orchestrator.logConversation(entry);
      expect(mockDailyNotes.logConversation).toHaveBeenCalledWith(entry);
    });
  });

  describe('addMemory', () => {
    it('delegates to long-term memory', async () => {
      const memory = {
        category: 'fact' as const,
        subject: 'Test',
        content: 'Content',
        relatedJids: [],
        importance: 'low' as const,
      };

      const result = await orchestrator.addMemory(memory);
      expect(mockLongTermMemory.addMemory).toHaveBeenCalledWith(memory);
      expect(result.id).toBe('mem_1');
    });
  });

  describe('getContext', () => {
    it('delegates to context builder', async () => {
      const options = {
        chatJid: '123@s.whatsapp.net',
        senderJid: '123@s.whatsapp.net',
        senderName: 'User',
        isGroup: false,
      };

      await orchestrator.getContext(options);
      expect(mockContextBuilder.buildContext).toHaveBeenCalledWith(options);
    });
  });

  describe('getTodaysNotes', () => {
    it('delegates to daily notes', async () => {
      mockDailyNotes.getTodaysNotes.mockResolvedValue('notes content');
      const result = await orchestrator.getTodaysNotes('123@s.whatsapp.net');
      expect(result).toBe('notes content');
    });
  });

  describe('getAllMemories', () => {
    it('delegates to long-term memory', async () => {
      mockLongTermMemory.getAllMemories.mockResolvedValue('memories');
      const result = await orchestrator.getAllMemories();
      expect(result).toBe('memories');
    });
  });

  describe('getUserMemories', () => {
    it('delegates to long-term memory', async () => {
      mockLongTermMemory.getUserMemories.mockResolvedValue('user memories');
      const result = await orchestrator.getUserMemories('user@s.whatsapp.net');
      expect(result).toBe('user memories');
    });
  });

  describe('searchMemories', () => {
    it('delegates to long-term memory', async () => {
      mockLongTermMemory.searchMemories.mockResolvedValue(['result1']);
      const result = await orchestrator.searchMemories('query');
      expect(result).toEqual(['result1']);
    });
  });

  describe('getChatSummary', () => {
    it('delegates to context builder', async () => {
      const result = await orchestrator.getChatSummary('123@s.whatsapp.net');
      expect(result).toBe('Summary text');
    });
  });
});
