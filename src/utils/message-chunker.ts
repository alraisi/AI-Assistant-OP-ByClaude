/**
 * Message Chunker Utility
 * Splits long messages into multiple chunks for better readability
 */

import { isEnabled } from '../config/index.js';
import pino from 'pino';

const logger = pino({ name: 'message-chunker' });

// WhatsApp message limits and optimal sizes
const MAX_MESSAGE_LENGTH = 4096; // WhatsApp hard limit
const OPTIMAL_MESSAGE_LENGTH = 1500; // Optimal for readability
const MIN_CHUNK_SIZE = 200; // Don't split messages shorter than this

export interface ChunkOptions {
  maxLength?: number;
  preserveParagraphs?: boolean;
  addContinuationMarkers?: boolean;
}

export interface MessageChunk {
  text: string;
  index: number;
  total: number;
  isLast: boolean;
}

/**
 * Check if message needs chunking
 */
export function needsChunking(text: string, maxLength: number = OPTIMAL_MESSAGE_LENGTH): boolean {
  if (!isEnabled('messageChunking')) {
    return false;
  }
  
  return text.length > maxLength;
}

/**
 * Split text into chunks at natural boundaries
 */
export function chunkMessage(
  text: string,
  options: ChunkOptions = {}
): MessageChunk[] {
  const maxLength = options.maxLength || OPTIMAL_MESSAGE_LENGTH;
  const preserveParagraphs = options.preserveParagraphs !== false;
  const addMarkers = options.addContinuationMarkers !== false;
  
  // Don't chunk short messages
  if (text.length <= Math.max(MIN_CHUNK_SIZE, maxLength)) {
    return [{
      text,
      index: 1,
      total: 1,
      isLast: true,
    }];
  }
  
  const chunks: string[] = [];
  
  if (preserveParagraphs) {
    // Split at paragraph boundaries when possible
    chunks.push(...splitAtParagraphs(text, maxLength));
  } else {
    // Simple split at word boundaries
    chunks.push(...splitAtWords(text, maxLength));
  }
  
  // Add continuation markers if needed
  const totalChunks = chunks.length;
  
  return chunks.map((chunk, index) => {
    let finalText = chunk.trim();
    
    if (addMarkers && totalChunks > 1) {
      if (index > 0) {
        finalText = `...${finalText}`;
      }
      if (index < totalChunks - 1) {
        finalText = `${finalText}...`;
      }
    }
    
    return {
      text: finalText,
      index: index + 1,
      total: totalChunks,
      isLast: index === totalChunks - 1,
    };
  });
}

/**
 * Split text at paragraph boundaries
 */
