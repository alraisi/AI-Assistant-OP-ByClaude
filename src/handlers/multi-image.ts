/**
 * Multi-Image Handler
 * 
 * Handles messages with multiple images (albums) by analyzing
 * all images together for comprehensive understanding.
 */

import type { WAMessage, WASocket, proto } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getClaudeProvider, type MessageContext } from '../llm/index.js';
import { getMemoryOrchestrator } from '../memory/index.js';
import { loadPersona, buildDMSystemPrompt, buildGroupSystemPrompt } from '../../persona/loader.js';
import { sanitizeForLogging } from '../safety/privacy.js';
import { getPersonaConfig } from '../setup/index.js';
import { isEnabled } from '../config/index.js';
import type { ImageData } from '../llm/types.js';
import pino from 'pino';

const logger = pino({ name: 'multi-image-handler' });

export interface MultiImageHandlerResult {
  response: string;
  success: boolean;
  error?: string;
  imageCount: number;
}

export interface ImageInfo {
  buffer: Buffer;
  mimeType: string;
  caption?: string;
}

/**
 * Check if message contains multiple images
 * Note: WhatsApp sends albums as separate messages with same timestamp
 * We need to collect them or handle them differently
 */
export function isMultiImageMessage(message: WAMessage): boolean {
  // In WhatsApp, multiple images in an album are sent as separate messages
  // Each message has imageMessage but they share contextKey
  // For now, we detect if this is part of a sequence
  
  const messageType = Object.keys(message.message || {})[0];
  return messageType === 'imageMessage';
}

/**
 * Extract image from message
 */
export async function extractImageFromMessage(
  message: WAMessage
): Promise<ImageInfo | null> {
  try {
    const imageBuffer = await downloadMediaMessage(
      message,
      'buffer',
      {}
    ) as Buffer;

    if (!imageBuffer || imageBuffer.length === 0) {
      return null;
    }

    const imageMessage = message.message?.imageMessage;
    const mimeType = imageMessage?.mimetype || 'image/jpeg';
    const caption = imageMessage?.caption || undefined;

    return {
      buffer: imageBuffer,
      mimeType,
      caption,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to extract image');
    return null;
  }
}

/**
 * Handle multiple images
 */
export async function handleMultiImageMessage(
  sock: WASocket,
  messages: WAMessage[],
  context: MessageContext
): Promise<MultiImageHandlerResult> {
  if (!isEnabled('multiImageAnalysis')) {
    // Fall back to single image handler
    return {
      response: 'Multi-image analysis is disabled.',
      success: false,
      imageCount: 0,
    };
  }

  const memory = getMemoryOrchestrator();

  try {
    // Show typing indicator
    await sock.sendPresenceUpdate('composing', context.chatJid);

    // Extract all images
    const images: ImageInfo[] = [];
    for (const message of messages) {
      const image = await extractImageFromMessage(message);
      if (image) {
        images.push(image);
      }
    }

    if (images.length === 0) {
      throw new Error('No valid images found');
    }

    logger.info({
      count: images.length,
      chat: context.chatJid,
    }, 'Processing multiple images');

    // If only one image, fall back to regular handler
    if (images.length === 1) {
      await sock.sendPresenceUpdate('paused', context.chatJid);
      return {
        response: 'Single image detected, use regular image handler.',
        success: false,
        imageCount: 1,
      };
    }

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

    // Build prompt
    const hasCaptions = images.some((img) => img.caption);
    let prompt = `I've sent you ${images.length} images. Please analyze them together and provide a comprehensive response.`;
    
    if (hasCaptions) {
      const captions = images
        .filter((img) => img.caption)
        .map((img, i) => `Image ${i + 1}: "${img.caption}"`)
        .join('\n');
      prompt = `I've sent you ${images.length} images with these captions:\n${captions}\n\nPlease analyze the images together and respond to what I've shared.`;
    }

    // Convert to ImageData format
    const imageData: ImageData[] = images.map((img) => ({
      imageBuffer: img.buffer,
      mimeType: img.mimeType,
      caption: img.caption,
    }));

    // Analyze all images together using Claude (supports multi-vision)
    const claudeProvider = getClaudeProvider();
    const response = await claudeProvider.analyzeMultipleImages({
      images: imageData,
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
      userMessage: sanitizeForLogging(`[${images.length} Images]`),
      buddyResponse: response.content,
      isGroup: context.isGroup,
    });

    logger.info({
      chat: context.chatJid,
      sender: context.senderName,
      imageCount: images.length,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
    }, 'Multi-image message handled');

    return {
      response: response.content,
      success: true,
      imageCount: images.length,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to handle multi-image message');

    // Stop typing on error
    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});

    return {
      response: "Sorry, I couldn't process those images right now. Please try again.",
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      imageCount: 0,
    };
  }
}
