import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { getChatProvider, getTTSProvider, getClaudeProvider, type Message, type MessageContext } from '../llm/index.js';
import type { ToolMessage, ContentBlock, TextBlock, ToolUseBlock } from '../llm/types.js';
import { getMemoryOrchestrator } from '../memory/index.js';
import { getAutoMemoryExtractor } from '../memory/auto-extract.js';
import { loadPersona, buildDMSystemPrompt, buildGroupSystemPrompt } from '../../persona/loader.js';
import { getConfig, isEnabled } from '../config/index.js';
import { sanitizeForLogging } from '../safety/privacy.js';
import { getPersonaConfig } from '../setup/index.js';
import { getAvailableTools } from '../core/tool-definitions.js';
import { executeTool } from '../core/tool-executor.js';
import pino from 'pino';

const logger = pino({ name: 'text-handler' });

const MAX_TOOL_ITERATIONS = 5;

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

    // Tool-use path: Claude picks tools semantically
    if (isEnabled('toolUse')) {
      return handleWithTools(
        sock,
        message,
        messageText,
        context,
        systemPrompt,
        messages,
        memoryContext
      );
    }

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

// --- Agentic Tool Loop (behind FF_TOOL_USE) ---

interface MemoryContextData {
  systemContext: string;
  recentMessages: Message[];
}

async function handleWithTools(
  sock: WASocket,
  message: WAMessage,
  messageText: string,
  context: MessageContext,
  systemPrompt: string,
  legacyMessages: Message[],
  memoryContext: MemoryContextData
): Promise<TextHandlerResult> {
  const claude = getClaudeProvider();
  const memory = getMemoryOrchestrator();
  const tools = getAvailableTools(context);

  // Convert Message[] to ToolMessage[] (string content is valid for ToolMessage)
  const toolMessages: ToolMessage[] = legacyMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  await sock.sendPresenceUpdate('composing', context.chatJid);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let iterations = 0;
  let finalText = '';

  try {
    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const response = await claude.chatWithTools({
        systemPrompt,
        messages: toolMessages,
        tools: tools.length > 0 ? tools : undefined,
        maxTokens: 2048,
      });

      totalInputTokens += response.usage?.inputTokens || 0;
      totalOutputTokens += response.usage?.outputTokens || 0;

      if (response.stopReason === 'end_turn' || response.stopReason === 'max_tokens') {
        // Extract final text from content blocks
        finalText = response.content
          .filter((b): b is TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');
        break;
      }

      if (response.stopReason === 'tool_use') {
        // Append assistant message with tool_use blocks
        toolMessages.push({ role: 'assistant', content: response.content });

        // Execute all tool_use blocks
        const toolUseBlocks = response.content.filter(
          (b): b is ToolUseBlock => b.type === 'tool_use'
        );

        const toolResults: ContentBlock[] = [];
        for (const toolUse of toolUseBlocks) {
          logger.info(
            { tool: toolUse.name, input: toolUse.input },
            'Executing tool from Claude'
          );
          const result = await executeTool(toolUse.name, toolUse.input, {
            sock,
            message,
            originalText: messageText,
            context,
          });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result.content,
            is_error: result.isError,
          });
        }

        // Append tool results as user message
        toolMessages.push({ role: 'user', content: toolResults });
      }
    }

    await sock.sendPresenceUpdate('paused', context.chatJid);

    // Log conversation to memory
    await memory.logConversation({
      timestamp: new Date(),
      chatJid: context.chatJid,
      chatName: context.groupName || context.senderName,
      senderJid: context.senderJid,
      senderName: context.senderName,
      userMessage: sanitizeForLogging(messageText),
      buddyResponse: finalText,
      isGroup: context.isGroup,
    });

    // Auto-extract important memories (non-blocking)
    const extractor = getAutoMemoryExtractor();
    extractor
      .processConversation({
        userMessage: messageText,
        assistantResponse: finalText,
        senderJid: context.senderJid,
        senderName: context.senderName,
        chatJid: context.chatJid,
        isGroup: context.isGroup,
      })
      .catch((error) => {
        logger.error({ error }, 'Auto memory extraction failed (non-critical)');
      });

    logger.info(
      {
        chat: context.chatJid,
        sender: context.senderName,
        iterations,
        totalInputTokens,
        totalOutputTokens,
      },
      'Tool-use text message handled'
    );

    // Generate voice response if requested
    let audioBuffer: Buffer | undefined;
    if (context.respondWithVoice && finalText) {
      try {
        const ttsProvider = getTTSProvider();
        const ttsResponse = await ttsProvider.synthesize({
          text: finalText,
          voice: 'nova',
        });
        audioBuffer = ttsResponse.audioBuffer;
        logger.info({ size: audioBuffer.length }, 'Generated voice response');
      } catch (ttsError) {
        logger.error({ error: ttsError }, 'Failed to generate voice response');
      }
    }

    return {
      response: finalText,
      success: true,
      audioBuffer,
      respondWithVoice: context.respondWithVoice,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to handle text message with tools');

    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});

    return {
      response: "Sorry, I'm having trouble processing that right now. Please try again.",
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
