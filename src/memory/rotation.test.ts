import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage = {
  list: vi.fn().mockResolvedValue([]),
  read: vi.fn().mockResolvedValue(null),
  write: vi.fn().mockResolvedValue(undefined),
};

vi.mock('./storage.js', () => ({
  getStorage: vi.fn(() => mockStorage),
  MemoryStorage: vi.fn(() => mockStorage),
}));

vi.mock('../config/index.js', () => ({
  getConfig: vi.fn(() => ({ memoryRetentionDays: 30 })),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { MemoryRotation } from './rotation.js';

let rotation: MemoryRotation;

beforeEach(() => {
  vi.clearAllMocks();
  rotation = new MemoryRotation(mockStorage as any);
  mockStorage.list.mockResolvedValue([]);
});

describe('MemoryRotation', () => {
  describe('rotateOldDailyNotes', () => {
    it('does nothing when no files exist', async () => {
      await rotation.rotateOldDailyNotes();
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('does not rotate recent files', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];

      mockStorage.list.mockResolvedValue([`${dateStr}.md`]);

      await rotation.rotateOldDailyNotes();

      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('rotates files older than retention period', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 days old, retention is 30
      const dateStr = oldDate.toISOString().split('T')[0];

      mockStorage.list.mockResolvedValue([`${dateStr}.md`]);
      mockStorage.read.mockResolvedValue(
        '# Daily Notes - ' + dateStr + '\n## 14:30:00 [DM: User]\n**User**: hello\n**Buddy**: hi',
      );

      await rotation.rotateOldDailyNotes();

      // Should write archive file and replace original
      expect(mockStorage.write).toHaveBeenCalledTimes(2);
      // First call: archive file
      expect(mockStorage.write.mock.calls[0][0]).toContain('archive');
      // Second call: replace original with marker
      expect(mockStorage.write.mock.calls[1][0]).toContain(dateStr);
    });

    it('ignores non-daily-note files', async () => {
      mockStorage.list.mockResolvedValue(['README.md', 'notes.txt']);

      await rotation.rotateOldDailyNotes();

      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('rotates per-chat daily note files when old enough', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 days old, retention is 30
      const dateStr = oldDate.toISOString().split('T')[0];

      mockStorage.list.mockResolvedValue([`123--s_whatsapp_net_${dateStr}.md`]);
      mockStorage.read.mockResolvedValue(
        '# Daily Notes - ' + dateStr + '\n## 14:30:00 [DM: User]\n**User**: hello\n**Buddy**: hi',
      );

      await rotation.rotateOldDailyNotes();

      // Should write archive file and replace original
      expect(mockStorage.write).toHaveBeenCalledTimes(2);
      expect(mockStorage.write.mock.calls[0][0]).toContain('archive');
    });

    it('skips files with invalid dates', async () => {
      mockStorage.list.mockResolvedValue(['not-a-date.md']);

      await rotation.rotateOldDailyNotes();

      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      mockStorage.list.mockRejectedValue(new Error('fs error'));

      // Should not throw
      await expect(rotation.rotateOldDailyNotes()).resolves.toBeUndefined();
    });
  });
});
