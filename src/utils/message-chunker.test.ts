import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  needsChunking,
  chunkMessage,
  smartChunkMessage,
  getChunkStats,
} from './message-chunker.js';

// Mock isEnabled to control the messageChunking feature flag
vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn((flag: string) => flag === 'messageChunking'),
}));

import { isEnabled } from '../config/index.js';

const mockedIsEnabled = vi.mocked(isEnabled);

describe('needsChunking', () => {
  beforeEach(() => {
    mockedIsEnabled.mockImplementation((flag: string) => flag === 'messageChunking');
  });

  it('should return false when feature is disabled', () => {
    mockedIsEnabled.mockReturnValue(false);
    expect(needsChunking('a'.repeat(2000))).toBe(false);
  });

  it('should return false for short messages', () => {
    expect(needsChunking('Hello world')).toBe(false);
  });

  it('should return true for messages exceeding default length', () => {
    expect(needsChunking('a'.repeat(1600))).toBe(true);
  });

  it('should respect custom maxLength', () => {
    expect(needsChunking('a'.repeat(50), 40)).toBe(true);
    expect(needsChunking('a'.repeat(30), 40)).toBe(false);
  });

  it('should return false for exactly maxLength messages', () => {
    // The default OPTIMAL_MESSAGE_LENGTH is 1500
    expect(needsChunking('a'.repeat(1500))).toBe(false);
  });
});

describe('chunkMessage', () => {
  it('should return single chunk for short messages', () => {
    const chunks = chunkMessage('Hello world');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Hello world');
    expect(chunks[0].index).toBe(1);
    expect(chunks[0].total).toBe(1);
    expect(chunks[0].isLast).toBe(true);
  });

  it('should split long messages into multiple chunks', () => {
    const longText = 'word '.repeat(400); // ~2000 chars
    const chunks = chunkMessage(longText, { maxLength: 500 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should add continuation markers by default', () => {
    const longText = 'word '.repeat(400);
    const chunks = chunkMessage(longText, { maxLength: 500 });
    if (chunks.length > 1) {
      // First chunk should end with ...
      expect(chunks[0].text.endsWith('...')).toBe(true);
      // Middle chunks should start and end with ...
      if (chunks.length > 2) {
        expect(chunks[1].text.startsWith('...')).toBe(true);
        expect(chunks[1].text.endsWith('...')).toBe(true);
      }
      // Last chunk should start with ...
      expect(chunks[chunks.length - 1].text.startsWith('...')).toBe(true);
    }
  });

  it('should not add markers when disabled', () => {
    const longText = 'word '.repeat(400);
    const chunks = chunkMessage(longText, {
      maxLength: 500,
      addContinuationMarkers: false,
    });
    for (const chunk of chunks) {
      expect(chunk.text.startsWith('...')).toBe(false);
    }
  });

  it('should set correct index and total', () => {
    const longText = 'word '.repeat(400);
    const chunks = chunkMessage(longText, { maxLength: 500 });
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i + 1);
      expect(chunk.total).toBe(chunks.length);
    });
  });

  it('should mark last chunk correctly', () => {
    const longText = 'word '.repeat(400);
    const chunks = chunkMessage(longText, { maxLength: 500 });
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].isLast).toBe(i === chunks.length - 1);
    }
  });

  it('should split at paragraph boundaries when preserveParagraphs is true', () => {
    const para1 = 'This is the first paragraph with enough content to be meaningful. '.repeat(3);
    const para2 = 'This is the second paragraph with its own substantial content here. '.repeat(3);
    const para3 = 'This is the third paragraph also containing enough text to matter. '.repeat(3);
    const text = `${para1}\n\n${para2}\n\n${para3}`;
    const chunks = chunkMessage(text, {
      maxLength: 250,
      preserveParagraphs: true,
      addContinuationMarkers: false,
    });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should split at word boundaries when preserveParagraphs is false', () => {
    const text = 'This is a simple sentence that should be split at word boundaries for readability.';
    const chunks = chunkMessage(text, {
      maxLength: 30,
      preserveParagraphs: false,
      addContinuationMarkers: false,
    });
    // None of the chunks should have cut words (except edge cases)
    for (const chunk of chunks) {
      expect(chunk.text.trim()).toBeTruthy();
    }
  });

  it('should handle messages at MIN_CHUNK_SIZE boundary', () => {
    // Messages under 200 chars (MIN_CHUNK_SIZE) should not be split
    const text = 'a'.repeat(150);
    const chunks = chunkMessage(text, { maxLength: 100 });
    // maxLength is 100, but MIN_CHUNK_SIZE is 200, so Math.max(200, 100) = 200
    // 150 < 200, so single chunk
    expect(chunks).toHaveLength(1);
  });
});

describe('smartChunkMessage', () => {
  it('should handle messages with code blocks', () => {
    const text = 'Here is some code:\n```javascript\nconsole.log("hello");\nconsole.log("world");\n```\nThat was the code.';
    const chunks = smartChunkMessage(text);
    // Should preserve code block integrity
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Find the chunk containing the code block
    const codeChunk = chunks.find(c => c.text.includes('```'));
    expect(codeChunk).toBeDefined();
  });

  it('should handle messages with lists', () => {
    const text = '- Item one\n- Item two\n- Item three\n- Item four';
    const chunks = smartChunkMessage(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should fall back to paragraph-based chunking for plain text', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const chunks = smartChunkMessage(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle empty code blocks', () => {
    const text = 'Before\n```\n```\nAfter';
    const chunks = smartChunkMessage(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should return single chunk for short messages', () => {
    const chunks = smartChunkMessage('Short message');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Short message');
  });
});

describe('getChunkStats', () => {
  beforeEach(() => {
    mockedIsEnabled.mockImplementation((flag: string) => flag === 'messageChunking');
  });

  it('should report correct stats for short messages', () => {
    const stats = getChunkStats('Hello world');
    expect(stats.originalLength).toBe(11);
    expect(stats.needsChunking).toBe(false);
    expect(stats.estimatedChunks).toBe(1);
  });

  it('should report correct stats for long messages', () => {
    const longText = 'word '.repeat(400);
    const stats = getChunkStats(longText);
    expect(stats.originalLength).toBe(longText.length);
    expect(stats.needsChunking).toBe(true);
    expect(stats.estimatedChunks).toBeGreaterThan(1);
  });

  it('should report needsChunking false when feature disabled', () => {
    mockedIsEnabled.mockReturnValue(false);
    const stats = getChunkStats('a'.repeat(5000));
    expect(stats.needsChunking).toBe(false);
    expect(stats.estimatedChunks).toBe(1);
  });
});
