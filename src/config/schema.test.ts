import { describe, it, expect } from 'vitest';
import { ConfigSchema, FeatureFlagsSchema, MemoryConfigSchema, GroupEtiquetteSchema } from './schema.js';

describe('ConfigSchema', () => {
  it('should accept a valid full config', () => {
    const result = ConfigSchema.safeParse({
      anthropicApiKey: 'sk-ant-test123',
      openaiApiKey: 'sk-test456',
    });
    expect(result.success).toBe(true);
  });

  it('should require anthropicApiKey', () => {
    const result = ConfigSchema.safeParse({
      openaiApiKey: 'sk-test456',
    });
    expect(result.success).toBe(false);
  });

  it('should require openaiApiKey', () => {
    const result = ConfigSchema.safeParse({
      anthropicApiKey: 'sk-ant-test123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty anthropicApiKey', () => {
    const result = ConfigSchema.safeParse({
      anthropicApiKey: '',
      openaiApiKey: 'sk-test456',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty openaiApiKey', () => {
    const result = ConfigSchema.safeParse({
      anthropicApiKey: 'sk-ant-test123',
      openaiApiKey: '',
    });
    expect(result.success).toBe(false);
  });

  it('should apply default values for optional fields', () => {
    const result = ConfigSchema.parse({
      anthropicApiKey: 'sk-ant-test123',
      openaiApiKey: 'sk-test456',
    });
    expect(result.buddyName).toBe('Buddy');
    expect(result.buddyEmoji).toBe('\u{1F916}');
    expect(result.anthropicModel).toBe('claude-sonnet-4-20250514');
    expect(result.geminiModel).toBe('gemini-2.0-flash');
    expect(result.geminiImageModel).toBe('gemini-2.0-flash-exp');
    expect(result.whisperModel).toBe('whisper-1');
    expect(result.ttsModel).toBe('tts-1');
    expect(result.ttsVoice).toBe('nova');
    expect(result.dalleModel).toBe('dall-e-3');
    expect(result.embeddingModel).toBe('text-embedding-3-small');
    expect(result.memoryStoragePath).toBe('./buddy-memory');
    expect(result.whatsappAuthPath).toBe('./auth/baileys_auth_info');
    expect(result.logLevel).toBe('info');
    expect(result.enablePrivacyFilter).toBe(true);
    expect(result.memoryRetentionDays).toBe(30);
    expect(result.allowedNumbers).toBe('all');
  });

  it('should apply default rate limit values', () => {
    const result = ConfigSchema.parse({
      anthropicApiKey: 'key',
      openaiApiKey: 'key',
    });
    expect(result.rateLimitWindowMs).toBe(60000);
    expect(result.rateLimitMaxMessages).toBe(20);
  });

  it('should apply default group settings', () => {
    const result = ConfigSchema.parse({
      anthropicApiKey: 'key',
      openaiApiKey: 'key',
    });
    expect(result.groupResponseThreshold).toBe(0.6);
    expect(result.groupMinMessageLength).toBe(10);
  });

  it('should accept custom values that override defaults', () => {
    const result = ConfigSchema.parse({
      anthropicApiKey: 'key',
      openaiApiKey: 'key',
      buddyName: 'CustomBot',
      logLevel: 'debug',
      rateLimitMaxMessages: 50,
    });
    expect(result.buddyName).toBe('CustomBot');
    expect(result.logLevel).toBe('debug');
    expect(result.rateLimitMaxMessages).toBe(50);
  });

  it('should reject groupResponseThreshold below 0', () => {
    const result = ConfigSchema.safeParse({
      anthropicApiKey: 'key',
      openaiApiKey: 'key',
      groupResponseThreshold: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('should reject groupResponseThreshold above 1', () => {
    const result = ConfigSchema.safeParse({
      anthropicApiKey: 'key',
      openaiApiKey: 'key',
      groupResponseThreshold: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('should accept groupResponseThreshold boundary values 0 and 1', () => {
    expect(ConfigSchema.safeParse({
      anthropicApiKey: 'key', openaiApiKey: 'key',
      groupResponseThreshold: 0,
    }).success).toBe(true);

    expect(ConfigSchema.safeParse({
      anthropicApiKey: 'key', openaiApiKey: 'key',
      groupResponseThreshold: 1,
    }).success).toBe(true);
  });

  it('should reject rateLimitWindowMs below 1000', () => {
    const result = ConfigSchema.safeParse({
      anthropicApiKey: 'key',
      openaiApiKey: 'key',
      rateLimitWindowMs: 500,
    });
    expect(result.success).toBe(false);
  });

  it('should reject rateLimitMaxMessages below 1', () => {
    const result = ConfigSchema.safeParse({
      anthropicApiKey: 'key',
      openaiApiKey: 'key',
      rateLimitMaxMessages: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject memoryRetentionDays below 1', () => {
    const result = ConfigSchema.safeParse({
      anthropicApiKey: 'key',
      openaiApiKey: 'key',
      memoryRetentionDays: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid logLevel', () => {
    const result = ConfigSchema.safeParse({
      anthropicApiKey: 'key',
      openaiApiKey: 'key',
      logLevel: 'trace',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid logLevel values', () => {
    for (const level of ['debug', 'info', 'warn', 'error']) {
      const result = ConfigSchema.safeParse({
        anthropicApiKey: 'key',
        openaiApiKey: 'key',
        logLevel: level,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept optional serperApiKey and geminiApiKey', () => {
    const result = ConfigSchema.parse({
      anthropicApiKey: 'key',
      openaiApiKey: 'key',
      serperApiKey: 'serper-key',
      geminiApiKey: 'gemini-key',
    });
    expect(result.serperApiKey).toBe('serper-key');
    expect(result.geminiApiKey).toBe('gemini-key');
  });

  it('should allow groupMinMessageLength of 1', () => {
    const result = ConfigSchema.safeParse({
      anthropicApiKey: 'key',
      openaiApiKey: 'key',
      groupMinMessageLength: 1,
    });
    expect(result.success).toBe(true);
  });

  it('should reject groupMinMessageLength below 1', () => {
    const result = ConfigSchema.safeParse({
      anthropicApiKey: 'key',
      openaiApiKey: 'key',
      groupMinMessageLength: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('FeatureFlagsSchema', () => {
  it('should default all flags to false', () => {
    const result = FeatureFlagsSchema.parse({});
    expect(result.urlSummarization).toBe(false);
    expect(result.translationMode).toBe(false);
    expect(result.messageChunking).toBe(false);
    expect(result.reminderSystem).toBe(false);
    expect(result.stickerCreation).toBe(false);
    expect(result.intentClassification).toBe(false);
    expect(result.pollCreator).toBe(false);
    expect(result.semanticMemory).toBe(false);
    expect(result.autoMemoryExtraction).toBe(false);
    expect(result.conversationSummaries).toBe(false);
    expect(result.multiImageAnalysis).toBe(false);
    expect(result.videoAnalysis).toBe(false);
    expect(result.codeExecution).toBe(false);
    expect(result.calendarIntegration).toBe(false);
    expect(result.groupAdminControls).toBe(false);
    expect(result.groupKnowledgeBase).toBe(false);
    expect(result.pluginSystem).toBe(false);
    expect(result.webhookSystem).toBe(false);
  });

  it('should accept enabled flags', () => {
    const result = FeatureFlagsSchema.parse({
      urlSummarization: true,
      codeExecution: true,
    });
    expect(result.urlSummarization).toBe(true);
    expect(result.codeExecution).toBe(true);
    expect(result.translationMode).toBe(false);
  });

  it('should accept a full set of flags', () => {
    const allTrue = Object.fromEntries(
      Object.keys(FeatureFlagsSchema.shape).map(k => [k, true])
    );
    const result = FeatureFlagsSchema.parse(allTrue);
    for (const key of Object.keys(result)) {
      expect((result as any)[key]).toBe(true);
    }
  });
});

describe('MemoryConfigSchema', () => {
  it('should apply defaults', () => {
    const result = MemoryConfigSchema.parse({});
    expect(result.dailyNotesEnabled).toBe(true);
    expect(result.longTermEnabled).toBe(true);
    expect(result.maxContextMessages).toBe(20);
    expect(result.maxDailyNoteSize).toBe(50000);
    expect(result.summarizeThreshold).toBe(40000);
  });

  it('should accept custom values', () => {
    const result = MemoryConfigSchema.parse({
      dailyNotesEnabled: false,
      maxContextMessages: 50,
    });
    expect(result.dailyNotesEnabled).toBe(false);
    expect(result.maxContextMessages).toBe(50);
  });
});

describe('GroupEtiquetteSchema', () => {
  it('should apply default banter patterns', () => {
    const result = GroupEtiquetteSchema.parse({});
    expect(result.banterPatterns).toContain('lol');
    expect(result.banterPatterns).toContain('bruh');
    expect(result.banterPatterns.length).toBeGreaterThan(0);
  });

  it('should apply default thresholds', () => {
    const result = GroupEtiquetteSchema.parse({});
    expect(result.minMessageLength).toBe(10);
    expect(result.responseThreshold).toBe(0.6);
  });

  it('should accept custom banter patterns', () => {
    const result = GroupEtiquetteSchema.parse({
      banterPatterns: ['custom1', 'custom2'],
    });
    expect(result.banterPatterns).toEqual(['custom1', 'custom2']);
  });

  it('should accept custom thresholds', () => {
    const result = GroupEtiquetteSchema.parse({
      minMessageLength: 5,
      responseThreshold: 0.9,
    });
    expect(result.minMessageLength).toBe(5);
    expect(result.responseThreshold).toBe(0.9);
  });
});
