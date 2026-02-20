/**
 * Conversation Summarizer
 * 
 * Periodically summarizes long conversations and stores
 * condensed versions for better context management.
 */

import { getChatProvider } from '../llm/index.js';
import { getStorage, MemoryStorage } from './storage.js';
import { isEnabled } from '../config/index.js';
import { sanitizeJid } from '../utils/sanitize.js';
import pino from 'pino';
import { createHash } from 'crypto';

const logger = pino({ name: 'conversation-summarizer' });

export interface ConversationSummary {
  id: string;
  chatJid: string;
  date: string;
  messageCount: number;
  summary: string;
  keyTopics: string[];
  importantDecisions: string[];
  timestamp: Date;
}

export class ConversationSummarizer {
  private storage: MemoryStorage;
  private readonly SUMMARIES_DIR = 'summaries';
  private readonly SUMMARY_THRESHOLD = 50; // Messages before summarizing
  private readonly MIN_MESSAGES = 10;

  constructor(storage?: MemoryStorage) {
    this.storage = storage || getStorage();
  }

  /**
   * Analyze a chat's daily notes and create summary if needed
   */
  async analyzeAndSummarize(chatJid: string, dailyContent: string): Promise<ConversationSummary | null> {
    if (!isEnabled('conversationSummaries')) {
      return null;
    }

    try {
      // Check if we already have a recent summary for this chat
      const existingSummary = await this.getLatestSummary(chatJid);
      if (existingSummary) {
        const hoursSinceSummary = (Date.now() - existingSummary.timestamp.getTime()) / (1000 * 60 * 60);
        if (hoursSinceSummary < 24) {
          return null; // Don't summarize more than once per day
        }
      }

      // Parse messages from daily content
      const messages = this.parseMessages(dailyContent);
      
      if (messages.length < this.MIN_MESSAGES) {
        return null; // Not enough messages to summarize
      }

      // Generate summary
      const summary = await this.generateSummary(messages, chatJid);
      
      if (summary) {
        await this.saveSummary(summary);
        logger.info(
          { chat: chatJid, messages: messages.length },
          'Created conversation summary'
        );
      }

      return summary;
    } catch (error) {
      logger.error({ error, chat: chatJid }, 'Failed to analyze conversation');
      return null;
    }
  }

  /**
   * Parse messages from daily notes content
   */
  private parseMessages(content: string): Array<{ sender: string; message: string; time?: string }> {
    const messages: Array<{ sender: string; message: string; time?: string }> = [];
    
    // Match patterns like:
    // **[Time] Sender:** Message
    // **Sender:** Message
    const lines = content.split('\n');
    
    for (const line of lines) {
      // Pattern: **[HH:MM] Name**: message
      const timePattern = /^\*\*\[(\d{2}:\d{2})\]\s*(.+?)\*\*:\s*(.+)$/;
      // Pattern: **Name**: message
      const simplePattern = /^\*\*(.+?)\*\*:\s*(.+)$/;
      
      let match = line.match(timePattern);
      if (match) {
        messages.push({
          time: match[1],
          sender: match[2].trim(),
          message: match[3].trim(),
        });
        continue;
      }
      
      match = line.match(simplePattern);
      if (match) {
        messages.push({
          sender: match[1].trim(),
          message: match[2].trim(),
        });
      }
    }
    
    return messages;
  }

  /**
   * Generate a summary using LLM
   */
  private async generateSummary(
    messages: Array<{ sender: string; message: string; time?: string }>,
    chatJid: string
  ): Promise<ConversationSummary | null> {
    try {
      const chatProvider = getChatProvider();

      // Build conversation text
      const conversationText = messages
        .map((m) => `${m.sender}: ${m.message}`)
        .join('\n');

      const prompt = `Summarize the following conversation concisely.

Focus on:
1. Main topics discussed
2. Important decisions or conclusions
3. Key information shared
4. Action items (if any)

Conversation:
${conversationText}

Provide your summary in this JSON format:
{
  "summary": "2-3 sentence overview of the conversation",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "importantDecisions": ["decision1", "decision2"],
  "messageCount": ${messages.length}
}

Keep the summary concise but informative.`;

      const response = await chatProvider.chat({
        systemPrompt: 'You are a conversation summarization assistant. Always respond with valid JSON.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 600,
      });

      const parsed = this.parseSummaryResponse(response.content);
      
      if (!parsed || !parsed.summary) {
        return null;
      }

      const date = new Date().toISOString().split('T')[0];
      const id = this.generateSummaryId(chatJid, date);

      return {
        id,
        chatJid,
        date,
        messageCount: messages.length,
        summary: parsed.summary,
        keyTopics: parsed.keyTopics || [],
        importantDecisions: parsed.importantDecisions || [],
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to generate summary');
      return null;
    }
  }

  /**
   * Parse the LLM summary response
   */
  private parseSummaryResponse(content: string): { summary: string; keyTopics: string[]; importantDecisions: string[] } | null {
    try {
      // Clean up response
      let cleaned = content.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleaned);

      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
      if (!summary || summary.length < 10 || summary.length > 5000) {
        logger.warn({ summaryLength: summary.length }, 'Summary failed validation');
        return null;
      }

      return {
        summary,
        keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics.slice(0, 20) : [],
        importantDecisions: Array.isArray(parsed.importantDecisions) ? parsed.importantDecisions.slice(0, 20) : [],
      };
    } catch (error) {
      logger.warn({ error, content }, 'Failed to parse summary response');
      return null;
    }
  }

