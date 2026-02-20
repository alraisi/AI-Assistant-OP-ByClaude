/**
 * Auto Memory Extraction
 * 
 * Automatically extracts important facts from conversations
 * and stores them in long-term memory.
 */

import { getChatProvider } from '../llm/index.js';
import { getLongTermMemory, type MemoryCategory } from './long-term.js';
import { isEnabled } from '../config/index.js';
import pino from 'pino';

const logger = pino({ name: 'auto-memory-extraction' });

export interface ExtractedMemory {
  content: string;
  category: MemoryCategory;
  subject: string;
  importance: 'low' | 'medium' | 'high';
  reason: string;
}

export interface ExtractionContext {
  userMessage: string;
  assistantResponse: string;
  senderJid: string;
  senderName: string;
  chatJid: string;
  isGroup: boolean;
}

const EXTRACTION_PROMPT = `You are an AI assistant that extracts important facts from conversations for long-term memory storage.

Analyze the conversation below and extract any important facts, preferences, relationships, events, or projects that should be remembered for future conversations.

Only extract information that is:
- Factually stated (not speculation)
- Likely to be relevant in future conversations
- About the user, their preferences, relationships, or ongoing matters

Do NOT extract:
- Casual greetings or small talk
- Temporary information (weather, time-sensitive news)
- Questions without answers
- General knowledge

Respond in JSON format:
{
  "memories": [
    {
      "content": "Clear, concise statement of the fact",
      "category": "fact|preference|project|relationship|event|other",
      "subject": "Who/what this is about (e.g., user's name, specific person, project name)",
      "importance": "low|medium|high",
      "reason": "Why this is worth remembering"
    }
  ]
}

If no memories should be extracted, return {"memories": []}.

Maximum 3 memories per conversation. Be selective.`;

export class AutoMemoryExtractor {
  private extractionCache: Map<string, number> = new Map();
  private readonly CACHE_DURATION_MS = 60000; // 1 minute
  private readonly MIN_MESSAGE_LENGTH = 20;

  /**
   * Extract memories from a conversation
   */
  async extractMemories(context: ExtractionContext): Promise<ExtractedMemory[]> {
    if (!isEnabled('autoMemoryExtraction')) {
      return [];
    }

    // Skip short messages
    if (context.userMessage.length < this.MIN_MESSAGE_LENGTH) {
      return [];
    }

    // Skip if we recently extracted from this chat
    const cacheKey = context.chatJid;
    const lastExtraction = this.extractionCache.get(cacheKey);
    if (lastExtraction && Date.now() - lastExtraction < this.CACHE_DURATION_MS) {
      return [];
    }

    // Set cache immediately to prevent concurrent calls from bypassing cooldown
    this.extractionCache.set(cacheKey, Date.now());

    try {
      const chatProvider = getChatProvider();

      const extractionMessage = `${EXTRACTION_PROMPT}

Conversation:
User (${context.senderName}): ${context.userMessage}
Assistant: ${context.assistantResponse}

Extract memories in JSON format:`;

      const response = await chatProvider.chat({
        systemPrompt: 'You are a memory extraction assistant. Always respond with valid JSON.',
        messages: [{ role: 'user', content: extractionMessage }],
        maxTokens: 800,
      });

      const extracted = this.parseExtractionResponse(response.content);

      if (extracted.length > 0) {
        logger.info(
          { count: extracted.length, chat: context.chatJid },
          'Extracted memories from conversation'
        );
      } else {
        // No memories extracted — allow retry sooner
        this.extractionCache.delete(cacheKey);
      }

      return extracted;
    } catch (error) {
      // On error, allow retry
      this.extractionCache.delete(cacheKey);
      logger.error({ error }, 'Failed to extract memories');
      return [];
    }
  }

  /**
   * Store extracted memories to long-term storage
   */
  async storeMemories(
    memories: ExtractedMemory[],
    context: ExtractionContext
  ): Promise<void> {
    if (memories.length === 0) return;

    const longTermMemory = getLongTermMemory();
    const relatedJids = [context.senderJid];

    for (const memory of memories) {
      try {
        await longTermMemory.addMemory({
          category: memory.category,
          subject: memory.subject,
          content: memory.content,
          relatedJids,
          importance: memory.importance,
        });

        logger.debug(
          { subject: memory.subject, category: memory.category },
          'Stored auto-extracted memory'
        );
      } catch (error) {
        logger.error({ error, memory }, 'Failed to store memory');
      }
    }

    logger.info(
      { count: memories.length, sender: context.senderName },
      'Stored auto-extracted memories'
    );
  }

  /**
   * Parse the LLM extraction response
   */
  private parseExtractionResponse(content: string): ExtractedMemory[] {
    try {
      // Clean up response - remove markdown code blocks if present
      let cleaned = content.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleaned);

      if (!parsed.memories || !Array.isArray(parsed.memories)) {
        return [];
      }

      // Validate and filter memories
      return parsed.memories
        .filter((m: ExtractedMemory) => {
          return (
            m.content &&
            m.content.length > 5 &&
            m.category &&
            m.subject &&
            m.importance
          );
        })
        .slice(0, 3); // Max 3 memories
    } catch (error) {
      logger.warn({ error, content }, 'Failed to parse extraction response');
      return [];
    }
  }

  /**
   * Process a conversation and extract/store memories
   */
  async processConversation(context: ExtractionContext): Promise<void> {
    const memories = await this.extractMemories(context);
    if (memories.length > 0) {
      await this.storeMemories(memories, context);
    }
  }
}

let instance: AutoMemoryExtractor | null = null;

export function getAutoMemoryExtractor(): AutoMemoryExtractor {
  if (!instance) {
    instance = new AutoMemoryExtractor();
  }
  return instance;
}
