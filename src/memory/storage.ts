import { mkdir, readFile, writeFile, appendFile, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { getConfig } from '../config/index.js';
import { getWriteQueue } from '../utils/write-queue.js';

export interface FileStats {
  size: number;
  mtime: Date;
  ctime: Date;
}

export interface StorageOptions {
  basePath?: string;
}

export class MemoryStorage {
  private basePath: string;

  constructor(options?: StorageOptions) {
    this.basePath = options?.basePath || getConfig().memoryStoragePath;
  }

  async ensureDir(path: string): Promise<void> {
    try {
      await mkdir(path, { recursive: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw err;
      }
    }
  }

  async read(relativePath: string): Promise<string | null> {
    const fullPath = join(this.basePath, relativePath);
    try {
      return await readFile(fullPath, 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async write(relativePath: string, content: string): Promise<void> {
    const fullPath = join(this.basePath, relativePath);
    const queue = getWriteQueue();
    await queue.enqueue(fullPath, async () => {
      await this.ensureDir(dirname(fullPath));
      await writeFile(fullPath, content, 'utf-8');
    });
  }

  async append(relativePath: string, content: string): Promise<void> {
    const fullPath = join(this.basePath, relativePath);
    const queue = getWriteQueue();
    await queue.enqueue(fullPath, async () => {
      await this.ensureDir(dirname(fullPath));
      await appendFile(fullPath, content, 'utf-8');
    });
  }

  async list(relativePath: string): Promise<string[]> {
    const fullPath = join(this.basePath, relativePath);
    try {
      return await readdir(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    const fullPath = join(this.basePath, relativePath);
    try {
      await stat(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getSize(relativePath: string): Promise<number> {
    const fullPath = join(this.basePath, relativePath);
    try {
      const stats = await stat(fullPath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  getFullPath(relativePath: string): string {
    return join(this.basePath, relativePath);
  }

  async readJson<T = unknown>(relativePath: string): Promise<T | null> {
    const content = await this.read(relativePath);
    if (!content) return null;
    try {
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  async writeJson(relativePath: string, data: unknown): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await this.write(relativePath, content);
  }

  async listFiles(relativePath: string): Promise<string[]> {
    return this.list(relativePath);
  }

  async getStats(relativePath: string): Promise<FileStats> {
    const fullPath = join(this.basePath, relativePath);
    const stats = await stat(fullPath);
    return {
      size: stats.size,
      mtime: stats.mtime,
      ctime: stats.ctime,
    };
  }
}

let instance: MemoryStorage | null = null;

export function getStorage(): MemoryStorage {
  if (!instance) {
    instance = new MemoryStorage();
  }
  return instance;
}
