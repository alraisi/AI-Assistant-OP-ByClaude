import type { WAMessage, WASocket, BaileysEventMap, GroupMetadata } from '@whiskeysockets/baileys';
import { isJidGroup, jidNormalizedUser } from '@whiskeysockets/baileys';
import { routeMessage, extractMessageText, detectContentType } from './message-router.js';
import { evaluateGroupEtiquette, shouldShowTyping } from '../group/etiquette.js';
import { parseMentions } from '../group/mention-parser.js';
import { getRateLimiter } from '../safety/rate-limiter.js';
import { isAllowed } from '../safety/whitelist.js';
import { sendChunkedMessage } from '../utils/message-chunker.js';
import { handleModeration, handleNewMember, handleAdminCommand } from '../handlers/group-admin.js';
import type { MessageContext } from '../llm/types.js';
import pino from 'pino';

const logger = pino({ name: 'event-handler' });

export class EventHandler {
  private sock: WASocket;
  private botJid: string;
  private rateLimiter = getRateLimiter();

  constructor(sock: WASocket, botJid: string) {
    this.sock = sock;
    this.botJid = botJid;
  }

  async handleMessagesUpsert(upsert: BaileysEventMap['messages.upsert']): Promise<void> {
    const { messages, type } = upsert;

    // Only process new messages
    if (type !== 'notify') {
      return;
    }

    for (const message of messages) {
      await this.processMessage(message);
    }
  }

  async handleGroupParticipantsUpdate(update: BaileysEventMap['group-participants.update']): Promise<void> {
    const { id, participants, action } = update;

    // Handle new members
    if (action === 'add' && participants.length > 0) {
      // participants are JID strings
      await handleNewMember(this.sock, id, participants as unknown as string[]);
    }
  }

  private async processMessage(message: WAMessage): Promise<void> {
    try {
      // Skip messages without content
      if (!message.message) {
        return;
      }

      // Skip messages from self
      const senderJid = message.key.participant || message.key.remoteJid;
      if (!senderJid || this.isSelf(senderJid)) {
        return;
      }

      // Skip status broadcasts
      if (message.key.remoteJid === 'status@broadcast') {
        return;
      }

      const chatJid = message.key.remoteJid;
      if (!chatJid) {
        return;
      }

      // Check whitelist (before rate limiter so blocked contacts don't consume entries)
      if (!isAllowed(senderJid, chatJid)) {
        logger.debug({ sender: senderJid, chat: chatJid }, 'Blocked by whitelist');
        return;
      }

      // Check rate limiting
      if (this.rateLimiter.isRateLimited(senderJid)) {
        logger.warn({ sender: senderJid }, 'Rate limited');
        return;
      }

      // Determine if group chat
      const isGroup = isJidGroup(chatJid) === true;

      // Build message context
      const context = await this.buildContext(message, chatJid, senderJid, isGroup);

      // For groups, check moderation and etiquette rules
      if (isGroup) {
        // Check moderation (spam, links, etc.)
        const messageText = extractMessageText(message) || '';
        const moderationResult = await handleModeration(this.sock, message, messageText, context);
        
        if (moderationResult) {
          if (moderationResult.shouldDelete) {
            // Send warning message
            if (moderationResult.warning) {
              await this.sock.sendMessage(chatJid, { text: moderationResult.warning });
            }
            logger.info({ sender: senderJid, chat: chatJid }, 'Message blocked by moderation');
            return;
          }
          // Just warning, continue processing
          if (moderationResult.warning) {
            await this.sock.sendMessage(chatJid, { text: moderationResult.warning });
          }
        }
        
        // Check etiquette rules
        const shouldProcess = await this.evaluateGroupMessage(message, context);
        if (!shouldProcess) {
          logger.debug({ chat: chatJid }, 'Skipping group message per etiquette');
          return;
        }
      }

      // Record message for rate limiting
      this.rateLimiter.recordMessage(senderJid);

      // Route and handle the message
      const result = await routeMessage(this.sock, message, context);

      // Send response if we have one
      if (result.response && result.success) {
        await this.sendResponse(
          chatJid,
          result.response,
          message,
          isGroup,
          result.audioBuffer
        );
      }
    } catch (error) {
      logger.error({ error, messageId: message.key.id }, 'Error processing message');
    }
  }

  private async buildContext(
    message: WAMessage,
    chatJid: string,
    senderJid: string,
    isGroup: boolean
  ): Promise<MessageContext> {
    // Get sender name
    let senderName = 'User';
    try {
      // Try to get contact name from message
      senderName = message.pushName || senderJid.split('@')[0];
    } catch {
      // Use JID as fallback
    }

    // Get group name if applicable
    let groupName: string | undefined;
    if (isGroup) {
      try {
        const groupMetadata = await this.sock.groupMetadata(chatJid);
        groupName = groupMetadata.subject;
      } catch {
        groupName = chatJid.split('@')[0];
      }
    }

    // Parse mentions and quoted message
    const mentionInfo = parseMentions(message, this.botJid);

    return {
      isGroup,
      groupName,
      senderName,
      senderJid,
      chatJid,
      quotedMessage: mentionInfo.quotedMessage,
      mentionedJids: mentionInfo.mentionedJids,
      timestamp: (message.messageTimestamp as number) * 1000 || Date.now(),
    };
  }

  private async evaluateGroupMessage(
    message: WAMessage,
    context: MessageContext
  ): Promise<boolean> {
    const contentType = detectContentType(message);

    // Always process images and voice notes in groups if they mention/reply to bot
    if (contentType === 'image' || contentType === 'audio' || contentType === 'document') {
      const mentionInfo = parseMentions(message, this.botJid);
      return mentionInfo.isBotMentioned || mentionInfo.isReplyToBot;
    }

    // For text, use etiquette rules
    const messageText = extractMessageText(message) || '';
    const decision = await evaluateGroupEtiquette(message, messageText, this.botJid, context.chatJid);

    if (decision.shouldRespond && shouldShowTyping(decision)) {
      // Show typing indicator for responses we'll make
      await this.sock.sendPresenceUpdate('composing', context.chatJid);
    }

    logger.debug({
      reason: decision.reason,
      shouldRespond: decision.shouldRespond,
      priority: decision.priority,
    }, 'Group etiquette decision');

    return decision.shouldRespond;
  }

  private async sendResponse(
    chatJid: string,
    response: string,
    originalMessage: WAMessage,
    isGroup: boolean,
    audioBuffer?: Buffer
  ): Promise<void> {
    try {
      // In groups, quote the original message
      const quoted = isGroup ? originalMessage : undefined;

      // Send voice note if we have audio
      if (audioBuffer) {
        await this.sock.sendMessage(chatJid, {
          audio: audioBuffer,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true, // Voice note (push to talk)
        }, {
          quoted,
        });
        logger.info({ chat: chatJid, isGroup, type: 'voice' }, 'Voice response sent');
      } else {
        // Send text response with chunking support
        await sendChunkedMessage(
          async (chunkText) => {
            await this.sock.sendMessage(chatJid, {
              text: chunkText,
            }, {
              quoted: isGroup ? originalMessage : undefined,
            });
          },
          response,
          { delayMs: 400 }
        );
        logger.info({ chat: chatJid, isGroup, type: 'text' }, 'Response sent');
      }
    } catch (error) {
      logger.error({ error, chat: chatJid }, 'Failed to send response');
    }
  }

  private isSelf(jid: string): boolean {
    const normalizedSender = jidNormalizedUser(jid);
    const normalizedBot = jidNormalizedUser(this.botJid);
    return normalizedSender === normalizedBot;
  }
}
