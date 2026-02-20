import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { getContentType } from '@whiskeysockets/baileys';
import { handleTextMessage } from '../handlers/text.js';
import { handleVoiceMessage } from '../handlers/voice.js';
import { handleImageMessage } from '../handlers/image.js';
import { handleDocumentMessage } from '../handlers/document.js';
import {
  detectGenerationType,
  handleImageGeneration,
  handleDocumentGeneration,
} from '../handlers/generate.js';
import { detectSearchIntent, handleSearchMessage, isSearchEnabled } from '../handlers/search.js';
import { handleUrlSummarization } from '../handlers/url-summarizer.js';
import { handleStickerMessage, handleStickerCommand } from '../handlers/sticker.js';
import { handlePollCreation, handlePollVote, handlePollStatus, handlePollEnd } from '../handlers/poll.js';
import { handleReminderCreation, handleListReminders, handleCancelReminder, handleSnoozeReminder, handleReminderDone, handleTestReminder } from '../handlers/reminder.js';
import { handleSemanticSearch } from '../handlers/semantic-search.js';
import { handleSummaryCommand } from '../handlers/summary.js';
import { handleVideoMessage } from '../handlers/video.js';
import { handleCodeExecution } from '../handlers/code-execution.js';
import { handleCalendarCommand } from '../handlers/calendar.js';
import { handleAdminCommand } from '../handlers/group-admin.js';
import { handleGroupKB } from '../handlers/group-kb.js';
import { classifyIntent, type IntentType } from './intent-classifier.js';
import { isEnabled } from '../config/index.js';
import type { MessageContext } from '../llm/types.js';
import pino from 'pino';

const logger = pino({ name: 'message-router' });

export type ContentType = 'text' | 'image' | 'audio' | 'video' | 'sticker' | 'document' | 'unknown';

export interface RouteResult {
  response: string;
  success: boolean;
  contentType: ContentType;
  error?: string;
  audioBuffer?: Buffer;
  respondWithVoice?: boolean;
}

export function detectContentType(message: WAMessage): ContentType {
  const content = message.message;
  if (!content) return 'unknown';

  const type = getContentType(content);

  if (type === 'conversation' || type === 'extendedTextMessage') {
    return 'text';
  }

  if (type === 'imageMessage') {
    return 'image';
  }

  if (type === 'audioMessage') {
    return 'audio';
  }

  if (type === 'videoMessage') {
    return 'video';
  }

  if (type === 'stickerMessage') {
    return 'sticker';
  }

  if (type === 'documentMessage' || type === 'documentWithCaptionMessage') {
    return 'document';
  }

  return 'unknown';
}

export function extractMessageText(message: WAMessage): string | null {
  const content = message.message;
  if (!content) return null;

  // Direct conversation
  if (content.conversation) {
    return content.conversation;
  }

  // Extended text message
  if (content.extendedTextMessage?.text) {
    return content.extendedTextMessage.text;
  }

  // Image with caption
  if (content.imageMessage?.caption) {
    return content.imageMessage.caption;
  }

  // Video with caption
  if (content.videoMessage?.caption) {
    return content.videoMessage.caption;
  }

  return null;
}

