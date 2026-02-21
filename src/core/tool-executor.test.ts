import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../handlers/generate.js', () => ({
  handleImageGeneration: vi.fn().mockResolvedValue({ success: true, type: 'image' }),
  handleDocumentGeneration: vi.fn().mockResolvedValue({ success: true, type: 'document' }),
}));

vi.mock('../handlers/search.js', () => ({
  handleSearchMessage: vi.fn().mockResolvedValue({ response: 'search results', success: true }),
}));

vi.mock('../handlers/reminder.js', () => ({
  handleReminderCreation: vi.fn().mockResolvedValue({ response: 'Reminder set!', success: true }),
  handleListReminders: vi.fn().mockResolvedValue({ response: 'Your reminders: ...', success: true }),
  handleCancelReminder: vi.fn().mockResolvedValue({ response: 'Reminder cancelled.', success: true }),
}));

vi.mock('../handlers/url-summarizer.js', () => ({
  handleUrlSummarization: vi.fn().mockResolvedValue({ response: 'URL summary', success: true }),
}));

vi.mock('../handlers/poll.js', () => ({
  handlePollCreation: vi.fn().mockResolvedValue({ response: 'Poll created!', success: true }),
}));

vi.mock('../handlers/semantic-search.js', () => ({
  handleSemanticSearch: vi.fn().mockResolvedValue({ response: 'Memory result', success: true }),
}));

vi.mock('../handlers/summary.js', () => ({
  handleSummaryCommand: vi.fn().mockResolvedValue({ response: 'Chat summary', success: true }),
}));

vi.mock('../handlers/code-execution.js', () => ({
  handleCodeExecution: vi.fn().mockResolvedValue({ response: 'Code output', success: true }),
}));

vi.mock('../handlers/calendar.js', () => ({
  handleCalendarCommand: vi.fn().mockResolvedValue({ response: 'Calendar updated', success: true }),
}));

vi.mock('../handlers/group-admin.js', () => ({
  handleAdminCommand: vi.fn().mockResolvedValue({ response: 'Admin done', success: true }),
}));

vi.mock('../handlers/group-kb.js', () => ({
  handleGroupKB: vi.fn().mockResolvedValue({ response: 'KB result', success: true }),
}));

vi.mock('../handlers/sticker.js', () => ({
  handleStickerCommand: vi.fn().mockResolvedValue({ response: 'Sticker created', success: true }),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { executeTool, registerExecutors, type ToolExecutionContext } from './tool-executor.js';
import { createMockSocket, createTextMessage, createContext } from '../__tests__/test-helpers.js';

function createToolContext(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    sock: createMockSocket(),
    message: createTextMessage('test'),
    originalText: 'test',
    context: createContext(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeTool', () => {
  it('returns error for unknown tool name', async () => {
    const result = await executeTool('nonexistent_tool', {}, createToolContext());

    expect(result.isError).toBe(true);
    expect(result.content).toContain('not available');
  });

  it('executes generate_image tool', async () => {
    const result = await executeTool(
      'generate_image',
      { prompt: 'a sunset' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Image generated');
  });

  it('executes generate_document tool', async () => {
    const result = await executeTool(
      'generate_document',
      { request: 'create a PDF report' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('Document generated');
  });

  it('executes web_search tool', async () => {
    const result = await executeTool(
      'web_search',
      { query: 'latest AI news' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('search results');
  });

  it('executes set_reminder tool', async () => {
    const result = await executeTool(
      'set_reminder',
      { text: 'remind me in 30 min' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('Reminder set!');
  });

  it('executes list_reminders tool', async () => {
    const result = await executeTool(
      'list_reminders',
      { text: 'show my reminders' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('reminders');
  });

  it('executes cancel_reminder tool', async () => {
    const result = await executeTool(
      'cancel_reminder',
      { text: 'cancel reminder 1' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain('cancelled');
  });

  it('executes summarize_url tool', async () => {
    const result = await executeTool(
      'summarize_url',
      { text: 'https://example.com' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('URL summary');
  });

  it('executes create_poll tool', async () => {
    const result = await executeTool(
      'create_poll',
      { text: 'poll: favorite color? red, blue, green' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('Poll created!');
  });

  it('executes search_memory tool', async () => {
    const result = await executeTool(
      'search_memory',
      { text: 'what did I say about pizza' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('Memory result');
  });

  it('executes summarize_chat tool', async () => {
    const result = await executeTool(
      'summarize_chat',
      { text: 'summarize this chat' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('Chat summary');
  });

  it('executes execute_code tool', async () => {
    const result = await executeTool(
      'execute_code',
      { text: 'run console.log(1+1)' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('Code output');
  });

  it('executes calendar_command tool', async () => {
    const result = await executeTool(
      'calendar_command',
      { text: 'add event tomorrow' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('Calendar updated');
  });

  it('executes admin_command tool', async () => {
    const result = await executeTool(
      'admin_command',
      { text: '!warn @user' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('Admin done');
  });

  it('executes knowledge_base tool', async () => {
    const result = await executeTool(
      'knowledge_base',
      { text: '!kb search test' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('KB result');
  });

  it('executes create_sticker tool', async () => {
    const result = await executeTool(
      'create_sticker',
      { text: 'sticker' },
      createToolContext()
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toBe('Sticker created');
  });

  it('catches handler exceptions and returns error result', async () => {
    const { handleImageGeneration } = await import('../handlers/generate.js');
    vi.mocked(handleImageGeneration).mockRejectedValueOnce(new Error('API down'));

    const result = await executeTool(
      'generate_image',
      { prompt: 'test' },
      createToolContext()
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Tool execution failed');
    expect(result.content).toContain('API down');
  });

  it('handles null result from handler gracefully', async () => {
    const { handleReminderCreation } = await import('../handlers/reminder.js');
    vi.mocked(handleReminderCreation).mockResolvedValueOnce(null);

    const result = await executeTool(
      'set_reminder',
      { text: 'invalid reminder' },
      createToolContext()
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Could not parse');
  });
});
