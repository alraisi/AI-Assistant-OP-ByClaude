import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('file content'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ size: 100, mtime: new Date(), ctime: new Date() }),
}));

vi.mock('../config/index.js', () => ({
  getConfig: vi.fn(() => ({ memoryStoragePath: '/test/memory' })),
}));

vi.mock('../utils/write-queue.js', () => ({
  getWriteQueue: vi.fn(() => ({
    enqueue: vi.fn((_key: string, fn: () => Promise<void>) => fn()),
  })),
}));

import { MemoryStorage } from './storage.js';
import { readFile, writeFile, appendFile, readdir, stat, mkdir } from 'fs/promises';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockAppendFile = vi.mocked(appendFile);
const mockReaddir = vi.mocked(readdir);
const mockStat = vi.mocked(stat);
const mockMkdir = vi.mocked(mkdir);

let storage: MemoryStorage;

beforeEach(() => {
  vi.clearAllMocks();
  storage = new MemoryStorage({ basePath: '/test/memory' });
});

describe('MemoryStorage', () => {
  describe('read', () => {
    it('reads file content', async () => {
      mockReadFile.mockResolvedValue('hello world');
      const result = await storage.read('test.txt');
      expect(result).toBe('hello world');
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('test.txt'), 'utf-8');
    });

    it('returns null for non-existent files', async () => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      mockReadFile.mockRejectedValue(err);

      const result = await storage.read('missing.txt');
      expect(result).toBeNull();
    });

    it('throws for other errors', async () => {
      mockReadFile.mockRejectedValue(new Error('permission denied'));
      await expect(storage.read('bad.txt')).rejects.toThrow('permission denied');
    });
  });

  describe('write', () => {
    it('writes content to file', async () => {
      await storage.write('test.txt', 'hello');
      expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining('test.txt'), 'hello', 'utf-8');
    });

    it('ensures directory exists before writing', async () => {
      await storage.write('sub/dir/test.txt', 'content');
      expect(mockMkdir).toHaveBeenCalled();
    });
  });

  describe('append', () => {
    it('appends content to file', async () => {
      await storage.append('log.txt', 'new line');
      expect(mockAppendFile).toHaveBeenCalledWith(expect.stringContaining('log.txt'), 'new line', 'utf-8');
    });
  });

  describe('list', () => {
    it('lists files in directory', async () => {
      mockReaddir.mockResolvedValue(['a.txt', 'b.txt'] as any);
      const result = await storage.list('daily');
      expect(result).toEqual(['a.txt', 'b.txt']);
    });

    it('returns empty array for non-existent directory', async () => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      mockReaddir.mockRejectedValue(err);

      const result = await storage.list('missing');
      expect(result).toEqual([]);
    });
  });

  describe('exists', () => {
    it('returns true when file exists', async () => {
      mockStat.mockResolvedValue({ size: 100 } as any);
      const result = await storage.exists('test.txt');
      expect(result).toBe(true);
    });

    it('returns false when file does not exist', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));
      const result = await storage.exists('missing.txt');
      expect(result).toBe(false);
    });
  });

  describe('getSize', () => {
    it('returns file size', async () => {
      mockStat.mockResolvedValue({ size: 1024 } as any);
      const result = await storage.getSize('test.txt');
      expect(result).toBe(1024);
    });

    it('returns 0 for non-existent file', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));
      const result = await storage.getSize('missing.txt');
      expect(result).toBe(0);
    });
  });

  describe('readJson', () => {
    it('parses JSON content', async () => {
      mockReadFile.mockResolvedValue('{"key": "value"}');
      const result = await storage.readJson<{ key: string }>('data.json');
      expect(result).toEqual({ key: 'value' });
    });

    it('returns null for non-existent file', async () => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      mockReadFile.mockRejectedValue(err);

      const result = await storage.readJson('missing.json');
      expect(result).toBeNull();
    });

    it('returns null for invalid JSON', async () => {
      mockReadFile.mockResolvedValue('not valid json{');
      const result = await storage.readJson('bad.json');
      expect(result).toBeNull();
    });
  });

  describe('writeJson', () => {
    it('writes pretty-printed JSON', async () => {
      await storage.writeJson('data.json', { key: 'value' });
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('data.json'),
        JSON.stringify({ key: 'value' }, null, 2),
        'utf-8',
      );
    });
  });

  describe('getFullPath', () => {
    it('joins base path with relative path', () => {
      const result = storage.getFullPath('sub/file.txt');
      expect(result).toContain('sub');
      expect(result).toContain('file.txt');
    });
  });

  describe('ensureDir', () => {
    it('creates directory recursively', async () => {
      await storage.ensureDir('/test/new/dir');
      expect(mockMkdir).toHaveBeenCalledWith('/test/new/dir', { recursive: true });
    });

    it('ignores EEXIST errors', async () => {
      const err = new Error('EEXIST') as NodeJS.ErrnoException;
      err.code = 'EEXIST';
      mockMkdir.mockRejectedValue(err);

      await expect(storage.ensureDir('/existing')).resolves.toBeUndefined();
    });
  });
});
