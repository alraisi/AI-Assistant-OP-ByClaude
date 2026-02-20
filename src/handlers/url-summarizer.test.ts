import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => true),
}));

vi.mock('../tools/url-fetcher.js', () => ({
  extractUrl: vi.fn(() => null),
  fetchUrlContent: vi.fn().mockResolvedValue(null),
  formatUrlContent: vi.fn(() => 'formatted content'),
}));

vi.mock('../llm/index.js', () => ({
  getChatProvider: vi.fn(() => ({
    chat: vi.fn().mockResolvedValue({ content: 'AI summary of the article' }),
  })),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleUrlSummarization, generateUrlPreview } from './url-summarizer.js';
import { isEnabled } from '../config/index.js';
import { extractUrl, fetchUrlContent, formatUrlContent } from '../tools/url-fetcher.js';
import { getChatProvider } from '../llm/index.js';
import { createMockSocket, createContext } from '../__tests__/test-helpers.js';

const mockIsEnabled = vi.mocked(isEnabled);
const mockExtractUrl = vi.mocked(extractUrl);
const mockFetchUrlContent = vi.mocked(fetchUrlContent);
const mockFormatUrlContent = vi.mocked(formatUrlContent);
const mockGetChatProvider = vi.mocked(getChatProvider);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockReturnValue(true);
  mockExtractUrl.mockReturnValue(null);
  mockFetchUrlContent.mockResolvedValue(null);
  mockFormatUrlContent.mockReturnValue('formatted content');
  mockGetChatProvider.mockReturnValue({
    chat: vi.fn().mockResolvedValue({ content: 'AI summary of the article' }),
  } as any);
});

describe('handleUrlSummarization', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleUrlSummarization(sock, 'summarize https://example.com', createContext());
    expect(result).toBeNull();
  });

  it('returns null when no URL found', async () => {
    mockExtractUrl.mockReturnValue(null);
    const sock = createMockSocket();
    const result = await handleUrlSummarization(sock, 'hello world', createContext());
    expect(result).toBeNull();
  });

  it('returns null when URL present but no summarization intent', async () => {
    mockExtractUrl.mockReturnValue('https://example.com');
    const sock = createMockSocket();
    const result = await handleUrlSummarization(sock, 'check out https://example.com its cool', createContext());
    expect(result).toBeNull();
  });

  it('handles standalone URL (URL is the entire message)', async () => {
    mockExtractUrl.mockReturnValue('https://example.com/article');
    mockFetchUrlContent.mockResolvedValue({
      title: 'Test Article',
      description: 'A test article',
      content: 'A'.repeat(200),
      siteName: 'Example',
      author: 'Author',
      url: 'https://example.com/article',
    } as any);
    const sock = createMockSocket();

    const result = await handleUrlSummarization(sock, 'https://example.com/article', createContext());

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.response).toContain('Test Article');
  });

  it('handles summarize intent with URL', async () => {
    mockExtractUrl.mockReturnValue('https://example.com/article');
    mockFetchUrlContent.mockResolvedValue({
      title: 'Test Article',
      description: 'Desc',
      content: 'A'.repeat(200),
      siteName: 'Example',
      author: 'Author',
      url: 'https://example.com/article',
    } as any);
    const sock = createMockSocket();

    const result = await handleUrlSummarization(sock, 'summarize https://example.com/article', createContext());

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.response).toContain('AI summary');
  });

  it('returns error message when fetch fails', async () => {
    mockExtractUrl.mockReturnValue('https://example.com');
    mockFetchUrlContent.mockResolvedValue(null);
    const sock = createMockSocket();

    const result = await handleUrlSummarization(sock, 'https://example.com', createContext());

    expect(result).not.toBeNull();
    expect(result!.response).toContain("couldn't access");
  });

  it('returns formatted content when content is too short', async () => {
    mockExtractUrl.mockReturnValue('https://example.com');
    mockFetchUrlContent.mockResolvedValue({
      title: 'Short',
      description: '',
      content: 'tiny',
      siteName: 'Example',
      author: '',
      url: 'https://example.com',
    } as any);
    const sock = createMockSocket();

    const result = await handleUrlSummarization(sock, 'https://example.com', createContext());

    expect(result).not.toBeNull();
    expect(result!.response).toBe('formatted content');
  });

  it('shows typing indicator', async () => {
    mockExtractUrl.mockReturnValue('https://example.com');
    mockFetchUrlContent.mockResolvedValue({
      title: 'Article',
      description: 'Desc',
      content: 'A'.repeat(200),
      siteName: 'Ex',
      author: '',
      url: 'https://example.com',
    } as any);
    const sock = createMockSocket();
    const ctx = createContext();

    await handleUrlSummarization(sock, 'https://example.com', ctx);

    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('composing', ctx.chatJid);
  });

  it('stops typing after completion', async () => {
    mockExtractUrl.mockReturnValue('https://example.com');
    mockFetchUrlContent.mockResolvedValue({
      title: 'Article',
      description: 'Desc',
      content: 'A'.repeat(200),
      siteName: 'Ex',
      author: '',
      url: 'https://example.com',
    } as any);
    const sock = createMockSocket();
    const ctx = createContext();

    await handleUrlSummarization(sock, 'https://example.com', ctx);

    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('paused', ctx.chatJid);
  });

  it('returns graceful fallback on error', async () => {
    mockExtractUrl.mockReturnValue('https://example.com');
    mockFetchUrlContent.mockRejectedValue(new Error('network error'));
    const sock = createMockSocket();

    const result = await handleUrlSummarization(sock, 'https://example.com', createContext());

    expect(result).not.toBeNull();
    expect(result!.response).toContain('trouble summarizing');
  });

  it('recognises tldr intent', async () => {
    mockExtractUrl.mockReturnValue('https://example.com/article');
    mockFetchUrlContent.mockResolvedValue({
      title: 'Long Article',
      description: 'Desc',
      content: 'A'.repeat(200),
      siteName: 'Ex',
      author: '',
      url: 'https://example.com/article',
    } as any);
    const sock = createMockSocket();

    const result = await handleUrlSummarization(sock, 'tldr https://example.com/article', createContext());

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
  });
});

describe('generateUrlPreview', () => {
  it('returns formatted content for valid URL', async () => {
    mockFetchUrlContent.mockResolvedValue({
      title: 'Preview',
      description: 'Desc',
      content: 'content',
      siteName: 'Ex',
      author: '',
      url: 'https://example.com',
    } as any);

    const result = await generateUrlPreview('https://example.com');

    expect(result).toBe('formatted content');
  });

  it('returns null when fetch fails', async () => {
    mockFetchUrlContent.mockResolvedValue(null);

    const result = await generateUrlPreview('https://example.com');

    expect(result).toBeNull();
  });

  it('returns null on error', async () => {
    mockFetchUrlContent.mockRejectedValue(new Error('fail'));

    const result = await generateUrlPreview('https://example.com');

    expect(result).toBeNull();
  });
});
