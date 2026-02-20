import { getStorage, MemoryStorage } from './storage.js';
import { getConfig } from '../config/index.js';
import pino from 'pino';

const logger = pino({ name: 'memory-rotation' });

export class MemoryRotation {
  private storage: MemoryStorage;
  private readonly DAILY_DIR = 'daily';
  private readonly ARCHIVE_DIR = 'daily/archive';

  constructor(storage?: MemoryStorage) {
    this.storage = storage || getStorage();
  }

  async rotateOldDailyNotes(): Promise<void> {
    const config = getConfig();
    const retentionDays = config.memoryRetentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const files = await this.storage.list(this.DAILY_DIR);
      const DATE_PATTERN = /(\d{4}-\d{2}-\d{2})\.md$/;
      const dailyFiles = files.filter((f) => DATE_PATTERN.test(f));

      let rotated = 0;
      for (const file of dailyFiles) {
        const dateMatch = file.match(DATE_PATTERN);
        if (!dateMatch) continue;
        const dateStr = dateMatch[1];
        const fileDate = new Date(dateStr + 'T00:00:00');

        if (isNaN(fileDate.getTime())) continue;

        if (fileDate < cutoffDate) {
          await this.archiveFile(file, dateStr);
          rotated++;
        }
      }

      if (rotated > 0) {
        logger.info({ rotated, retentionDays }, 'Rotated old daily notes');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to rotate daily notes');
    }
  }

  private async archiveFile(filename: string, dateStr: string): Promise<void> {
    const sourcePath = `${this.DAILY_DIR}/${filename}`;
    const content = await this.storage.read(sourcePath);

    if (!content) return;

    // Create a condensed summary (extract just the conversation pairs)
    const summary = this.summarizeNotes(content, dateStr);
    const archivePath = `${this.ARCHIVE_DIR}/${filename}`;

    await this.storage.write(archivePath, summary);

    // Remove the original file by writing empty (we can't delete via storage API, so overwrite with archive marker)
    await this.storage.write(sourcePath, `# Archived - ${dateStr}\n\nThis file has been archived to ${archivePath}\n`);

    logger.debug({ file: filename }, 'Archived daily note');
  }

  private summarizeNotes(content: string, dateStr: string): string {
    const lines = content.split('\n');
    const summaryParts: string[] = [`# Archive Summary - ${dateStr}\n`];

    let conversationCount = 0;
    let currentChat = '';

    for (const line of lines) {
      // Extract chat context headers
      const headerMatch = line.match(/^## \d{2}:\d{2}:\d{2} \[(.+?)\]$/);
      if (headerMatch) {
        conversationCount++;
        const chatContext = headerMatch[1];
        if (chatContext !== currentChat) {
          currentChat = chatContext;
          summaryParts.push(`\n## ${chatContext}`);
        }
        continue;
      }

      // Keep user/bot message pairs for the summary
      if (line.startsWith('**') && line.includes('**:')) {
        summaryParts.push(line);
      }
    }

    summaryParts.push(`\n---\nTotal conversations: ${conversationCount}`);
    return summaryParts.join('\n');
  }
}

let instance: MemoryRotation | null = null;

export function getMemoryRotation(): MemoryRotation {
  if (!instance) {
    instance = new MemoryRotation();
  }
  return instance;
}
