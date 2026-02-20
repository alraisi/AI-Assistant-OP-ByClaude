import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => true),
}));

const mockSemanticMemory = {
  initialize: vi.fn().mockResolvedValue(undefined),
  search: vi.fn().mockResolvedValue([]),
  getStats: vi.fn(() => ({ totalEntries: 100, lastUpdated: new Date('2025-06-15') })),
  indexExistingMemories: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../memory/semantic.js', () => ({
  getSemanticMemory: vi.fn(() => mockSemanticMemory),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleSemanticSearch } from './semantic-search.js';
import { isEnabled } from '../config/index.js';
import { createMockSocket, createTextMessage, createContext } from '../__tests__/test-helpers.js';

const mockIsEnabled = vi.mocked(isEnabled);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockReturnValue(true);
  mockSemanticMemory.search.mockResolvedValue([]);
  mockSemanticMemory.getStats.mockReturnValue({ totalEntries: 100, lastUpdated: new Date('2025-06-15') });
});

describe('handleSemanticSearch', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleSemanticSearch(sock, createTextMessage('search'), 'search memories: test', createContext());
    expect(result).toBeNull();
  });

  it('returns null when text has no search pattern', async () => {
    const sock = createMockSocket();
    const result = await handleSemanticSearch(sock, createTextMessage('hello'), 'hello world', createContext());
    expect(result).toBeNull();
  });

  it('handles stats command', async () => {
    const sock = createMockSocket();
    const result = await handleSemanticSearch(sock, createTextMessage('/semantic stats'), '/semantic stats', createContext());

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.response).toContain('100');
  });

  it('handles index command', async () => {
    const sock = createMockSocket();
    const result = await handleSemanticSearch(sock, createTextMessage('/semantic index'), '/semantic index', createContext());

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.response).toContain('Indexing');
  });

  it('returns no-results message when search finds nothing', async () => {
    const sock = createMockSocket();
    const result = await handleSemanticSearch(
      sock,
      createTextMessage('search memories: unicorns'),
      'search memories: unicorns',
      createContext(),
    );

    expect(result!.response).toContain("couldn't find");
  });

  it('returns search results', async () => {
    mockSemanticMemory.search.mockResolvedValue([
      { text: 'We talked about pizza last week', source: 'daily-notes', score: 0.85 },
      { text: 'Pizza party was fun', source: 'long-term', score: 0.72 },
    ]);
    const sock = createMockSocket();

    const result = await handleSemanticSearch(
      sock,
      createTextMessage('search memories: pizza'),
      'search memories: pizza',
      createContext(),
    );

    expect(result!.success).toBe(true);
    expect(result!.response).toContain('pizza');
    expect(result!.response).toContain('85%');
  });

  it('recognises "do you remember" pattern', async () => {
    mockSemanticMemory.search.mockResolvedValue([
      { text: 'Birthday on June 15', source: 'long-term', score: 0.9 },
    ]);
    const sock = createMockSocket();

    const result = await handleSemanticSearch(
      sock,
      createTextMessage('do you remember my birthday'),
      'do you remember my birthday',
      createContext(),
    );

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
  });

  it('recognises "what did we talk about" pattern', async () => {
    mockSemanticMemory.search.mockResolvedValue([
      { text: 'Discussed project timeline', source: 'daily-notes', score: 0.8 },
    ]);
    const sock = createMockSocket();

    const result = await handleSemanticSearch(
      sock,
      createTextMessage('what did we talk about yesterday'),
      'what did we talk about yesterday',
      createContext(),
    );

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
  });

  it('returns error on failure', async () => {
    mockSemanticMemory.search.mockRejectedValue(new Error('vector db error'));
    const sock = createMockSocket();

    const result = await handleSemanticSearch(
      sock,
      createTextMessage('search memories: fail'),
      'search memories: fail',
      createContext(),
    );

    expect(result!.success).toBe(false);
    expect(result!.response).toContain('trouble');
  });
});