export async function routeMessage(
  sock: WASocket,
  message: WAMessage,
  context: MessageContext
): Promise<RouteResult> {
  const contentType = detectContentType(message);

  logger.info({
    contentType,
    chat: context.chatJid,
    sender: context.senderName,
  }, 'Routing message');

  switch (contentType) {
    case 'text': {
      const text = extractMessageText(message);
      if (!text) {
        return {
          response: '',
          success: false,
          contentType,
          error: 'No text content found',
        };
      }

      // Classify intent (for logging and future smart routing)
      let detectedIntent: IntentType = 'unknown';
      if (isEnabled('intentClassification')) {
        try {
          const intentResult = await classifyIntent(text);
          detectedIntent = intentResult.intent;
          logger.debug(
            { intent: detectedIntent, confidence: intentResult.confidence },
            'Intent classified'
          );
        } catch (error) {
          logger.warn({ error }, 'Intent classification failed');
        }
      }

      // Check if this is a generation request
      const generationType = detectGenerationType(text);

      if (generationType === 'image') {
        const genResult = await handleImageGeneration(sock, text, context);
        return {
          response: '',
          success: genResult.success,
          contentType,
          error: genResult.error,
        };
      }

      if (generationType === 'document') {
        const genResult = await handleDocumentGeneration(sock, text, context);
        return {
          response: '',
          success: genResult.success,
          contentType,
          error: genResult.error,
        };
      }

      // Check for URL summarization
      const urlResult = await handleUrlSummarization(sock, text, context);
      if (urlResult) {
        return { ...urlResult, contentType };
      }

      // Check for search intent
      if (isSearchEnabled()) {
        const searchIntent = detectSearchIntent(text);
        if (searchIntent.detected) {
          const searchResult = await handleSearchMessage(sock, text, searchIntent.query, context);
          return { ...searchResult, contentType };
        }
      }

      // Check for poll commands
      const pollVoteResult = await handlePollVote(sock, message, text, context);
      if (pollVoteResult) {
        return { ...pollVoteResult, contentType };
      }

      const pollStatusResult = await handlePollStatus(sock, message, text, context);
      if (pollStatusResult) {
        return { ...pollStatusResult, contentType };
      }

      const pollEndResult = await handlePollEnd(sock, message, text, context);
      if (pollEndResult) {
        return { ...pollEndResult, contentType };
      }

      const pollCreateResult = await handlePollCreation(sock, message, text, context);
      if (pollCreateResult) {
        return { ...pollCreateResult, contentType };
      }

      // Check for reminder commands
      const reminderSnoozeResult = await handleSnoozeReminder(sock, message, text, context);
      if (reminderSnoozeResult) {
        return { ...reminderSnoozeResult, contentType };
      }

      const reminderDoneResult = await handleReminderDone(sock, message, text, context);
      if (reminderDoneResult) {
        return { ...reminderDoneResult, contentType };
      }

      const reminderCancelResult = await handleCancelReminder(sock, message, text, context);
      if (reminderCancelResult) {
        return { ...reminderCancelResult, contentType };
      }

      const reminderListResult = await handleListReminders(sock, message, text, context);
      if (reminderListResult) {
        return { ...reminderListResult, contentType };
      }

      const reminderTestResult = await handleTestReminder(sock, message, text, context);
      if (reminderTestResult) {
        return { ...reminderTestResult, contentType };
      }

      const reminderCreateResult = await handleReminderCreation(sock, message, text, context);
      if (reminderCreateResult) {
        return { ...reminderCreateResult, contentType };
      }

      // Check for semantic memory search
      const semanticSearchResult = await handleSemanticSearch(sock, message, text, context);
      if (semanticSearchResult) {
        return { ...semanticSearchResult, contentType };
      }

      // Check for summary command
      const summaryResult = await handleSummaryCommand(sock, message, text, context);
      if (summaryResult) {
        return { ...summaryResult, contentType };
      }

      // Check for code execution
      const codeResult = await handleCodeExecution(sock, message, text, context);
      if (codeResult) {
        return { ...codeResult, contentType };
      }

      // Check for calendar commands
      const calendarResult = await handleCalendarCommand(sock, message, text, context);
      if (calendarResult) {
        return { ...calendarResult, contentType };
      }

      // Check for admin commands
      const adminResult = await handleAdminCommand(sock, message, text, context);
      if (adminResult) {
        return { ...adminResult, contentType };
      }

      // Check for group knowledge base
      const kbResult = await handleGroupKB(sock, message, text, context);
      if (kbResult) {
        return { ...kbResult, contentType };
      }

      // Check for sticker command (reply to image)
      const stickerCmdResult = await handleStickerCommand(sock, message, text, context);
      if (stickerCmdResult) {
        return { ...stickerCmdResult, contentType };
      }

      // Normal text handling
      const result = await handleTextMessage(sock, message, text, context);
      return { ...result, contentType };
    }

    case 'image': {
      // Check for sticker creation
      const stickerResult = await handleStickerMessage(sock, message, context);
      if (stickerResult) {
        return { ...stickerResult, contentType };
      }

      const result = await handleImageMessage(sock, message, context);
      return { ...result, contentType };
    }

    case 'audio': {
      const result = await handleVoiceMessage(sock, message, context);
      return { ...result, contentType };
    }

    case 'video': {
      const videoResult = await handleVideoMessage(sock, message, context);
      return { ...videoResult, contentType };
    }

    case 'sticker':
      return {
        response: '',
        success: true,
        contentType,
        error: 'Stickers are not processed',
      };

    case 'document': {
      const docResult = await handleDocumentMessage(sock, message, context);
      return { ...docResult, contentType };
    }

    default:
      logger.warn({ contentType }, 'Unknown content type');
      return {
        response: '',
        success: false,
        contentType: 'unknown',
        error: 'Unknown content type',
      };
  }
}
