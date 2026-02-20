/**
 * Sticker Handler
 * Converts images to WhatsApp sticker format
 */

import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { isEnabled } from '../config/index.js';
import type { MessageContext } from '../llm/types.js';
import type { RouteResult } from '../core/message-router.js';
import pino from 'pino';

const logger = pino({ name: 'sticker-handler' });

// WhatsApp sticker requirements
const STICKER_SIZE = 512; // Must be 512x512 pixels
const MAX_FILE_SIZE = 100 * 1024; // 100KB for animated, 500KB for static (we use 100KB to be safe)

// Sticker creation patterns
const STICKER_PATTERNS = [
  /\b(sticker|make this a sticker|create sticker|convert to sticker)\b/i,
  /^sticker\s*$/i,
];

/**
 * Check if text indicates sticker creation intent
 */
function hasStickerIntent(text: string): boolean {
  for (const pattern of STICKER_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Convert image buffer to sticker format
 * Uses dynamic import for sharp to avoid issues if not installed
 */
async function convertToSticker(imageBuffer: Buffer): Promise<Buffer> {
  try {
    // Dynamic import to handle optional dependency
    const sharp = await import('sharp');
    
    const processed = sharp.default(imageBuffer)
      .resize(STICKER_SIZE, STICKER_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent background
      })
      .webp({
        quality: 80,
        effort: 4, // Compression effort (0-6)
      });
    
    const outputBuffer = await processed.toBuffer();
    
    // Check file size
    if (outputBuffer.length > MAX_FILE_SIZE) {
      logger.warn({ size: outputBuffer.length }, 'Sticker too large, trying higher compression');
      
      // Try with lower quality
      const compressed = sharp.default(imageBuffer)
        .resize(STICKER_SIZE, STICKER_SIZE, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({
          quality: 60,
          effort: 6,
        });
      
      return await compressed.toBuffer();
    }
    
    return outputBuffer;
  } catch (error) {
    logger.error({ error }, 'Sharp not available or failed');
    throw new Error('Sticker creation requires sharp package. Install with: npm install sharp');
  }
}

/**
 * Handle sticker creation from image
 */
export async function handleStickerMessage(
  sock: WASocket,
  message: WAMessage,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('stickerCreation')) {
    return null;
  }
  
  try {
    // Check if message has image
    const imageMessage = message.message?.imageMessage;
    const caption = imageMessage?.caption || '';
    
    if (!imageMessage) {
      return null;
    }
    
    // Check if user wants a sticker or if it's a reply asking for sticker
    const isStickerRequest = hasStickerIntent(caption);
    
    // Also check if it's a reply to an image with sticker request
    const isReplyStickerRequest = context.quotedMessage && 
      hasStickerIntent(extractMessageText(message) || '');
    
    if (!isStickerRequest && !isReplyStickerRequest) {
      return null;
    }
    
    logger.info({ chat: context.chatJid }, 'Creating sticker from image');
    
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
    
    // Convert to sticker
    const stickerBuffer = await convertToSticker(imageBuffer);
    
    // Send sticker
    await sock.sendMessage(context.chatJid, {
      sticker: stickerBuffer,
    }, {
      quoted: context.isGroup ? message : undefined,
    });
    
    await sock.sendPresenceUpdate('paused', context.chatJid);
    
    logger.info({ size: stickerBuffer.length }, 'Sticker sent');
    
    return {
      response: '',
      success: true,
      contentType: 'text',
    };
    
  } catch (error) {
    logger.error({ error }, 'Failed to create sticker');
    
    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('sharp')) {
      return {
        response: "I need the sharp package to create stickers. Please run: npm install sharp",
        success: false,
        contentType: 'text',
        error: errorMessage,
      };
    }
    
    return {
      response: "Sorry, I couldn't create a sticker from that image. Please try again with a different image.",
      success: false,
      contentType: 'text',
      error: errorMessage,
    };
  }
}

/**
 * Handle text command to create sticker from quoted image
 */
export async function handleStickerCommand(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('stickerCreation')) {
    return null;
  }
  
  // Check if text is a sticker command
  if (!hasStickerIntent(text)) {
    return null;
  }
  
  // Check if there's a quoted image
  const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  
  if (!quotedMessage?.imageMessage) {
    return {
      response: "Please reply to an image with 'sticker' to convert it to a sticker.",
      success: true,
      contentType: 'text',
    };
  }
  
  try {
    logger.info({ chat: context.chatJid }, 'Creating sticker from quoted image');
    
    await sock.sendPresenceUpdate('composing', context.chatJid);
    
    // Get the quoted message key
    const quotedKey = message.message?.extendedTextMessage?.contextInfo?.stanzaId;
    const quotedParticipant = message.message?.extendedTextMessage?.contextInfo?.participant;
    
    if (!quotedKey) {
      throw new Error('Could not find quoted message');
    }
    
    // Construct the quoted message object for download
    const quotedMsgObj: WAMessage = {
      key: {
        remoteJid: context.chatJid,
        fromMe: false,
        id: quotedKey,
        participant: quotedParticipant,
      },
      message: quotedMessage,
    };
    
    // Download the quoted image
    const imageBuffer = await downloadMediaMessage(
      quotedMsgObj,
      'buffer',
      {}
    ) as Buffer;
    
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Failed to download quoted image');
    }
    
    // Convert to sticker
    const stickerBuffer = await convertToSticker(imageBuffer);
    
    // Send sticker
    await sock.sendMessage(context.chatJid, {
      sticker: stickerBuffer,
    }, {
      quoted: context.isGroup ? message : undefined,
    });
    
    await sock.sendPresenceUpdate('paused', context.chatJid);
    
    logger.info({ size: stickerBuffer.length }, 'Sticker sent from quoted image');
    
    return {
      response: '',
      success: true,
      contentType: 'text',
    };
    
  } catch (error) {
    logger.error({ error }, 'Failed to create sticker from quoted image');
    
    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});
    
    return {
      response: "Sorry, I couldn't create a sticker from that image.",
      success: false,
      contentType: 'text',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extract text from message
 */
function extractMessageText(message: WAMessage): string | null {
  const content = message.message;
  if (!content) return null;
  
  if (content.conversation) {
    return content.conversation;
  }
  
  if (content.extendedTextMessage?.text) {
    return content.extendedTextMessage.text;
  }
  
  return null;
}