  /**
   * Save summary to storage
   */
  private async saveSummary(summary: ConversationSummary): Promise<void> {
    const sanitizedChatId = sanitizeJid(summary.chatJid);
    const filename = `${this.SUMMARIES_DIR}/${sanitizedChatId}_${summary.date}.json`;

    // Ensure directory exists
    await this.storage.ensureDir(this.SUMMARIES_DIR);

    await this.storage.writeJson(filename, {
      ...summary,
      timestamp: summary.timestamp.toISOString(),
    });
  }

  /**
   * Get the latest summary for a chat
   */
  async getLatestSummary(chatJid: string): Promise<ConversationSummary | null> {
    try {
      const sanitizedChatId = sanitizeJid(chatJid);
      const pattern = new RegExp(`^${sanitizedChatId}_(\\d{4}-\\d{2}-\\d{2})\\.json$`);
      
      // List all files in summaries directory
      const files = await this.storage.listFiles(this.SUMMARIES_DIR);
      
      const summaries: Array<{ file: string; date: string; timestamp: number }> = [];
      
      for (const file of files) {
        const match = file.match(pattern);
        if (match) {
          const stats = await this.storage.getStats(`${this.SUMMARIES_DIR}/${file}`);
          summaries.push({
            file,
            date: match[1],
            timestamp: stats.mtime.getTime(),
          });
        }
      }

      if (summaries.length === 0) {
        return null;
      }

      // Sort by timestamp (newest first)
      summaries.sort((a, b) => b.timestamp - a.timestamp);
      
      // Load and return the latest
      const latestFile = `${this.SUMMARIES_DIR}/${summaries[0].file}`;
      const data = await this.storage.readJson<ConversationSummary>(latestFile);
      
      if (!data) return null;
      
      return {
        ...data,
        timestamp: new Date(data.timestamp),
      };
    } catch (error) {
      logger.error({ error, chat: chatJid }, 'Failed to get latest summary');
      return null;
    }
  }

  /**
   * Get all summaries for a chat
   */
  async getAllSummaries(chatJid: string): Promise<ConversationSummary[]> {
    try {
      const sanitizedChatId = sanitizeJid(chatJid);
      const pattern = new RegExp(`^${sanitizedChatId}_(\\d{4}-\\d{2}-\\d{2})\\.json$`);
      
      const files = await this.storage.listFiles(this.SUMMARIES_DIR);
      const summaries: ConversationSummary[] = [];

      for (const file of files) {
        if (pattern.test(file)) {
          const data = await this.storage.readJson<ConversationSummary>(`${this.SUMMARIES_DIR}/${file}`);
          if (data) {
            summaries.push({
              ...data,
              timestamp: new Date(data.timestamp),
            });
          }
        }
      }

      // Sort by date (newest first)
      summaries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      return summaries;
    } catch (error) {
      logger.error({ error, chat: chatJid }, 'Failed to get all summaries');
      return [];
    }
  }

  /**
   * Generate a unique ID for a summary
   */
  private generateSummaryId(chatJid: string, date: string): string {
    const hash = createHash('md5').update(`${chatJid}_${date}_${Date.now()}`).digest('hex');
    return `sum_${hash.substring(0, 12)}`;
  }

  /**
   * Get summary as formatted text for context building
   */
  async getSummaryForContext(chatJid: string): Promise<string | null> {
    const summary = await this.getLatestSummary(chatJid);
    if (!summary) {
      return null;
    }

    let context = `## Previous Conversation Summary (${summary.date})\n\n`;
    context += `${summary.summary}\n\n`;

    if (summary.keyTopics.length > 0) {
      context += `**Topics:** ${summary.keyTopics.join(', ')}\n`;
    }

    if (summary.importantDecisions.length > 0) {
      context += `**Decisions:**\n`;
      for (const decision of summary.importantDecisions) {
        context += `- ${decision}\n`;
      }
    }

    return context;
  }
}

let instance: ConversationSummarizer | null = null;

export function getConversationSummarizer(): ConversationSummarizer {
  if (!instance) {
    instance = new ConversationSummarizer();
  }
  return instance;
}
