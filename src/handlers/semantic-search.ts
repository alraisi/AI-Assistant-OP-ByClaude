/**
 * Semantic Search Handler
 * Allows users to search memories by meaning
 */

import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import type { MessageContext } from '../llm/types.js';
import type { RouteResult } from '../core/message-router.js';
import { isEnabled } from '../config/index.js';
import { getSemanticMemory } from '../memory/semantic.js';
import pino from 'pino';

const logger = pino({ name: 'semantic-search-handler' });

// Search patterns
const SEARCH_PATTERNS = [
  /\b(?:search|find|look\s+for)\s+(?:in\s+)?memories?\s*:?\s*(.+)/i,
  /\bwhat\s+(?:did|was|do)\s+(?:we|i|you)\s+(?:talk|discuss|say)\s+(?:about\s+)?(.+)/i,
  /\bremember\s+(?:when|what)\s+(.+)/i,
  /\bdo\s+you\s+remember\s+(.+)/i,
];

const STATS_PATTERN = /^\/(?:semantic|vector)\s+stats$/i;
const INDEX_PATTERN = /^\/(?:semantic|vector)\s+(?:index|reindex)$/i;

/**
 * Handle semantic memory search
 */
export async function handleSemanticSearch(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  if (!isEnabled('semanticMemory')) {
    return null;
  }

  // Check for stats command
  if (STATS_PATTERN.test(text)) {
    return handleStats(sock, context);
  }

  // Check for index command
  if (INDEX_PATTERN.test(text)) {
    return handleIndex(sock, context);
  }

  // Check for search patterns
  let query: string | null = null;
  
  for (const pattern of SEARCH_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      query = match[1].trim();
      break;
    }
  }

  if (!query) {
    return null;
  }

  try {
    logger.info({ query, chat: context.chatJid }, 'Semantic search requested');

    const semanticMemory = getSemanticMemory();
    
    // Initialize if needed
    await semanticMemory.initialize();

    const results = await semanticMemory.search(query, {
      topK: 5,
      threshold: 0.6,
    });

    if (results.length === 0) {
      return {
        response: `🔍 I couldn't find any memories related to "${query}".\n\nTry searching with different keywords, or I may not have indexed those memories yet.`,
        success: true,
        contentType: 'text',
      };
    }

    let response = `🔍 *Memories about "${query}"*\n\n`;
    
    results.forEach((result, index) => {
      const confidence = result.score >= 0.8 ? '🟢' : result.score >= 0.7 ? '🟡' : '🟠';
      response += `${index + 1}. ${confidence} ${result.text.slice(0, 150)}${result.text.length > 150 ? '...' : ''}\n`;
      response += `   _Source: ${result.source} · Match: ${Math.round(result.score * 100)}%_\n\n`;
    });

    response += `_Searched ${semanticMemory.getStats().totalEntries} memories_`;

    return {
      response,
      success: true,
      contentType: 'text',
    };

  } catch (error) {
    logger.error({ error, query }, 'Semantic search failed');
    return {
      response: "Sorry, I had trouble searching your memories. Please try again.",
      success: false,
      contentType: 'text',
    };
  }
}

/**
 * Handle stats command
 */
async function handleStats(
  sock: WASocket,
  context: MessageContext
): Promise<RouteResult> {
  try {
    const semanticMemory = getSemanticMemory();
    await semanticMemory.initialize();
    
    const stats = semanticMemory.getStats();

    return {
      response: `📊 *Semantic Memory Stats*\n\n` +
               `Total indexed memories: ${stats.totalEntries}\n` +
               `Last updated: ${stats.lastUpdated.toLocaleString()}`,
      success: true,
      contentType: 'text',
    };
  } catch (error) {
    return {
      response: "Couldn't retrieve stats.",
      success: false,
      contentType: 'text',
    };
  }
}

/**
 * Handle index command
 */
async function handleIndex(
  sock: WASocket,
  context: MessageContext
): Promise<RouteResult> {
  try {
    const semanticMemory = getSemanticMemory();
    await semanticMemory.initialize();
    
    // Start indexing in background
    semanticMemory.indexExistingMemories().then(() => {
      logger.info('Background indexing completed');
    });

    return {
      response: `🔄 *Indexing Memories*\n\n` +
               `I'm indexing your existing memories for semantic search. ` +
               `This may take a minute depending on how much history you have.\n\n` +
               `Current entries: ${semanticMemory.getStats().totalEntries}`,
      success: true,
      contentType: 'text',
    };
  } catch (error) {
    return {
      response: "Couldn't start indexing.",
      success: false,
      contentType: 'text',
    };
  }
}
