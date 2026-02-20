import { describe, it, expect, vi } from 'vitest';

// Mock heavy dependencies to prevent side-effect imports
vi.mock('../llm/index.js', () => ({
  generateImageWithFallback: vi.fn(),
  getChatProvider: vi.fn(),
  getDocumentGenerationProvider: vi.fn(),
}));

vi.mock('../tools/web-search.js', () => ({
  getSearchProvider: vi.fn(() => null),
}));

import { detectGenerationType } from './generate.js';

describe('detectGenerationType', () => {
  describe('image patterns', () => {
    it('should detect "create an image of a cat"', () => {
      expect(detectGenerationType('create an image of a cat')).toBe('image');
    });

    it('should detect "generate a picture of sunset"', () => {
      expect(detectGenerationType('generate a picture of sunset')).toBe('image');
    });

    it('should detect "make an illustration"', () => {
      expect(detectGenerationType('make an illustration of a tree')).toBe('image');
    });

    it('should detect "draw a picture of landscape"', () => {
      // Pattern requires action verb + image noun (image/picture/photo/etc.)
      expect(detectGenerationType('draw a picture of landscape')).toBe('image');
    });

    it('should detect "design a logo"', () => {
      expect(detectGenerationType('design a logo for my company')).toBe('image');
    });

    it('should detect "image of something"', () => {
      expect(detectGenerationType('image of a beautiful sunset')).toBe('image');
    });

    it('should detect "picture for my blog"', () => {
      expect(detectGenerationType('picture for my blog post')).toBe('image');
    });

    it('should detect "create artwork"', () => {
      expect(detectGenerationType('create artwork showing nature')).toBe('image');
    });

    it('should detect "generate an icon"', () => {
      expect(detectGenerationType('generate an icon for the app')).toBe('image');
    });
  });

  describe('document patterns', () => {
    it('should detect "create a PDF about cooking"', () => {
      expect(detectGenerationType('create a PDF about cooking')).toBe('document');
    });

    it('should detect "generate a report on sales"', () => {
      expect(detectGenerationType('generate a report on sales')).toBe('document');
    });

    it('should detect "make a word document"', () => {
      expect(detectGenerationType('make a word document about AI')).toBe('document');
    });

    it('should detect "create a presentation"', () => {
      expect(detectGenerationType('create a presentation about marketing')).toBe('document');
    });

    it('should detect "generate a guide"', () => {
      expect(detectGenerationType('generate a guide on TypeScript')).toBe('document');
    });

    it('should detect "write a document about"', () => {
      expect(detectGenerationType('write a document about climate change')).toBe('document');
    });
  });

  describe('no match', () => {
    it('should return "none" for plain text', () => {
      expect(detectGenerationType('Hello, how are you?')).toBe('none');
    });

    it('should return "none" for questions', () => {
      expect(detectGenerationType('What is the weather today?')).toBe('none');
    });

    it('should return "none" for empty string', () => {
      expect(detectGenerationType('')).toBe('none');
    });

    it('should return "none" for unrelated commands', () => {
      expect(detectGenerationType('remind me to buy milk')).toBe('none');
    });

    it('should return "none" for just mentioning image without action', () => {
      expect(detectGenerationType('I like that image')).toBe('none');
    });
  });
});
