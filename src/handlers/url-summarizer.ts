/**
 * URL Summarizer Handler
 * Detects URLs in messages and provides AI-generated summaries
 */

import type { WASocket } from '@whiskeysockets/baileys';
import type { MessageContext } from '../llm/types.js';
import type { RouteResult } from '../core/message-router.js';
import { isEnabled } from '../config/index.js';
import { extractUrl, fetchUrlContent, formatUrlContent, type UrlContent } from '../tools/url-fetcher.js';
import { getChatProvider } from '../llm/index.js';
import pino from 'pino';

const logger = pino({ name: 'url-summarizer' });

// Regex to detect summarization intent
const SUMMARIZE_INTENT_PATTERNS = [
  /\b(summarize|summary|tl;dr|tldr|give me the gist of|what does this (article|page|link) say about|explain this (article|link|url))\b/i,
  /^\s*(https?:\/\/)/i, // URL at the start suggests they want it processed
];

/**
 * Check if text indicates intent to summarize URL
 */
function hasSummarizeIntent(text: string): boolean {
  for (const pattern of SUMMARIZE_INTENT_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Generate AI summary of URL content
 */
async function generateSummary(content: UrlContent): Promise<string> {
  const chatProvider = getChatProvider();
  
  const systemPrompt = `You are a helpful assistant that summarizes web articles and pages. 
Provide a clear, concise summary that captures the main points.

Guidelines:
- Start with a one-sentence overview
- Use bullet points for key takeaways (max 5)
- Keep it brief but informative
- Use emojis where appropriate
- Mention the source site

Format your response for WhatsApp (concise, well-spaced).`;

  const prompt = `Please summarize this article/page:

Title: ${content.title}
Site: ${content.siteName || 'Unknown'}
Author: ${content.author || 'Unknown'}
Description: ${content.description}

Content:
${content.content.substring(0, 3000)}

${content.content.length > 3000 ? '...(content truncated)' : ''}

Provide a brief summary with key takeaways.`;

  const response = await chatProvider.chat({
    systemPrompt,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 800,
  });

  return response.content;
}

/**
 * Handle URL summarization requests
 * Returns null if:
 * - Feature is disabled
 * - No URL found
 * - Not a summarization intent (unless standalone URL)
 * - Fetch/summary fails
 */
export async function handleUrlSummarization(
  sock: WASocket,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('urlSummarization')) {
    return null;
  }
  
  // Extract URL from message
  const url = extractUrl(text);
  if (!url) {
    return null;
  }
  
  // Check if it's a summarization intent or just a standalone URL
  const isStandaloneUrl = text.trim() === url;
  const hasIntent = hasSummarizeIntent(text);
  
  // If it's just a URL without summarization intent, don't handle it
  // (let normal text handler deal with it, or user can explicitly ask for summary)
  if (!isStandaloneUrl && !hasIntent) {
    logger.debug({ url }, 'URL found but no summarization intent');
    return null;
  }
  
  try {
    logger.info({ url, context: context.chatJid }, 'Processing URL summarization');
    
    // Show typing indicator
    await sock.sendPresenceUpdate('composing', context.chatJid);
    
    // Fetch URL content
    const content = await fetchUrlContent(url);
    
    if (!content) {
      logger.warn({ url }, 'Failed to fetch URL content');
      await sock.sendPresenceUpdate('paused', context.chatJid);
      
      // Always return a response when there's clear intent to summarize
      // Don't fall through to text handler
      return {
        response: "📄 I couldn't access that link to summarize it.\n\nPossible reasons:\n• The site blocks bots\n• Requires login\n• Network issue\n\nTry sharing the text directly, or give me a different link!",
        success: true,
        contentType: 'text',
      };
    }
    
    // Check if content is substantial enough to summarize
    if (content.content.length < 100 && !content.description) {
      logger.debug({ url }, 'Content too short to summarize');
      await sock.sendPresenceUpdate('paused', context.chatJid);
      
      // Return formatted content anyway
      return {
        response: formatUrlContent(content),
        success: true,
        contentType: 'text',
      };
    }
    
    // Generate AI summary
    const summary = await generateSummary(content);
    
    await sock.sendPresenceUpdate('paused', context.chatJid);
    
    logger.info({ url, summaryLength: summary.length }, 'URL summarized successfully');
    
    return {
      response: `*${content.title}*\n\n${summary}\n\n🔗 ${url}`,
      success: true,
      contentType: 'text',
    };
    
  } catch (error) {
    logger.error({ error, url }, 'Error summarizing URL');
    
    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});
    
    // Graceful fallback
    return {
      response: "I had trouble summarizing that link. You can try accessing it directly.",
      success: true,
      contentType: 'text',
    };
  }
}

/**
 * Quick URL preview (without full AI summarization)
 * Useful for giving immediate feedback while fetching
 */
export async function generateUrlPreview(url: string): Promise<string | null> {
  try {
    const content = await fetchUrlContent(url, { maxLength: 1000 });
    if (!content) return null;
    
    return formatUrlContent(content);
  } catch {
    return null;
  }
}
