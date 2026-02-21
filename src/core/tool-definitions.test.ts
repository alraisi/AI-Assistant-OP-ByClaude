import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => false),
  getConfig: vi.fn(() => ({
    serperApiKey: undefined,
  })),
}));

import { getAvailableTools } from './tool-definitions.js';
import { isEnabled, getConfig } from '../config/index.js';
import { createContext, createGroupContext } from '../__tests__/test-helpers.js';

const mockIsEnabled = vi.mocked(isEnabled);
const mockGetConfig = vi.mocked(getConfig);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockReturnValue(false);
  mockGetConfig.mockReturnValue({ serperApiKey: undefined } as any);
});

describe('getAvailableTools', () => {
  it('always includes generate_image and generate_document', () => {
    const tools = getAvailableTools(createContext());
    const names = tools.map((t) => t.name);

    expect(names).toContain('generate_image');
    expect(names).toContain('generate_document');
  });

  it('includes web_search when serperApiKey is configured', () => {
    mockGetConfig.mockReturnValue({ serperApiKey: 'test-key' } as any);

    const tools = getAvailableTools(createContext());
    const names = tools.map((t) => t.name);

    expect(names).toContain('web_search');
  });

  it('does not include web_search when serperApiKey is not set', () => {
    const tools = getAvailableTools(createContext());
    const names = tools.map((t) => t.name);

    expect(names).not.toContain('web_search');
  });

  it('includes reminder tools when reminderSystem is enabled', () => {
    mockIsEnabled.mockImplementation((flag) => flag === 'reminderSystem');

    const tools = getAvailableTools(createContext());
    const names = tools.map((t) => t.name);

    expect(names).toContain('set_reminder');
    expect(names).toContain('list_reminders');
    expect(names).toContain('cancel_reminder');
  });

  it('does not include reminder tools when disabled', () => {
    const tools = getAvailableTools(createContext());
    const names = tools.map((t) => t.name);

    expect(names).not.toContain('set_reminder');
    expect(names).not.toContain('list_reminders');
    expect(names).not.toContain('cancel_reminder');
  });

  it('includes poll tool only in group context with pollCreator enabled', () => {
    mockIsEnabled.mockImplementation((flag) => flag === 'pollCreator');

    const groupTools = getAvailableTools(createGroupContext());
    expect(groupTools.map((t) => t.name)).toContain('create_poll');

    const dmTools = getAvailableTools(createContext());
    expect(dmTools.map((t) => t.name)).not.toContain('create_poll');
  });

  it('includes admin_command only in group context with groupAdminControls enabled', () => {
    mockIsEnabled.mockImplementation((flag) => flag === 'groupAdminControls');

    const groupTools = getAvailableTools(createGroupContext());
    expect(groupTools.map((t) => t.name)).toContain('admin_command');

    const dmTools = getAvailableTools(createContext());
    expect(dmTools.map((t) => t.name)).not.toContain('admin_command');
  });

  it('includes knowledge_base only in group context with groupKnowledgeBase enabled', () => {
    mockIsEnabled.mockImplementation((flag) => flag === 'groupKnowledgeBase');

    const groupTools = getAvailableTools(createGroupContext());
    expect(groupTools.map((t) => t.name)).toContain('knowledge_base');

    const dmTools = getAvailableTools(createContext());
    expect(dmTools.map((t) => t.name)).not.toContain('knowledge_base');
  });

  it('includes summarize_url when urlSummarization is enabled', () => {
    mockIsEnabled.mockImplementation((flag) => flag === 'urlSummarization');

    const tools = getAvailableTools(createContext());
    expect(tools.map((t) => t.name)).toContain('summarize_url');
  });

  it('includes search_memory when semanticMemory is enabled', () => {
    mockIsEnabled.mockImplementation((flag) => flag === 'semanticMemory');

    const tools = getAvailableTools(createContext());
    expect(tools.map((t) => t.name)).toContain('search_memory');
  });

  it('includes summarize_chat when conversationSummaries is enabled', () => {
    mockIsEnabled.mockImplementation(
      (flag) => flag === 'conversationSummaries'
    );

    const tools = getAvailableTools(createContext());
    expect(tools.map((t) => t.name)).toContain('summarize_chat');
  });

  it('includes execute_code when codeExecution is enabled', () => {
    mockIsEnabled.mockImplementation((flag) => flag === 'codeExecution');

    const tools = getAvailableTools(createContext());
    expect(tools.map((t) => t.name)).toContain('execute_code');
  });

  it('includes calendar_command when calendarIntegration is enabled', () => {
    mockIsEnabled.mockImplementation(
      (flag) => flag === 'calendarIntegration'
    );

    const tools = getAvailableTools(createContext());
    expect(tools.map((t) => t.name)).toContain('calendar_command');
  });

  it('includes create_sticker when stickerCreation is enabled', () => {
    mockIsEnabled.mockImplementation((flag) => flag === 'stickerCreation');

    const tools = getAvailableTools(createContext());
    expect(tools.map((t) => t.name)).toContain('create_sticker');
  });

  it('never includes disabled tools', () => {
    // All flags off, no API keys
    const tools = getAvailableTools(createContext());

    // Only the always-available tools
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual([
      'generate_image',
      'generate_document',
    ]);
  });

  it('all tool definitions have valid input_schema', () => {
    // Enable everything
    mockIsEnabled.mockReturnValue(true);
    mockGetConfig.mockReturnValue({ serperApiKey: 'key' } as any);

    const tools = getAvailableTools(createGroupContext());

    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema.properties).toBeDefined();
      expect(tool.input_schema.required).toBeDefined();
      expect(tool.input_schema.required!.length).toBeGreaterThan(0);
    }
  });
});
