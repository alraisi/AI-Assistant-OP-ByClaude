import type { WASocket } from '@whiskeysockets/baileys';
import { getChatProvider, type Message, type MessageContext } from '../llm/index.js';
import { getMemoryOrchestrator } from '../memory/index.js';
import { loadPersona, buildDMSystemPrompt, buildGroupSystemPrompt } from '../../persona/loader.js';
import { getSearchProvider, isSearchEnabled } from '../tools/web-search.js';
import { sanitizeForLogging } from '../safety/privacy.js';
import { getPersonaConfig } from '../setup/index.js';
import pino from 'pino';

const logger = pino({ name: 'search-handler' });

const SEARCH_PATTERNS = [
  /^search\s+(?:for\s+)?(.+)/i,
  /^look\s+up\s+(.+)/i,
  /^google\s+(.+)/i,
  /^find\s+(?:info|information)\s+(?:about|on)\s+(.+)/i,
  /^what\s+(?:is|are)\s+the\s+latest\s+(.+)/i,
  /^what'?s\s+(?:the\s+)?latest\s+(?:on|about|with)\s+(.+)/i,
];

export interface SearchIntent {
  detected: boolean;
  query: string;
}

export function detectSearchIntent(text: string): SearchIntent {
  const trimmed = text.trim();

  for (const pattern of SEARCH_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return { detected: true, query: match[1].trim() };
    }
  }

  return { detected: false, query: '' };
}

export { isSearchEnabled };

export async function handleSearchMessage(
  sock: WASocket,
  text: string,
  searchQuery: string,
  context: MessageContext
): Promise<{ response: string; success: boolean; error?: string }> {
  const chatProvider = getChatProvider();
  const memory = getMemoryOrchestrator();
  const searchProvider = getSearchProvider();

  if (!searchProvider) {
    return { response: '', success: false, error: 'Search not available' };
  }

  try {
    await sock.sendPresenceUpdate('composing', context.chatJid);

    // Run web search
    const results = await searchProvider.searchWeb(searchQuery, 5);

    if (results.length === 0) {
      return {
        response: `I couldn't find any results for "${searchQuery}". Try rephrasing your query.`,
        success: true,
      };
    }

    const searchContext = searchProvider.formatSearchResultsForContext(results);

    // Load persona and memory for natural response
    const persona = await loadPersona();
    const memoryContext = await memory.getContext({
      chatJid: context.chatJid,
      senderJid: context.senderJid,
      senderName: context.senderName,
      isGroup: context.isGroup,
      groupName: context.groupName,
    });

    const personaConfig = getPersonaConfig();
    let systemPrompt: string;
    if (context.isGroup && context.groupName) {
      systemPrompt = buildGroupSystemPrompt(persona, context.groupName, memoryContext.systemContext, personaConfig);
    } else {
      systemPrompt = buildDMSystemPrompt(persona, context.senderName, memoryContext.systemContext, personaConfig);
    }

    systemPrompt += `\n\nYou have access to web search results. Use them to answer the user's question accurately and naturally. Cite sources when relevant (e.g., "According to [Source Name]..."). If the search results don't fully answer the question, say so.`;
    systemPrompt += searchContext;

    // Build messages array with conversation history
    const messages: Message[] = [];
    if (memoryContext.recentMessages.length > 0) {
      messages.push(...memoryContext.recentMessages);
    }
    messages.push({ role: 'user', content: text });

    const response = await chatProvider.chat({
      systemPrompt,
      messages,
      maxTokens: 1024,
    });

    await sock.sendPresenceUpdate('paused', context.chatJid);

    // Log to memory
    await memory.logConversation({
      timestamp: new Date(),
      chatJid: context.chatJid,
      chatName: context.groupName || context.senderName,
      senderJid: context.senderJid,
      senderName: context.senderName,
      userMessage: sanitizeForLogging(text),
      buddyResponse: response.content,
      isGroup: context.isGroup,
    });

    logger.info({
      query: searchQuery,
      resultsCount: results.length,
      sender: context.senderName,
    }, 'Search message handled');

    return { response: response.content, success: true };
  } catch (error) {
    logger.error({ error }, 'Failed to handle search message');
    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});

    return {
      response: "Sorry, I had trouble searching for that. Please try again.",
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