function splitAtParagraphs(text: string, maxLength: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // If single paragraph is too long, split it further
    if (paragraph.length > maxLength) {
      // First, save current chunk if exists
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      
      // Split long paragraph at sentences
      const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph];
      
      for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxLength) {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }
          
          // If single sentence is too long, split at words
          if (sentence.length > maxLength) {
            const words = sentence.split(' ');
            for (const word of words) {
              if ((currentChunk + word).length > maxLength) {
                if (currentChunk) {
                  chunks.push(currentChunk.trim());
                  currentChunk = '';
                }
              }
              currentChunk += (currentChunk ? ' ' : '') + word;
            }
          } else {
            currentChunk = sentence;
          }
        } else {
          currentChunk += (currentChunk ? ' ' : '') + sentence.trim();
        }
      }
    } else {
      // Check if adding this paragraph exceeds limit
      if ((currentChunk + '\n\n' + paragraph).length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = paragraph;
        } else {
          currentChunk = paragraph;
        }
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Split text at word boundaries
 */
function splitAtWords(text: string, maxLength: number): string[] {
  const words = text.split(' ');
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const word of words) {
    if ((currentChunk + ' ' + word).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = word;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + word;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Smart chunker that considers message structure
 */
export function smartChunkMessage(text: string): MessageChunk[] {
  // Check for special formatting that should be preserved
  
  // Code blocks - don't split inside code blocks
  if (text.includes('```')) {
    return chunkWithCodeBlocks(text);
  }
  
  // Lists - try to keep list items together
  if (/^[•\-\*\d+\.]/m.test(text)) {
    return chunkWithLists(text);
  }
  
  // Default paragraph-based chunking
  return chunkMessage(text, { preserveParagraphs: true });
}

/**
 * Chunk message while preserving code blocks
 */
function chunkWithCodeBlocks(text: string): MessageChunk[] {
  const chunks: string[] = [];
  let currentChunk = '';
  let inCodeBlock = false;
  
  const lines = text.split('\n');
  
  for (const line of lines) {
    const isCodeBlockMarker = line.trim().startsWith('```');
    
    if (isCodeBlockMarker) {
      inCodeBlock = !inCodeBlock;
    }
    
    const lineWithNewline = (currentChunk ? '\n' : '') + line;
    
    if (!inCodeBlock && (currentChunk + lineWithNewline).length > OPTIMAL_MESSAGE_LENGTH) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk = line;
      }
    } else {
      currentChunk += lineWithNewline;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks.map((chunk, index) => ({
    text: chunk.trim(),
    index: index + 1,
    total: chunks.length,
    isLast: index === chunks.length - 1,
  }));
}

/**
 * Chunk message while preserving list items
 */
function chunkWithLists(text: string): MessageChunk[] {
  const listItemRegex = /^[•\-\*\d+\.]\s/m;
  const chunks: string[] = [];
  let currentChunk = '';
  let currentListItem = '';
  
  const lines = text.split('\n');
  
  for (const line of lines) {
    const isListItem = listItemRegex.test(line);
    
    if (isListItem) {
      // Save previous list item
      if (currentListItem) {
        if ((currentChunk + '\n' + currentListItem).length > OPTIMAL_MESSAGE_LENGTH) {
          if (currentChunk) {
            chunks.push(currentChunk);
          }
          currentChunk = currentListItem;
        } else {
          currentChunk += (currentChunk ? '\n' : '') + currentListItem;
        }
      }
      currentListItem = line;
    } else if (line.trim() === '') {
      // Empty line - save current list item
      if (currentListItem) {
        if ((currentChunk + '\n' + currentListItem).length > OPTIMAL_MESSAGE_LENGTH) {
          if (currentChunk) {
            chunks.push(currentChunk);
          }
          currentChunk = currentListItem;
        } else {
          currentChunk += (currentChunk ? '\n' : '') + currentListItem;
        }
        currentListItem = '';
      }
      currentChunk += '\n';
    } else {
      // Continuation of list item
      currentListItem += '\n' + line;
    }
  }
  
  // Handle remaining content
  if (currentListItem) {
    if ((currentChunk + '\n' + currentListItem).length > OPTIMAL_MESSAGE_LENGTH) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = currentListItem;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + currentListItem;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks.filter(c => c.trim().length > 0).map((chunk, index) => ({
    text: chunk.trim(),
    index: index + 1,
    total: chunks.length,
    isLast: index === chunks.filter(c => c.trim().length > 0).length - 1,
  }));
}

/**
 * Send chunked messages with delay
 */
export async function sendChunkedMessage(
  sendMessageFn: (text: string) => Promise<void>,
  text: string,
  options: ChunkOptions & { delayMs?: number } = {}
): Promise<void> {
  if (!isEnabled('messageChunking')) {
    // Feature disabled, send as-is
    await sendMessageFn(text);
    return;
  }
  
  const delayMs = options.delayMs || 500; // Small delay between chunks
  
  const chunks = smartChunkMessage(text);
  
  if (chunks.length === 1) {
    // No chunking needed
    await sendMessageFn(chunks[0].text);
    return;
  }
  
  logger.info({ totalChunks: chunks.length }, 'Sending chunked message');
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    await sendMessageFn(chunk.text);
    
    // Add delay between chunks (except last one)
    if (!chunk.isLast && delayMs > 0) {
      await sleep(delayMs);
    }
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate chunking statistics for logging
 */
export function getChunkStats(text: string): {
  originalLength: number;
  needsChunking: boolean;
  estimatedChunks: number;
} {
  const needsChunk = needsChunking(text);
  const chunks = needsChunk ? smartChunkMessage(text) : [{ text, index: 1, total: 1, isLast: true }];
  
  return {
    originalLength: text.length,
    needsChunking: needsChunk,
    estimatedChunks: chunks.length,
  };
}
