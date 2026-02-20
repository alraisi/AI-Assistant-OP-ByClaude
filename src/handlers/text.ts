import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { getChatProvider, getTTSProvider, type Message, type MessageContext } from '../llm/index.js';
import { getMemoryOrchestrator } from '../memory/index.js';
import { getAutoMemoryExtractor } from '../memory/auto-extract.js';
import { loadPersona, buildDMSystemPrompt, buildGroupSystemPrompt } from '../../persona/loader.js';
import { getConfig } from '../config/index.js';
import { sanitizeForLogging } from '../safety/privacy.js';
import { getPersonaConfig } from '../setup/index.js';
import pino from 'pino';

const logger = pino({ name: 'text-handler' });

export interface TextHandlerResult {
  response: string;
  success: boolean;
  error?: string;
  audioBuffer?: Buffer;
  respondWithVoice?: boolean;
}

export async function handleTextMessage(
  sock: WASocket,
  message: WAMessage,
  messageText: string,
  context: MessageContext
): Promise<TextHandlerResult> {
  const config = getConfig();
  const chatProvider = getChatProvider();
  const memory = getMemoryOrchestrator();

  try {
    // Load persona
    const persona = await loadPersona();

    // Build context from memory
    const memoryContext = await memory.getContext({
      chatJid: context.chatJid,
      senderJid: context.senderJid,
      senderName: context.senderName,
      isGroup: context.isGroup,
      groupName: context.groupName,
    });

    // Build system prompt based on chat type
    const personaConfig = getPersonaConfig();
    let systemPrompt: string;
    if (context.isGroup && context.groupName) {
      systemPrompt = buildGroupSystemPrompt(
        persona,
        context.groupName,
        memoryContext.systemContext,
        personaConfig
      );
    } else {
      systemPrompt = buildDMSystemPrompt(
        persona,
        context.senderName,
        memoryContext.systemContext,
        personaConfig
      );
    }

    // Build messages array with conversation history
    const messages: Message[] = [];

    // Prepend recent conversation history for continuity
    if (memoryContext.recentMessages.length > 0) {
      messages.push(...memoryContext.recentMessages);
    }

    // Add quoted message context if replying
    if (context.quotedMessage) {
      messages.push({
        role: 'assistant',
        content: context.quotedMessage,
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: messageText,
    });

    // Show typing indicator
    await sock.sendPresenceUpdate('composing', context.chatJid);

    // Call LLM
    const response = await chatProvider.chat({
      systemPrompt,
      messages,
      maxTokens: 1024,
    });

    // Stop typing indicator
    await sock.sendPresenceUpdate('paused', context.chatJid);

    // Log conversation to memory
    await memory.logConversation({
      timestamp: new Date(),
      chatJid: context.chatJid,
      chatName: context.groupName || context.senderName,
      senderJid: context.senderJid,
      senderName: context.senderName,
      userMessage: sanitizeForLogging(messageText),
      buddyResponse: response.content,
      isGroup: context.isGroup,
    });

    // Auto-extract important memories (non-blocking)
    const extractor = getAutoMemoryExtractor();
    extractor.processConversation({
      userMessage: messageText,
      assistantResponse: response.content,
      senderJid: context.senderJid,
      senderName: context.senderName,
      chatJid: context.chatJid,
      isGroup: context.isGroup,
    }).catch((error) => {
      logger.error({ error }, 'Auto memory extraction failed (non-critical)');
    });

    logger.info({
      chat: context.chatJid,
      sender: context.senderName,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
    }, 'Text message handled');

    // Generate voice response if requested
    let audioBuffer: Buffer | undefined;
    if (context.respondWithVoice) {
      try {
        const ttsProvider = getTTSProvider();
        const ttsResponse = await ttsProvider.synthesize({
          text: response.content,
          voice: 'nova',
        });
        audioBuffer = ttsResponse.audioBuffer;
        logger.info({ size: audioBuffer.length }, 'Generated voice response');
      } catch (ttsError) {
        logger.error({ error: ttsError }, 'Failed to generate voice response');
      }
    }

    return {
      response: response.content,
      success: true,
      audioBuffer,
      respondWithVoice: context.respondWithVoice,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to handle text message');

    // Stop typing on error
    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});

    return {
      response: "Sorry, I'm having trouble processing that right now. Please try again.",
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
