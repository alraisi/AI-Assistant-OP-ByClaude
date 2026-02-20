import { getDailyNotes, DailyNotes } from './daily-notes.js';
import { getLongTermMemory, LongTermMemory } from './long-term.js';
import { getSemanticMemory } from './semantic.js';
import { isEnabled } from '../config/index.js';
import type { Message } from '../llm/types.js';
import pino from 'pino';

const logger = pino({ name: 'context-builder' });

export interface ContextBuildOptions {
  chatJid: string;
  senderJid: string;
  senderName: string;
  isGroup: boolean;
  groupName?: string;
  maxMessages?: number;
  includeLongTerm?: boolean;
  includeDaily?: boolean;
}

export interface BuiltContext {
  systemContext: string;
  recentMessages: Message[];
}

export class ContextBuilder {
  private dailyNotes: DailyNotes;
  private longTermMemory: LongTermMemory;

  constructor(dailyNotes?: DailyNotes, longTermMemory?: LongTermMemory) {
    this.dailyNotes = dailyNotes || getDailyNotes();
    this.longTermMemory = longTermMemory || getLongTermMemory();
  }

  async buildContext(options: ContextBuildOptions): Promise<BuiltContext> {
    const contextParts: string[] = [];

    // Add long-term memories if enabled
    if (options.includeLongTerm !== false) {
      const longTermContext = await this.buildLongTermContext(
        options.senderJid,
        options.chatJid
      );
      if (longTermContext) {
        contextParts.push(longTermContext);
      }
    }

    // Add recent daily interactions if enabled
    if (options.includeDaily !== false) {
      const dailyContext = await this.buildDailyContext(
        options.chatJid,
        options.senderJid
      );
      if (dailyContext) {
        contextParts.push(dailyContext);
      }
    }

    const systemContext = contextParts.length > 0
      ? contextParts.join('\n\n')
      : '';

    // Extract recent messages for conversation history
    const recentMessages = await this.extractRecentMessages(
      options.chatJid,
      options.maxMessages || 10
    );

    return {
      systemContext,
      recentMessages,
    };
  }

  private async buildLongTermContext(
    senderJid: string,
    chatJid: string,
    query?: string
  ): Promise<string | null> {
    const parts: string[] = [];

    // IMPORTANT: Only use user-specific memories, NEVER shared memories
    // to ensure privacy between different users
    
    // Get user-specific memories only
    const userMemories = await this.longTermMemory.getUserMemories(senderJid);
    if (userMemories) {
      // Take first 2000 chars of user memories
      const trimmed = userMemories.slice(0, 2000);
      parts.push(`## About This User\n${trimmed}`);
    }
    
    // Get high-importance memories ONLY for this specific user
    const userImportantMemories = await this.longTermMemory.getUserHighImportanceMemories(senderJid);
    if (userImportantMemories.length > 0) {
      parts.push('## Important Memories\n' + userImportantMemories.slice(0, 5).join('\n'));
    }

    // Semantic memory search (if enabled and query provided)
    // IMPORTANT: Only search THIS user's memories for privacy
    if (isEnabled('semanticMemory') && query) {
      try {
        const semanticMemory = getSemanticMemory();
        const semanticResults = await semanticMemory.search(query, {
          topK: 3,
          threshold: 0.7,
          senderJid: senderJid, // Privacy: only this user's memories
        });
        
        if (semanticResults.length > 0) {
          const semanticSection = semanticResults
            .map(r => `• ${r.text} (relevance: ${Math.round(r.score * 100)}%)`)
            .join('\n');
          parts.push(`## Related Memories\n${semanticSection}`);
        }
      } catch (error) {
        logger.warn({ error }, 'Semantic memory search failed (non-critical)');
      }
    }

    return parts.length > 0
      ? '# Memory Context\n\n' + parts.join('\n\n')
      : null;
  }

  private async buildDailyContext(
    chatJid: string,
    senderJid: string
  ): Promise<string | null> {
    // Get recent conversations from this chat ONLY (privacy isolation)
    const recentConversations = await this.dailyNotes.searchConversations(
      chatJid,
      3 // Look back 3 days
    );

    if (recentConversations.length === 0) {
      return null;
    }

    // Take last few conversations, max 3000 chars
    const recent = recentConversations.slice(-5).join('\n');
    const trimmed = recent.slice(-3000);

    return `# Recent Conversations\n\n${trimmed}`;
  }

  private async extractRecentMessages(
    chatJid: string,
    maxMessages: number
  ): Promise<Message[]> {
    const messages: Message[] = [];

    // Search recent conversations for this chat ONLY (privacy isolation)
    const recentConversations = await this.dailyNotes.searchConversations(chatJid, 3);

    for (const entry of recentConversations) {
      // Parse the daily notes markdown format:
      // **SenderName**: message
      // **Buddy**: response
      const lines = entry.split('\n');

      let userMessage: string | null = null;
      let assistantMessage: string | null = null;

      for (const line of lines) {
        const trimmed = line.trim();

        // Match **Buddy**: response
        const buddyMatch = trimmed.match(/^\*\*Buddy\*\*:\s*(.+)$/);
        if (buddyMatch) {
          assistantMessage = buddyMatch[1];
          continue;
        }

        // Match **SenderName**: message (any name that's not Buddy)
        const userMatch = trimmed.match(/^\*\*(?!Buddy\*\*).+?\*\*:\s*(.+)$/);
        if (userMatch) {
          userMessage = userMatch[1];
          continue;
        }
      }

      if (userMessage) {
        messages.push({ role: 'user', content: userMessage });
      }
      if (assistantMessage) {
        messages.push({ role: 'assistant', content: assistantMessage });
      }
    }

    // Return only the most recent messages, within limit
    return messages.slice(-maxMessages);
  }

  async getSummaryForChat(chatJid: string): Promise<string> {
    const daily = await this.dailyNotes.searchConversations(chatJid, 7);
    const conversations = daily.length;

    const userMemories = await this.longTermMemory.getAllMemories();
    const hasMemories = userMemories && userMemories.length > 100;

    let summary = `Chat: ${chatJid}\n`;
    summary += `Recent conversations: ${conversations} in the last 7 days\n`;
    summary += `Has stored memories: ${hasMemories ? 'Yes' : 'No'}`;

    return summary;
  }
}

let instance: ContextBuilder | null = null;

export function getContextBuilder(): ContextBuilder {
  if (!instance) {
    instance = new ContextBuilder();
  }
  return instance;
}
