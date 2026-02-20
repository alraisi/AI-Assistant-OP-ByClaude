import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getVisionProvider, type MessageContext } from '../llm/index.js';
import { loadPersona, buildDMSystemPrompt, buildGroupSystemPrompt } from '../../persona/loader.js';
import { getMemoryOrchestrator } from '../memory/index.js';
import { sanitizeForLogging } from '../safety/privacy.js';
import { getPersonaConfig } from '../setup/index.js';
import pino from 'pino';

const logger = pino({ name: 'image-handler' });

export interface ImageHandlerResult {
  response: string;
  success: boolean;
  error?: string;
}

export async function handleImageMessage(
  sock: WASocket,
  message: WAMessage,
  context: MessageContext
): Promise<ImageHandlerResult> {
  const visionProvider = getVisionProvider();
  const memory = getMemoryOrchestrator();

  try {
    // Show typing indicator
    await sock.sendPresenceUpdate('composing', context.chatJid);

    // Download the image
    const imageBuffer = await downloadMediaMessage(
      message,
      'buffer',
      {}
    ) as Buffer;

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Failed to download image');
    }

    logger.info({
      size: imageBuffer.length,
      chat: context.chatJid,
    }, 'Downloaded image');

    // Get image message details
    const imageMessage = message.message?.imageMessage;
    const mimeType = imageMessage?.mimetype || 'image/jpeg';
    const caption = imageMessage?.caption || '';

    // Load persona for system prompt
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

    // Build prompt for image analysis
    let prompt = "Please look at this image and respond helpfully.";
    if (caption) {
      prompt = `The user sent this image with the caption: "${caption}"\n\nPlease respond to their message, taking the image into account.`;
    }

    // Analyze the image
    const response = await visionProvider.analyzeImage({
      imageBuffer,
      mimeType,
      prompt,
      systemPrompt,
    });

    // Stop typing indicator
    await sock.sendPresenceUpdate('paused', context.chatJid);

    // Log to memory
    await memory.logConversation({
      timestamp: new Date(),
      chatJid: context.chatJid,
      chatName: context.groupName || context.senderName,
      senderJid: context.senderJid,
      senderName: context.senderName,
      userMessage: sanitizeForLogging(caption || '[Image]'),
      buddyResponse: response.content,
      isGroup: context.isGroup,
    });

    logger.info({
      chat: context.chatJid,
      sender: context.senderName,
      hasCaption: !!caption,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
    }, 'Image message handled');

    return {
      response: response.content,
      success: true,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to handle image message');

    // Stop typing on error
    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});

    return {
      response: "Sorry, I couldn't process that image right now. Please try again.",
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
