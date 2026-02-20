import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => true),
}));

const mockStorage = {
  ensureDir: vi.fn().mockResolvedValue(undefined),
  readJson: vi.fn().mockResolvedValue(null),
  writeJson: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../memory/storage.js', () => ({
  getStorage: vi.fn(() => mockStorage),
  MemoryStorage: vi.fn(),
}));

vi.mock('../llm/index.js', () => ({
  getChatProvider: vi.fn(() => ({
    chat: vi.fn().mockResolvedValue({ content: 'NOT_FOUND' }),
  })),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleGroupKB } from './group-kb.js';
import { isEnabled } from '../config/index.js';
import { getChatProvider } from '../llm/index.js';
import { createMockSocket, createTextMessage, createGroupContext, createContext } from '../__tests__/test-helpers.js';

const mockIsEnabled = vi.mocked(isEnabled);
const mockGetChatProvider = vi.mocked(getChatProvider);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockReturnValue(true);
  mockStorage.readJson.mockResolvedValue(null);
  mockGetChatProvider.mockReturnValue({
    chat: vi.fn().mockResolvedValue({ content: 'NOT_FOUND' }),
  } as any);
});

describe('handleGroupKB', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleGroupKB(sock, createTextMessage('/kb add "test": value'), '/kb add "test": value', createGroupContext());
    expect(result).toBeNull();
  });

  it('returns null for DM context', async () => {
    const sock = createMockSocket();
    const result = await handleGroupKB(sock, createTextMessage('/faq list'), '/faq list', createContext({ isGroup: false }));
    expect(result).toBeNull();
  });

  it('adds knowledge entry', async () => {
    const sock = createMockSocket();
    const text = '/kb add "meeting time": Every Monday at 10am';
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage(text), text, ctx);

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(mockStorage.writeJson).toHaveBeenCalled();
  });

  it('adds FAQ entry', async () => {
    const sock = createMockSocket();
    const text = '/faq add Q: What is the dress code? A: Business casual';
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage(text), text, ctx);

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
  });

  it('lists FAQs when empty', async () => {
    const sock = createMockSocket();
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage('/faq list'), '/faq list', ctx);

    expect(result).not.toBeNull();
    expect(result!.response).toContain('No FAQs');
  });

  it('lists existing FAQs', async () => {
    mockStorage.readJson.mockResolvedValue({
      entries: [],
      faqs: [
        { id: 'faq_1', question: 'What is the wifi?', answer: 'Use guest network', askedCount: 5, addedBy: 'admin', addedAt: '2025-06-15' },
      ],
    });
    const sock = createMockSocket();
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage('/faq list'), '/faq list', ctx);

    expect(result!.success).toBe(true);
    expect(sock.sendMessage).toHaveBeenCalled();
  });

  it('sets group rules', async () => {
    const sock = createMockSocket();
    const text = '/set rules No spam, be respectful, no off-topic';
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage(text), text, ctx);

    expect(result!.success).toBe(true);
    expect(mockStorage.writeJson).toHaveBeenCalled();
  });

  it('shows group rules', async () => {
    mockStorage.readJson.mockResolvedValue({
      entries: [],
      faqs: [],
      rules: 'No spam, be respectful',
    });
    const sock = createMockSocket();
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage('/show rules'), '/show rules', ctx);

    expect(result!.success).toBe(true);
    expect(sock.sendMessage).toHaveBeenCalledWith(
      ctx.chatJid,
      expect.objectContaining({ text: expect.stringContaining('No spam') }),
      expect.any(Object),
    );
  });

  it('shows no-rules message when none set', async () => {
    const sock = createMockSocket();
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage('/show rules'), '/show rules', ctx);

    expect(result!.response).toContain('No rules set');
  });

  it('sets group topic', async () => {
    const sock = createMockSocket();
    const text = '/set topic JavaScript Discussion';
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage(text), text, ctx);

    expect(result!.success).toBe(true);
  });

  it('shows group topic', async () => {
    mockStorage.readJson.mockResolvedValue({
      entries: [],
      faqs: [],
      topic: 'JavaScript Discussion',
    });
    const sock = createMockSocket();
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage('/show topic'), '/show topic', ctx);

    expect(result!.success).toBe(true);
  });

  it('searches knowledge base', async () => {
    mockStorage.readJson.mockResolvedValue({
      entries: [{ id: 'kb_1', key: 'wifi password', value: 'guest123', addedBy: 'admin', addedAt: '2025-06-15', tags: [] }],
      faqs: [],
    });
    const sock = createMockSocket();
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage('/kb search wifi'), '/kb search wifi', ctx);

    expect(result!.success).toBe(true);
  });

  it('returns no-results for KB search', async () => {
    const sock = createMockSocket();
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage('/kb search unicorn'), '/kb search unicorn', ctx);

    expect(result!.response).toContain('No results');
  });

  it('returns null for unmatched text', async () => {
    const sock = createMockSocket();
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage('hello'), 'hello', ctx);

    expect(result).toBeNull();
  });

  it('answers questions from KB using exact match', async () => {
    mockStorage.readJson.mockResolvedValue({
      entries: [],
      faqs: [
        { id: 'faq_1', question: 'What is the wifi password?', answer: 'guest123', askedCount: 0, addedBy: 'admin', addedAt: '2025-06-15' },
      ],
    });
    const sock = createMockSocket();
    const ctx = createGroupContext();

    const result = await handleGroupKB(sock, createTextMessage('What is the wifi password?'), 'What is the wifi password?', ctx);

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
  });
});
