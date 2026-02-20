import { describe, it, expect, vi } from 'vitest';

// Mock all transitive dependencies to prevent side-effect imports
vi.mock('../config/index.js', () => ({
  getConfig: vi.fn(() => ({ serperApiKey: '' })),
  isEnabled: vi.fn(() => false),
}));

vi.mock('../llm/index.js', () => ({
  getChatProvider: vi.fn(),
}));

vi.mock('../memory/index.js', () => ({
  getMemoryOrchestrator: vi.fn(),
}));

vi.mock('../../persona/loader.js', () => ({
  loadPersona: vi.fn(),
  buildDMSystemPrompt: vi.fn(),
  buildGroupSystemPrompt: vi.fn(),
}));

vi.mock('../tools/web-search.js', () => ({
  getSearchProvider: vi.fn(),
  isSearchEnabled: vi.fn(() => false),
}));

vi.mock('../safety/privacy.js', () => ({
  sanitizeForLogging: vi.fn((t: string) => t),
}));

vi.mock('../setup/index.js', () => ({
  getPersonaConfig: vi.fn(),
}));

import { detectSearchIntent } from './search.js';

describe('detectSearchIntent', () => {
  it('should detect "search for Node.js tutorials"', () => {
    const result = detectSearchIntent('search for Node.js tutorials');
    expect(result.detected).toBe(true);
    expect(result.query).toBe('Node.js tutorials');
  });

  it('should detect "search best restaurants"', () => {
    const result = detectSearchIntent('search best restaurants');
    expect(result.detected).toBe(true);
    expect(result.query).toBe('best restaurants');
  });

  it('should detect "look up TypeScript documentation"', () => {
    const result = detectSearchIntent('look up TypeScript documentation');
    expect(result.detected).toBe(true);
    expect(result.query).toBe('TypeScript documentation');
  });

  it('should detect "google React hooks"', () => {
    const result = detectSearchIntent('google React hooks');
    expect(result.detected).toBe(true);
    expect(result.query).toBe('React hooks');
  });

  it('should detect "find info about climate change"', () => {
    const result = detectSearchIntent('find info about climate change');
    expect(result.detected).toBe(true);
    expect(result.query).toBe('climate change');
  });

  it('should detect "what is the latest news"', () => {
    const result = detectSearchIntent('what is the latest news');
    expect(result.detected).toBe(true);
  });

  it('should return detected: false for unrelated text', () => {
    const result = detectSearchIntent('Hello, how are you?');
    expect(result.detected).toBe(false);
    expect(result.query).toBe('');
  });

  it('should return detected: false for empty string', () => {
    const result = detectSearchIntent('');
    expect(result.detected).toBe(false);
    expect(result.query).toBe('');
  });
});
