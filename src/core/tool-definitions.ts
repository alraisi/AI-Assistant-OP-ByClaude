import { isEnabled, getConfig } from '../config/index.js';
import type { ToolDefinition, MessageContext } from '../llm/types.js';

// --- Tool Definition Constants ---

const GENERATE_IMAGE_TOOL: ToolDefinition = {
  name: 'generate_image',
  description:
    'Generate an image from a text description. Use when the user asks to create, draw, design, or generate a picture, photo, illustration, logo, or artwork.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Detailed description of the image to generate',
      },
    },
    required: ['prompt'],
  },
};

const GENERATE_DOCUMENT_TOOL: ToolDefinition = {
  name: 'generate_document',
  description:
    'Generate a document (PDF, Word, PowerPoint, or Excel). Use when the user asks to create, make, or generate a document, report, presentation, spreadsheet, or file.',
  input_schema: {
    type: 'object',
    properties: {
      request: {
        type: 'string',
        description:
          'The full document generation request as the user said it',
      },
    },
    required: ['request'],
  },
};

const SUMMARIZE_URL_TOOL: ToolDefinition = {
  name: 'summarize_url',
  description:
    'Summarize the content of a URL/webpage. Use when the user shares a link or URL and wants a summary or analysis of its content.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The message text containing the URL to summarize',
      },
    },
    required: ['text'],
  },
};

const WEB_SEARCH_TOOL: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the web for current information. Use when the user asks about recent events, needs up-to-date facts, or asks you to search/look up something online.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
    },
    required: ['query'],
  },
};

const SET_REMINDER_TOOL: ToolDefinition = {
  name: 'set_reminder',
  description:
    'Set a reminder for the user. Use when they ask to be reminded about something at a specific time or after a duration.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description:
          'The full reminder request as the user said it (e.g. "remind me to call mom in 30 minutes")',
      },
    },
    required: ['text'],
  },
};

const LIST_REMINDERS_TOOL: ToolDefinition = {
  name: 'list_reminders',
  description:
    'List all active reminders for the user. Use when they ask to see, show, or list their reminders.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The original message text',
      },
    },
    required: ['text'],
  },
};

const CANCEL_REMINDER_TOOL: ToolDefinition = {
  name: 'cancel_reminder',
  description:
    'Cancel an existing reminder. Use when the user asks to cancel, delete, or remove a reminder.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The cancel reminder request text',
      },
    },
    required: ['text'],
  },
};

const CREATE_POLL_TOOL: ToolDefinition = {
  name: 'create_poll',
  description:
    'Create a poll in a group chat. Use when the user asks to create a poll, vote, or survey with options.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The full poll creation request',
      },
    },
    required: ['text'],
  },
};

const SEARCH_MEMORY_TOOL: ToolDefinition = {
  name: 'search_memory',
  description:
    'Search through conversation memory and stored knowledge. Use when the user asks "do you remember", "what did I say about", or wants to recall past conversations.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The memory search query text',
      },
    },
    required: ['text'],
  },
};

const SUMMARIZE_CHAT_TOOL: ToolDefinition = {
  name: 'summarize_chat',
  description:
    'Summarize recent chat conversation history. Use when the user asks for a summary of the chat, what happened, or "tldr".',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The summary request text',
      },
    },
    required: ['text'],
  },
};

const EXECUTE_CODE_TOOL: ToolDefinition = {
  name: 'execute_code',
  description:
    'Execute code (JavaScript/Python). Use when the user asks to run, execute, or evaluate code, or wants a calculation performed programmatically.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The code execution request text',
      },
    },
    required: ['text'],
  },
};

const CALENDAR_TOOL: ToolDefinition = {
  name: 'calendar_command',
  description:
    'Manage calendar events. Use when the user asks about their schedule, wants to add/remove calendar events, or check upcoming appointments.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The calendar command text',
      },
    },
    required: ['text'],
  },
};

const ADMIN_COMMAND_TOOL: ToolDefinition = {
  name: 'admin_command',
  description:
    'Execute group admin commands. Use when someone uses admin commands like !warn, !mute, !kick, !rules, or !settings in a group chat.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The admin command text',
      },
    },
    required: ['text'],
  },
};

const KNOWLEDGE_BASE_TOOL: ToolDefinition = {
  name: 'knowledge_base',
  description:
    'Access or manage the group knowledge base. Use when the user asks to save, search, or retrieve information from the group knowledge base using commands like !kb or !save.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The knowledge base command text',
      },
    },
    required: ['text'],
  },
};

const CREATE_STICKER_TOOL: ToolDefinition = {
  name: 'create_sticker',
  description:
    'Create a sticker from an image. Use when the user asks to make, create, or convert something into a sticker.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The sticker creation request text',
      },
    },
    required: ['text'],
  },
};

// --- Registry ---

export function getAvailableTools(context: MessageContext): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  const config = getConfig();

  // Always available
  tools.push(GENERATE_IMAGE_TOOL, GENERATE_DOCUMENT_TOOL);

  // Conditional on feature flags / config
  if (isEnabled('urlSummarization')) tools.push(SUMMARIZE_URL_TOOL);
  if (config.serperApiKey) tools.push(WEB_SEARCH_TOOL);
  if (isEnabled('reminderSystem'))
    tools.push(SET_REMINDER_TOOL, LIST_REMINDERS_TOOL, CANCEL_REMINDER_TOOL);
  if (isEnabled('pollCreator') && context.isGroup)
    tools.push(CREATE_POLL_TOOL);
  if (isEnabled('semanticMemory')) tools.push(SEARCH_MEMORY_TOOL);
  if (isEnabled('conversationSummaries')) tools.push(SUMMARIZE_CHAT_TOOL);
  if (isEnabled('codeExecution')) tools.push(EXECUTE_CODE_TOOL);
  if (isEnabled('calendarIntegration')) tools.push(CALENDAR_TOOL);
  if (isEnabled('groupAdminControls') && context.isGroup)
    tools.push(ADMIN_COMMAND_TOOL);
  if (isEnabled('groupKnowledgeBase') && context.isGroup)
    tools.push(KNOWLEDGE_BASE_TOOL);
  if (isEnabled('stickerCreation')) tools.push(CREATE_STICKER_TOOL);

  return tools;
}

// Export constants for testing
export {
  GENERATE_IMAGE_TOOL,
  GENERATE_DOCUMENT_TOOL,
  SUMMARIZE_URL_TOOL,
  WEB_SEARCH_TOOL,
  SET_REMINDER_TOOL,
  LIST_REMINDERS_TOOL,
  CANCEL_REMINDER_TOOL,
  CREATE_POLL_TOOL,
  SEARCH_MEMORY_TOOL,
  SUMMARIZE_CHAT_TOOL,
  EXECUTE_CODE_TOOL,
  CALENDAR_TOOL,
  ADMIN_COMMAND_TOOL,
  KNOWLEDGE_BASE_TOOL,
  CREATE_STICKER_TOOL,
};
