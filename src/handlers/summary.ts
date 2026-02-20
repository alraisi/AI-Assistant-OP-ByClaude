/**
 * Summary Command Handler
 * 
 * Handles /summary commands for retrieving conversation summaries.
 */

import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import type { MessageContext } from '../llm/types.js';
import type { RouteResult } from '../core/message-router.js';
import { getConversationSummarizer } from '../memory/conversation-summarizer.js';
import { isEnabled } from '../config/index.js';
import pino from 'pino';

const logger = pino({ name: 'summary-handler' });

const SUMMARY_PATTERN = /^\/summary(?:\s+(.+))?$/i;

/**
 * Handle summary commands
 * - /summary - Get latest summary for this chat
 * - /summary all - List all summaries for this chat
 */
export async function handleSummaryCommand(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  const match = text.match(SUMMARY_PATTERN);
  if (!match) {
    return null; // Not a summary command
  }

  if (!isEnabled('conversationSummaries')) {
    return {
      response: '📝 Conversation summaries are disabled. Enable with FF_CONVERSATION_SUMMARIES=true',
      success: false,
      contentType: 'text',
    };
  }

  try {
    const subCommand = match[1]?.trim().toLowerCase();
    const summarizer = getConversationSummarizer();

    // /summary all - List all summaries
    if (subCommand === 'all') {
      const summaries = await summarizer.getAllSummaries(context.chatJid);

      if (summaries.length === 0) {
        return {
          response: '📝 No conversation summaries found for this chat yet.\n\nSummaries are created automatically when conversations reach 50+ messages.',
          success: true,
          contentType: 'text',
        };
      }

      let response = `📝 *Conversation Summaries* (${summaries.length} total)\n\n`;

      for (let i = 0; i < Math.min(summaries.length, 5); i++) {
        const s = summaries[i];
        response += `*${i + 1}. ${s.date}* (${s.messageCount} messages)\n`;
        response += `${s.summary.substring(0, 100)}${s.summary.length > 100 ? '...' : ''}\n\n`;
      }

      if (summaries.length > 5) {
        response += `_...and ${summaries.length - 5} more_`;
      }

      await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });

      return {
        response: '',
        success: true,
        contentType: 'text',
      };
    }

    // /summary - Get latest summary
    const summary = await summarizer.getLatestSummary(context.chatJid);

    if (!summary) {
      return {
        response: '📝 No conversation summary available yet.\n\nSummaries are created automatically when:\n• Conversation reaches 50+ messages\n• At least 10 minutes have passed\n\nKeep chatting and I\'ll summarize it soon!',
        success: true,
        contentType: 'text',
      };
    }

    let response = `📝 *Conversation Summary - ${summary.date}*\n\n`;
    response += `${summary.summary}\n\n`;

    if (summary.keyTopics.length > 0) {
      response += `*Key Topics:*\n`;
      summary.keyTopics.forEach((topic, i) => {
        response += `${i + 1}. ${topic}\n`;
      });
      response += '\n';
    }

    if (summary.importantDecisions.length > 0) {
      response += `*Important Decisions:*\n`;
      summary.importantDecisions.forEach((decision, i) => {
        response += `• ${decision}\n`;
      });
    }

    response += `\n_${summary.messageCount} messages summarized_`;

    await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });

    logger.info({
      chat: context.chatJid,
      date: summary.date,
      messageCount: summary.messageCount,
    }, 'Summary retrieved');

    return {
      response: '',
      success: true,
      contentType: 'text',
    };

  } catch (error) {
    logger.error({ error, chat: context.chatJid }, 'Failed to handle summary command');
    return {
      response: 'Sorry, I had trouble retrieving the summary. Please try again.',
      success: false,
      contentType: 'text',
    };
  }
}
