import { getStorage, MemoryStorage } from './storage.js';
import { getDailyNotes, DailyNotes, type ConversationEntry } from './daily-notes.js';
import {
  getLongTermMemory,
  LongTermMemory,
  type Memory,
  type MemoryCategory,
} from './long-term.js';
import { getContextBuilder, ContextBuilder, type ContextBuildOptions, type BuiltContext } from './context-builder.js';
import { getMemoryRotation } from './rotation.js';
import pino from 'pino';

const logger = pino({ name: 'memory-orchestrator' });

export class MemoryOrchestrator {
  private storage: MemoryStorage;
  private dailyNotes: DailyNotes;
  private longTermMemory: LongTermMemory;
  private contextBuilder: ContextBuilder;

  constructor() {
    this.storage = getStorage();
    this.dailyNotes = getDailyNotes();
    this.longTermMemory = getLongTermMemory();
    this.contextBuilder = getContextBuilder();
  }

  async initialize(): Promise<void> {
    // Ensure base directories exist
    await this.storage.ensureDir(this.storage.getFullPath('daily'));
    await this.storage.ensureDir(this.storage.getFullPath('daily/archive'));
    await this.storage.ensureDir(this.storage.getFullPath('users'));

    // Rotate old daily notes (non-blocking)
    try {
      await getMemoryRotation().rotateOldDailyNotes();
    } catch (error) {
      logger.warn({ error }, 'Memory rotation failed at startup (non-critical)');
    }
  }

  async logConversation(entry: ConversationEntry): Promise<void> {
    await this.dailyNotes.logConversation(entry);
  }

  async addMemory(
    memory: Omit<Memory, 'id' | 'timestamp'>
  ): Promise<Memory> {
    return this.longTermMemory.addMemory(memory);
  }

  async getContext(options: ContextBuildOptions): Promise<BuiltContext> {
    return this.contextBuilder.buildContext(options);
  }

  async getTodaysNotes(chatJid: string): Promise<string | null> {
    return this.dailyNotes.getTodaysNotes(chatJid);
  }

  async getAllMemories(): Promise<string | null> {
    return this.longTermMemory.getAllMemories();
  }

  async getUserMemories(jid: string): Promise<string | null> {
    return this.longTermMemory.getUserMemories(jid);
  }

  async searchMemories(query: string): Promise<string[]> {
    return this.longTermMemory.searchMemories(query);
  }

  async getChatSummary(chatJid: string): Promise<string> {
    return this.contextBuilder.getSummaryForChat(chatJid);
  }
}

let instance: MemoryOrchestrator | null = null;

export function getMemoryOrchestrator(): MemoryOrchestrator {
  if (!instance) {
    instance = new MemoryOrchestrator();
  }
  return instance;
}

// Re-export types and utilities
export { MemoryStorage, getStorage } from './storage.js';
export { DailyNotes, getDailyNotes, type ConversationEntry } from './daily-notes.js';
export {
  LongTermMemory,
  getLongTermMemory,
  type Memory,
  type MemoryCategory,
} from './long-term.js';
export {
  ContextBuilder,
  getContextBuilder,
  type ContextBuildOptions,
  type BuiltContext,
} from './context-builder.js';
