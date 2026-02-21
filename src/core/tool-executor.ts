import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import type { MessageContext } from '../llm/types.js';
import pino from 'pino';

const logger = pino({ name: 'tool-executor' });

export interface ToolExecutionContext {
  sock: WASocket;
  message: WAMessage;
  originalText: string;
  context: MessageContext;
}

export interface ToolExecutionResult {
  content: string;
  isError?: boolean;
}

type ToolExecutor = (
  input: Record<string, unknown>,
  ctx: ToolExecutionContext
) => Promise<ToolExecutionResult>;

const executors = new Map<string, ToolExecutor>();

export function registerExecutors(): void {
  executors.set('generate_image', async (input, ctx) => {
    const { handleImageGeneration } = await import('../handlers/generate.js');
    const result = await handleImageGeneration(
      ctx.sock,
      input.prompt as string,
      ctx.context
    );
    return {
      content: result.success
        ? 'Image generated and sent successfully.'
        : `Failed to generate image: ${result.error}`,
      isError: !result.success,
    };
  });

  executors.set('generate_document', async (input, ctx) => {
    const { handleDocumentGeneration } = await import(
      '../handlers/generate.js'
    );
    const result = await handleDocumentGeneration(
      ctx.sock,
      input.request as string,
      ctx.context
    );
    return {
      content: result.success
        ? 'Document generated and sent successfully.'
        : `Failed to generate document: ${result.error}`,
      isError: !result.success,
    };
  });

  executors.set('summarize_url', async (input, ctx) => {
    const { handleUrlSummarization } = await import(
      '../handlers/url-summarizer.js'
    );
    const result = await handleUrlSummarization(
      ctx.sock,
      input.text as string,
      ctx.context
    );
    if (!result) {
      return { content: 'No URL found in the message.', isError: true };
    }
    return {
      content: result.response || 'URL summarized.',
      isError: !result.success,
    };
  });

  executors.set('web_search', async (input, ctx) => {
    const { handleSearchMessage } = await import('../handlers/search.js');
    const result = await handleSearchMessage(
      ctx.sock,
      ctx.originalText,
      input.query as string,
      ctx.context
    );
    return {
      content: result.response || 'No search results found.',
      isError: !result.success,
    };
  });

  executors.set('set_reminder', async (input, ctx) => {
    const { handleReminderCreation } = await import(
      '../handlers/reminder.js'
    );
    const result = await handleReminderCreation(
      ctx.sock,
      ctx.message,
      input.text as string,
      ctx.context
    );
    if (!result) {
      return {
        content: 'Could not parse reminder request.',
        isError: true,
      };
    }
    return {
      content: result.response || 'Reminder set.',
      isError: !result.success,
    };
  });

  executors.set('list_reminders', async (input, ctx) => {
    const { handleListReminders } = await import('../handlers/reminder.js');
    const result = await handleListReminders(
      ctx.sock,
      ctx.message,
      input.text as string,
      ctx.context
    );
    if (!result) {
      return { content: 'No active reminders found.', isError: false };
    }
    return {
      content: result.response || 'No reminders.',
      isError: !result.success,
    };
  });

  executors.set('cancel_reminder', async (input, ctx) => {
    const { handleCancelReminder } = await import('../handlers/reminder.js');
    const result = await handleCancelReminder(
      ctx.sock,
      ctx.message,
      input.text as string,
      ctx.context
    );
    if (!result) {
      return { content: 'No matching reminder to cancel.', isError: true };
    }
    return {
      content: result.response || 'Reminder cancelled.',
      isError: !result.success,
    };
  });

  executors.set('create_poll', async (input, ctx) => {
    const { handlePollCreation } = await import('../handlers/poll.js');
    const result = await handlePollCreation(
      ctx.sock,
      ctx.message,
      input.text as string,
      ctx.context
    );
    if (!result) {
      return { content: 'Could not create poll.', isError: true };
    }
    return {
      content: result.response || 'Poll created.',
      isError: !result.success,
    };
  });

  executors.set('search_memory', async (input, ctx) => {
    const { handleSemanticSearch } = await import(
      '../handlers/semantic-search.js'
    );
    const result = await handleSemanticSearch(
      ctx.sock,
      ctx.message,
      input.text as string,
      ctx.context
    );
    if (!result) {
      return { content: 'No matching memories found.', isError: false };
    }
    return {
      content: result.response || 'No results.',
      isError: !result.success,
    };
  });

  executors.set('summarize_chat', async (input, ctx) => {
    const { handleSummaryCommand } = await import('../handlers/summary.js');
    const result = await handleSummaryCommand(
      ctx.sock,
      ctx.message,
      input.text as string,
      ctx.context
    );
    if (!result) {
      return {
        content: 'Could not generate summary.',
        isError: true,
      };
    }
    return {
      content: result.response || 'Summary generated.',
      isError: !result.success,
    };
  });

  executors.set('execute_code', async (input, ctx) => {
    const { handleCodeExecution } = await import(
      '../handlers/code-execution.js'
    );
    const result = await handleCodeExecution(
      ctx.sock,
      ctx.message,
      input.text as string,
      ctx.context
    );
    if (!result) {
      return {
        content: 'Not recognized as a code execution request.',
        isError: true,
      };
    }
    return {
      content: result.response || 'Code executed.',
      isError: !result.success,
    };
  });

  executors.set('calendar_command', async (input, ctx) => {
    const { handleCalendarCommand } = await import('../handlers/calendar.js');
    const result = await handleCalendarCommand(
      ctx.sock,
      ctx.message,
      input.text as string,
      ctx.context
    );
    if (!result) {
      return {
        content: 'Not recognized as a calendar command.',
        isError: true,
      };
    }
    return {
      content: result.response || 'Calendar updated.',
      isError: !result.success,
    };
  });

  executors.set('admin_command', async (input, ctx) => {
    const { handleAdminCommand } = await import('../handlers/group-admin.js');
    const result = await handleAdminCommand(
      ctx.sock,
      ctx.message,
      input.text as string,
      ctx.context
    );
    if (!result) {
      return {
        content: 'Not recognized as an admin command.',
        isError: true,
      };
    }
    return {
      content: result.response || 'Admin command executed.',
      isError: !result.success,
    };
  });

  executors.set('knowledge_base', async (input, ctx) => {
    const { handleGroupKB } = await import('../handlers/group-kb.js');
    const result = await handleGroupKB(
      ctx.sock,
      ctx.message,
      input.text as string,
      ctx.context
    );
    if (!result) {
      return {
        content: 'Not recognized as a knowledge base command.',
        isError: true,
      };
    }
    return {
      content: result.response || 'Knowledge base updated.',
      isError: !result.success,
    };
  });

  executors.set('create_sticker', async (input, ctx) => {
    const { handleStickerCommand } = await import('../handlers/sticker.js');
    const result = await handleStickerCommand(
      ctx.sock,
      ctx.message,
      input.text as string,
      ctx.context
    );
    if (!result) {
      return {
        content: 'Could not create sticker. Reply to an image with "sticker" to convert it.',
        isError: true,
      };
    }
    return {
      content: result.response || 'Sticker created and sent.',
      isError: !result.success,
    };
  });
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  // Lazy-initialize executors on first call
  if (executors.size === 0) {
    registerExecutors();
  }

  const executor = executors.get(name);
  if (!executor) {
    logger.warn({ toolName: name }, 'Unknown tool requested');
    return { content: `Tool "${name}" is not available.`, isError: true };
  }

  try {
    logger.info({ toolName: name, input }, 'Executing tool');
    const result = await executor(input, ctx);
    logger.info(
      { toolName: name, isError: result.isError },
      'Tool execution completed'
    );
    return result;
  } catch (error) {
    logger.error({ toolName: name, error }, 'Tool execution failed');
    return {
      content: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isError: true,
    };
  }
}
