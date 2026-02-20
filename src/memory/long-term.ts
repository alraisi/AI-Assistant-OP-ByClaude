import { getStorage, MemoryStorage } from './storage.js';
import { sanitizeJid } from '../utils/sanitize.js';
import { randomUUID } from 'crypto';

export interface Memory {
  id: string;
  timestamp: Date;
  category: MemoryCategory;
  subject: string;
  content: string;
  relatedJids: string[];
  importance: 'low' | 'medium' | 'high';
}

export type MemoryCategory =
  | 'fact'
  | 'preference'
  | 'project'
  | 'relationship'
  | 'event'
  | 'other';

export class LongTermMemory {
  private storage: MemoryStorage;
  private readonly MEMORY_FILE = 'MEMORY.md';
  private readonly USERS_DIR = 'users';

  constructor(storage?: MemoryStorage) {
    this.storage = storage || getStorage();
  }

  private generateId(): string {
    return `mem_${randomUUID()}`;
  }

  private formatMemory(memory: Memory): string {
    const tags = memory.relatedJids.length > 0
      ? `\nRelated: ${memory.relatedJids.join(', ')}`
      : '';

    return `
### ${memory.subject}
- **ID**: ${memory.id}
- **Category**: ${memory.category}
- **Importance**: ${memory.importance}
- **Date**: ${memory.timestamp.toISOString().split('T')[0]}
${tags}

${memory.content}

---
`;
  }

  async addMemory(memory: Omit<Memory, 'id' | 'timestamp'>): Promise<Memory> {
    const fullMemory: Memory = {
      ...memory,
      id: this.generateId(),
      timestamp: new Date(),
    };

    const exists = await this.storage.exists(this.MEMORY_FILE);
    if (!exists) {
      const header = `# Long-Term Memory

This file contains curated, important memories that Buddy should remember across conversations.

`;
      await this.storage.write(this.MEMORY_FILE, header);
    }

    const formatted = this.formatMemory(fullMemory);
    await this.storage.append(this.MEMORY_FILE, formatted);

    // Also store in user-specific file if related to specific users
    for (const jid of fullMemory.relatedJids) {
      await this.addUserMemory(jid, fullMemory);
    }

    return fullMemory;
  }

  private async addUserMemory(jid: string, memory: Memory): Promise<void> {
    const sanitizedJid = sanitizeJid(jid);
    const userFile = `${this.USERS_DIR}/${sanitizedJid}.md`;

    const exists = await this.storage.exists(userFile);
    if (!exists) {
      const header = `# Memories for ${jid}\n\n`;
      await this.storage.write(userFile, header);
    }

    const formatted = this.formatMemory(memory);
    await this.storage.append(userFile, formatted);
  }

  async getAllMemories(): Promise<string | null> {
    return this.storage.read(this.MEMORY_FILE);
  }

  async getUserMemories(jid: string): Promise<string | null> {
    const sanitizedJid = sanitizeJid(jid);
    return this.storage.read(`${this.USERS_DIR}/${sanitizedJid}.md`);
  }

  async searchMemories(query: string): Promise<string[]> {
    const allMemories = await this.getAllMemories();
    if (!allMemories) return [];

    const lowerQuery = query.toLowerCase();
    const sections = allMemories.split('\n### ').slice(1); // Skip header

    return sections
      .filter((section) => section.toLowerCase().includes(lowerQuery))
      .map((section) => `### ${section}`);
  }

  async getMemoriesByCategory(category: MemoryCategory): Promise<string[]> {
    const allMemories = await this.getAllMemories();
    if (!allMemories) return [];

    const sections = allMemories.split('\n### ').slice(1);

    return sections
      .filter((section) => section.includes(`**Category**: ${category}`))
      .map((section) => `### ${section}`);
  }

  async getHighImportanceMemories(): Promise<string[]> {
    const allMemories = await this.getAllMemories();
    if (!allMemories) return [];

    const sections = allMemories.split('\n### ').slice(1);

    return sections
      .filter((section) => section.includes('**Importance**: high'))
      .map((section) => `### ${section}`);
  }

  /**
   * Get high importance memories for a specific user only
   * This ensures privacy between different users
   */
  async getUserHighImportanceMemories(jid: string): Promise<string[]> {
    const userMemories = await this.getUserMemories(jid);
    if (!userMemories) return [];

    const sections = userMemories.split('\n### ').slice(1);

    return sections
      .filter((section) => section.includes('**Importance**: high'))
      .map((section) => `### ${section}`);
  }
}

let instance: LongTermMemory | null = null;

export function getLongTermMemory(): LongTermMemory {
  if (!instance) {
    instance = new LongTermMemory();
  }
  return instance;
}
