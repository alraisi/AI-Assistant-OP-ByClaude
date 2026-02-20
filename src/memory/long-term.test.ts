import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage = {
  exists: vi.fn().mockResolvedValue(false),
  read: vi.fn().mockResolvedValue(null),
  write: vi.fn().mockResolvedValue(undefined),
  append: vi.fn().mockResolvedValue(undefined),
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

import { LongTermMemory } from './long-term.js';

let ltm: LongTermMemory;

beforeEach(() => {
  vi.clearAllMocks();
  ltm = new LongTermMemory(mockStorage as any);
  mockStorage.exists.mockResolvedValue(false);
  mockStorage.read.mockResolvedValue(null);
});

describe('LongTermMemory', () => {
  describe('addMemory', () => {
    it('creates header for new memory file', async () => {
      await ltm.addMemory({
        category: 'fact',
        subject: 'Test subject',
        content: 'Test content',
        relatedJids: [],
        importance: 'medium',
      });

      expect(mockStorage.write).toHaveBeenCalledWith(
        'MEMORY.md',
        expect.stringContaining('# Long-Term Memory'),
      );
    });

    it('appends formatted memory', async () => {
      const result = await ltm.addMemory({
        category: 'preference',
        subject: 'Favorite color',
        content: 'User likes blue',
        relatedJids: [],
        importance: 'low',
      });

      expect(result.id).toMatch(/^mem_/);
      expect(mockStorage.append).toHaveBeenCalledWith(
        'MEMORY.md',
        expect.stringContaining('Favorite color'),
      );
    });

    it('includes category and importance', async () => {
      await ltm.addMemory({
        category: 'project',
        subject: 'Work project',
        content: 'Building an app',
        relatedJids: [],
        importance: 'high',
      });

      const appended = mockStorage.append.mock.calls[0][1];
      expect(appended).toContain('project');
      expect(appended).toContain('high');
    });

    it('stores user-specific memory for related JIDs', async () => {
      await ltm.addMemory({
        category: 'fact',
        subject: 'Name',
        content: 'User is Ahmed',
        relatedJids: ['ahmed@s.whatsapp.net'],
        importance: 'high',
      });

      // Should write to MEMORY.md AND users/ file
      expect(mockStorage.append).toHaveBeenCalledTimes(2);
      const userFilePath = mockStorage.append.mock.calls[1][0];
      expect(userFilePath).toContain('users/');
    });

    it('does not recreate header for existing file', async () => {
      mockStorage.exists.mockResolvedValue(true);
      await ltm.addMemory({
        category: 'fact',
        subject: 'Test',
        content: 'Content',
        relatedJids: [],
        importance: 'low',
      });

      // write() should NOT be called for header when file exists
      expect(mockStorage.write).not.toHaveBeenCalled();
    });
  });

  describe('getAllMemories', () => {
    it('reads MEMORY.md', async () => {
      mockStorage.read.mockResolvedValue('# Memory\n### Entry');
      const result = await ltm.getAllMemories();
      expect(result).toContain('Memory');
    });

    it('returns null when no memories exist', async () => {
      const result = await ltm.getAllMemories();
      expect(result).toBeNull();
    });
  });

  describe('getUserMemories', () => {
    it('reads user-specific file', async () => {
      mockStorage.read.mockResolvedValue('# User memories');
      const result = await ltm.getUserMemories('user@s.whatsapp.net');
      expect(result).toContain('User memories');
    });
  });

  describe('searchMemories', () => {
    it('finds matching sections', async () => {
      mockStorage.read.mockResolvedValue(
        '# Memory\n\n### Pizza preference\nUser loves pizza\n---\n### Color preference\nUser likes blue\n---',
      );

      const results = await ltm.searchMemories('pizza');
      expect(results.length).toBe(1);
      expect(results[0]).toContain('pizza');
    });

    it('returns empty array when no matches', async () => {
      mockStorage.read.mockResolvedValue('# Memory\n\n### Color\nUser likes blue');
      const results = await ltm.searchMemories('unicorn');
      expect(results).toEqual([]);
    });

    it('returns empty array when no memories', async () => {
      const results = await ltm.searchMemories('anything');
      expect(results).toEqual([]);
    });
  });

  describe('getMemoriesByCategory', () => {
    it('filters by category', async () => {
      mockStorage.read.mockResolvedValue(
        '# Memory\n\n### Fact\n- **Category**: fact\nSome fact\n---\n### Pref\n- **Category**: preference\nSome pref\n---',
      );

      const results = await ltm.getMemoriesByCategory('fact');
      expect(results.length).toBe(1);
      expect(results[0]).toContain('fact');
    });
  });

  describe('getHighImportanceMemories', () => {
    it('filters high importance memories', async () => {
      mockStorage.read.mockResolvedValue(
        '# Memory\n\n### Important\n- **Importance**: high\nImportant thing\n---\n### Minor\n- **Importance**: low\nMinor thing\n---',
      );

      const results = await ltm.getHighImportanceMemories();
      expect(results.length).toBe(1);
      expect(results[0]).toContain('high');
    });
  });

  describe('getUserHighImportanceMemories', () => {
    it('filters high importance from user file', async () => {
      mockStorage.read.mockResolvedValue(
        '# User\n\n### Name\n- **Importance**: high\nUser name is Ahmed\n---\n### Mood\n- **Importance**: low\nWas happy\n---',
      );

      const results = await ltm.getUserHighImportanceMemories('user@s.whatsapp.net');
      expect(results.length).toBe(1);
    });

    it('returns empty for unknown user', async () => {
      const results = await ltm.getUserHighImportanceMemories('unknown@s.whatsapp.net');
      expect(results).toEqual([]);
    });
  });
});
