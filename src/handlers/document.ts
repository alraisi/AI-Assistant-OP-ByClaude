import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getDocumentAnalysisProvider } from '../llm/index.js';
import type { MessageContext } from '../llm/types.js';
import { loadPersona, buildDMSystemPrompt, buildGroupSystemPrompt } from '../../persona/loader.js';
import { getMemoryOrchestrator } from '../memory/index.js';
import { sanitizeForLogging } from '../safety/privacy.js';
import { getPersonaConfig } from '../setup/index.js';
import { extractDocumentText } from '../utils/document-extract.js';
import pino from 'pino';

const logger = pino({ name: 'document-handler' });

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/json',
]);

export interface DocumentHandlerResult {
  response: string;
  success: boolean;
  error?: string;
}

export async function handleDocumentMessage(
  sock: WASocket,
  message: WAMessage,
  context: MessageContext
): Promise<DocumentHandlerResult> {
  try {
    // Show typing indicator
    await sock.sendPresenceUpdate('composing', context.chatJid);

    // Get document message details (handle documentWithCaptionMessage nesting)
    const documentMessage =
      message.message?.documentMessage ||
      message.message?.documentWithCaptionMessage?.message?.documentMessage;

    if (!documentMessage) {
      throw new Error('No document message found');
    }

    const mimeType = documentMessage.mimetype || 'application/octet-stream';
    const fileName = documentMessage.fileName || 'document';
    const fileSize = documentMessage.fileLength
      ? Number(documentMessage.fileLength)
      : 0;
    const caption = documentMessage.caption || '';

    // Check file size
    if (fileSize > MAX_FILE_SIZE) {
      await sock.sendPresenceUpdate('paused', context.chatJid);
      return {
        response: `That file is too large for me to process (${(fileSize / 1024 / 1024).toFixed(1)}MB). I can handle files up to 15MB.`,
        success: true,
      };
    }

    // Check format support
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      await sock.sendPresenceUpdate('paused', context.chatJid);
      return {
        response: `I can't read that file format (${mimeType}). I support PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), plain text, CSV, and JSON files.`,
        success: true,
      };
    }

    // Download the document
    const documentBuffer = await downloadMediaMessage(
      message,
      'buffer',
      {}
    ) as Buffer;

    if (!documentBuffer || documentBuffer.length === 0) {
      throw new Error('Failed to download document');
    }

    logger.info({
      fileName,
      mimeType,
      size: documentBuffer.length,
      chat: context.chatJid,
    }, 'Downloaded document');

    // Extract text from document
    const { text: extractedText, format } = await extractDocumentText(
      documentBuffer,
      mimeType,
      fileName
    );

    // Get the analysis provider
    const analysisProvider = getDocumentAnalysisProvider();

    // Load persona for system prompt
    const persona = await loadPersona();
    const memory = getMemoryOrchestrator();
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
    let prompt = `The user sent a ${format.toUpperCase()} file named "${fileName}". Please analyze this document and provide a helpful summary and response.`;
    if (caption) {
      prompt = `The user sent a ${format.toUpperCase()} file named "${fileName}" with the message: "${caption}"\n\nPlease analyze the document and respond to their message.`;
    }

    // Analyze the document
    const response = await analysisProvider.analyzeDocument({
      documentBuffer,
      mimeType,
      fileName,
      extractedText,
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
      userMessage: sanitizeForLogging(caption || `[Document: ${fileName}]`),
      buddyResponse: response.content,
      isGroup: context.isGroup,
    });

    logger.info({
      chat: context.chatJid,
      sender: context.senderName,
      fileName,
      format,
      hasCaption: !!caption,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
    }, 'Document message handled');

    return {
      response: response.content,
      success: true,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to handle document message');

    // Stop typing on error
    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Provide user-friendly message for missing API key
    if (errorMessage.includes('GEMINI_API_KEY')) {
      return {
        response: "I can't analyze documents right now — the Gemini API key isn't configured. Please ask the bot admin to set GEMINI_API_KEY in the environment.",
        success: false,
        error: errorMessage,
      };
    }

    return {
      response: "Sorry, I couldn't process that document right now. Please try again.",
      success: false,
      error: errorMessage,
    };
  }
}
