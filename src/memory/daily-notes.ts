import { getStorage, MemoryStorage } from './storage.js';
import { sanitizeJid } from '../utils/sanitize.js';

export interface ConversationEntry {
  timestamp: Date;
  chatJid: string;
  chatName: string;
  senderJid: string;
  senderName: string;
  userMessage: string;
  buddyResponse: string;
  isGroup: boolean;
}

export class DailyNotes {
  private storage: MemoryStorage;
  private readonly DAILY_DIR = 'daily';

  constructor(storage?: MemoryStorage) {
    this.storage = storage || getStorage();
  }

  private getDateString(date: Date = new Date()): string {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  private getFilePath(chatJid?: string, date?: Date): string {
    // Store daily notes per-chat for privacy isolation
    if (chatJid) {
      const sanitizedChatId = sanitizeJid(chatJid);
      return `${this.DAILY_DIR}/${sanitizedChatId}_${this.getDateString(date)}.md`;
    }
    // Fallback to global daily notes (for backwards compatibility)
    return `${this.DAILY_DIR}/${this.getDateString(date)}.md`;
  }

  private formatEntry(entry: ConversationEntry): string {
    const time = entry.timestamp.toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
    const chatContext = entry.isGroup
      ? `[Group: ${entry.chatName}]`
      : `[DM: ${entry.chatName}]`;

    return `
## ${time} ${chatContext}
<!-- chat:${entry.chatJid} sender:${entry.senderJid} -->
**${entry.senderName}**: ${entry.userMessage}
**Buddy**: ${entry.buddyResponse}
`;
  }

  async logConversation(entry: ConversationEntry): Promise<void> {
    // Store per-chat for privacy isolation between users
    const filePath = this.getFilePath(entry.chatJid, entry.timestamp);

    // Check if file exists, if not create header
    const exists = await this.storage.exists(filePath);
    if (!exists) {
      const header = `# Daily Notes - ${this.getDateString(entry.timestamp)}\n`;
      await this.storage.write(filePath, header);
    }

    const formatted = this.formatEntry(entry);
    await this.storage.append(filePath, formatted);
  }

  async getTodaysNotes(chatJid: string): Promise<string | null> {
    return this.storage.read(this.getFilePath(chatJid));
  }

  async getNotesForDate(chatJid: string, date: Date): Promise<string | null> {
    return this.storage.read(this.getFilePath(chatJid, date));
  }

  async getRecentDays(chatJid?: string, days: number = 7): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = this.getDateString(date);
      // Per-chat isolation (if chatJid provided)
      const notes = await this.storage.read(this.getFilePath(chatJid, date));
      if (notes) {
        result.set(dateStr, notes);
      }
    }

    return result;
  }

  async searchConversations(chatJid: string, days: number = 7): Promise<string[]> {
    const results: string[] = [];
    // Now properly isolated per-chat
    const recentNotes = await this.getRecentDays(chatJid, days);

    for (const [_, notes] of recentNotes) {
      // All entries in this file are for this chat already
      const entries = notes.split('\n## ').slice(1); // Skip header
      for (const entry of entries) {
        results.push(`## ${entry}`);
      }
    }

    return results;
  }

  async getTodaysSize(): Promise<number> {
    return this.storage.getSize(this.getFilePath());
  }
}

let instance: DailyNotes | null = null;

export function getDailyNotes(): DailyNotes {
  if (!instance) {
    instance = new DailyNotes();
  }
  return instance;
}
