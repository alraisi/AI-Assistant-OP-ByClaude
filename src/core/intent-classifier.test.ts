import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyIntent, getResponseStrategy, classifyBatch } from './intent-classifier.js';

// Mock dependencies
vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn((flag: string) => flag === 'intentClassification'),
}));

vi.mock('../llm/index.js', () => ({
  getChatProvider: vi.fn(() => ({
    chat: vi.fn().mockResolvedValue({ content: '{"intent":"unknown","confidence":0}' }),
  })),
}));

import { isEnabled } from '../config/index.js';

const mockedIsEnabled = vi.mocked(isEnabled);

describe('classifyIntent', () => {
  beforeEach(() => {
    mockedIsEnabled.mockImplementation((flag: string) => flag === 'intentClassification');
  });

  it('should return unknown when feature flag is disabled', async () => {
    mockedIsEnabled.mockReturnValue(false);
    const result = await classifyIntent('Hello');
    expect(result.intent).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  describe('greeting', () => {
    it('should classify "hi" as greeting', async () => {
      const result = await classifyIntent('hi');
      expect(result.intent).toBe('greeting');
    });

    it('should classify "hello" as greeting', async () => {
      const result = await classifyIntent('hello');
      expect(result.intent).toBe('greeting');
    });

    it('should classify "hey" as greeting', async () => {
      const result = await classifyIntent('hey');
      expect(result.intent).toBe('greeting');
    });

    it('should classify "hello buddy" as greeting', async () => {
      const result = await classifyIntent('hello buddy');
      expect(result.intent).toBe('greeting');
    });

    it('should classify "hi there" as greeting', async () => {
      const result = await classifyIntent('hi there');
      expect(result.intent).toBe('greeting');
    });
  });

  describe('farewell', () => {
    it('should classify "bye" as farewell', async () => {
      const result = await classifyIntent('bye');
      expect(result.intent).toBe('farewell');
    });

    it('should classify "goodbye" as farewell', async () => {
      const result = await classifyIntent('goodbye');
      expect(result.intent).toBe('farewell');
    });

    it('should classify "see you" as farewell', async () => {
      const result = await classifyIntent('see you');
      expect(result.intent).toBe('farewell');
    });
  });

  describe('thanks', () => {
    it('should classify "thanks" as thanks', async () => {
      const result = await classifyIntent('thanks');
      expect(result.intent).toBe('thanks');
    });

    it('should classify "thank you" as thanks', async () => {
      const result = await classifyIntent('thank you');
      expect(result.intent).toBe('thanks');
    });

    it('should classify "appreciate it" as thanks', async () => {
      const result = await classifyIntent('appreciate it');
      expect(result.intent).toBe('thanks');
    });
  });

  describe('image_generation', () => {
    it('should classify "create an image of a cat"', async () => {
      const result = await classifyIntent('create an image of a cat');
      expect(result.intent).toBe('image_generation');
    });

    it('should classify "generate a picture of sunset"', async () => {
      const result = await classifyIntent('generate a picture of sunset');
      expect(result.intent).toBe('image_generation');
    });

    it('should classify "draw a logo for my company"', async () => {
      const result = await classifyIntent('draw a logo for my company');
      expect(result.intent).toBe('image_generation');
    });

    it('should classify "design an icon for the app"', async () => {
      const result = await classifyIntent('design an icon for the app');
      expect(result.intent).toBe('image_generation');
    });
  });

  describe('document_creation', () => {
    it('should classify "create a PDF about cooking"', async () => {
      const result = await classifyIntent('create a PDF about cooking');
      expect(result.intent).toBe('document_creation');
    });

    it('should classify "generate a report on sales"', async () => {
      const result = await classifyIntent('generate a report on sales');
      expect(result.intent).toBe('document_creation');
    });

    it('should classify "make a word document about AI"', async () => {
      const result = await classifyIntent('make a word document about AI');
      expect(result.intent).toBe('document_creation');
    });
  });

  describe('url_summary', () => {
    it('should classify "summarize https://example.com"', async () => {
      const result = await classifyIntent('summarize https://example.com');
      expect(result.intent).toBe('url_summary');
      expect(result.entities.url).toBe('https://example.com');
    });

    it('should classify "what does this link say"', async () => {
      const result = await classifyIntent('what does this link say');
      expect(result.intent).toBe('url_summary');
    });
  });

  describe('reminder', () => {
    it('should classify "remind me to buy milk"', async () => {
      const result = await classifyIntent('remind me to buy milk');
      expect(result.intent).toBe('reminder');
    });

    it('should classify "set a reminder to call doctor"', async () => {
      const result = await classifyIntent('set a reminder to call doctor');
      expect(result.intent).toBe('reminder');
    });

    it('should classify "don\'t let me forget the meeting"', async () => {
      const result = await classifyIntent("don't let me forget the meeting");
      expect(result.intent).toBe('reminder');
    });
  });

  describe('search', () => {
    it('should classify "search for Node.js tutorials"', async () => {
      const result = await classifyIntent('search for Node.js tutorials');
      expect(result.intent).toBe('search');
      expect(result.entities.searchQuery).toBeTruthy();
    });

    it('should classify "look up best restaurants"', async () => {
      const result = await classifyIntent('look up best restaurants');
      expect(result.intent).toBe('search');
    });
  });

  describe('code_help', () => {
    it('should classify "write a function to sort arrays"', async () => {
      const result = await classifyIntent('write a function to sort arrays');
      expect(result.intent).toBe('code_help');
    });

    it('should classify "help me code a calculator"', async () => {
      const result = await classifyIntent('help me code a calculator');
      expect(result.intent).toBe('code_help');
    });

    it('should classify "debug this code error"', async () => {
      const result = await classifyIntent('debug this code error');
      expect(result.intent).toBe('code_help');
    });

    it('should classify "explain this code"', async () => {
      const result = await classifyIntent('explain this code');
      expect(result.intent).toBe('code_help');
    });
  });

  describe('question', () => {
    it('should classify messages ending with "?"', async () => {
      const result = await classifyIntent('What is the meaning of life?');
      expect(result.intent).toBe('question');
    });

    it('should classify "how do you work"', async () => {
      const result = await classifyIntent('how do you work');
      expect(result.intent).toBe('question');
    });
  });

  describe('entity extraction', () => {
    it('should extract URLs from messages', async () => {
      const result = await classifyIntent('summarize https://example.com/article');
      expect(result.entities.url).toBe('https://example.com/article');
    });

    it('should extract time references', async () => {
      const result = await classifyIntent('remind me tomorrow to buy milk');
      expect(result.entities.timeReference).toBe('tomorrow');
    });

    it('should extract target language for translation', async () => {
      const result = await classifyIntent('translate this to Spanish');
      expect(result.intent).toBe('translation');
      expect(result.entities.targetLanguage).toBe('Spanish');
    });

    it('should extract search query', async () => {
      const result = await classifyIntent('search for best TypeScript frameworks');
      expect(result.entities.searchQuery).toBe('best TypeScript frameworks');
    });
  });

  describe('confidence', () => {
    it('should return 0.8 confidence for pattern matches', async () => {
      const result = await classifyIntent('hello');
      expect(result.confidence).toBe(0.8);
    });
  });

  it('should return unknown for unrecognizable text', async () => {
    const result = await classifyIntent('asdkjfhaskldjfh');
    expect(result.intent).toBe('unknown');
    expect(result.confidence).toBe(0);
  });
});

describe('getResponseStrategy', () => {
  it('should return text type and medium priority for greeting', () => {
    const strategy = getResponseStrategy('greeting');
    expect(strategy.shouldRespond).toBe(true);
    expect(strategy.responseType).toBe('text');
    expect(strategy.priority).toBe('medium');
  });

  it('should return text type and low priority for farewell', () => {
    const strategy = getResponseStrategy('farewell');
    expect(strategy.shouldRespond).toBe(true);
    expect(strategy.responseType).toBe('text');
    expect(strategy.priority).toBe('low');
  });

  it('should return text type and low priority for thanks', () => {
    const strategy = getResponseStrategy('thanks');
    expect(strategy.priority).toBe('low');
  });

  it('should return image type and high priority for image_generation', () => {
    const strategy = getResponseStrategy('image_generation');
    expect(strategy.responseType).toBe('image');
    expect(strategy.priority).toBe('high');
  });

  it('should return document type for document_creation', () => {
    const strategy = getResponseStrategy('document_creation');
    expect(strategy.responseType).toBe('document');
    expect(strategy.priority).toBe('high');
  });

  it('should return high priority for question', () => {
    const strategy = getResponseStrategy('question');
    expect(strategy.priority).toBe('high');
  });

  it('should return high priority for search', () => {
    const strategy = getResponseStrategy('search');
    expect(strategy.priority).toBe('high');
  });

  it('should return high priority for code_help', () => {
    const strategy = getResponseStrategy('code_help');
    expect(strategy.priority).toBe('high');
  });

  it('should return medium priority for unknown', () => {
    const strategy = getResponseStrategy('unknown');
    expect(strategy.priority).toBe('medium');
    expect(strategy.shouldRespond).toBe(true);
  });

  it('should always set shouldRespond to true', () => {
    const intents = [
      'greeting', 'farewell', 'thanks', 'question', 'image_generation',
      'document_creation', 'url_summary', 'reminder', 'search',
      'code_help', 'casual_chat', 'unknown',
    ] as const;
    for (const intent of intents) {
      expect(getResponseStrategy(intent).shouldRespond).toBe(true);
    }
  });
});

describe('classifyBatch', () => {
  beforeEach(() => {
    mockedIsEnabled.mockImplementation((flag: string) => flag === 'intentClassification');
  });

  it('should classify multiple messages', async () => {
    const results = await classifyBatch(['hello', 'bye', 'thanks']);
    expect(results).toHaveLength(3);
    expect(results[0].intent).toBe('greeting');
    expect(results[1].intent).toBe('farewell');
    expect(results[2].intent).toBe('thanks');
  });

  it('should handle empty array', async () => {
    const results = await classifyBatch([]);
    expect(results).toHaveLength(0);
  });
});
