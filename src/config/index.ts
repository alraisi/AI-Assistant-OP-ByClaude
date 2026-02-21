import { config as dotenvConfig } from 'dotenv';
import { ConfigSchema, type Config, FeatureFlagsSchema, type FeatureFlags } from './schema.js';

dotenvConfig();

function loadConfig(): Config {
  const rawConfig = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    serperApiKey: process.env.SERPER_API_KEY || undefined,
    geminiApiKey: process.env.GEMINI_API_KEY || undefined,
    anthropicModel: process.env.ANTHROPIC_MODEL,
    geminiModel: process.env.GEMINI_MODEL,
    geminiImageModel: process.env.GEMINI_IMAGE_MODEL,
    whisperModel: process.env.WHISPER_MODEL,
    ttsModel: process.env.TTS_MODEL,
    ttsVoice: process.env.TTS_VOICE as Config['ttsVoice'] | undefined,
    dalleModel: process.env.DALLE_MODEL,
    embeddingModel: process.env.EMBEDDING_MODEL,
    buddyName: process.env.BUDDY_NAME,
    buddyEmoji: process.env.BUDDY_EMOJI,
    memoryStoragePath: process.env.MEMORY_STORAGE_PATH,
    whatsappAuthPath: process.env.WHATSAPP_AUTH_PATH,
    groupResponseThreshold: process.env.GROUP_RESPONSE_THRESHOLD
      ? parseFloat(process.env.GROUP_RESPONSE_THRESHOLD)
      : undefined,
    groupMinMessageLength: process.env.GROUP_MIN_MESSAGE_LENGTH
      ? parseInt(process.env.GROUP_MIN_MESSAGE_LENGTH, 10)
      : undefined,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS
      ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
      : undefined,
    rateLimitMaxMessages: process.env.RATE_LIMIT_MAX_MESSAGES
      ? parseInt(process.env.RATE_LIMIT_MAX_MESSAGES, 10)
      : undefined,
    enablePrivacyFilter: process.env.ENABLE_PRIVACY_FILTER
      ? process.env.ENABLE_PRIVACY_FILTER === 'true'
      : undefined,
    logLevel: process.env.LOG_LEVEL as Config['logLevel'] | undefined,
    memoryRetentionDays: process.env.MEMORY_RETENTION_DAYS
      ? parseInt(process.env.MEMORY_RETENTION_DAYS, 10)
      : undefined,
    allowedNumbers: process.env.ALLOWED_NUMBERS,
  };

  // Remove undefined values so defaults apply
  const cleanedConfig = Object.fromEntries(
    Object.entries(rawConfig).filter(([_, v]) => v !== undefined)
  );

  const result = ConfigSchema.safeParse(cleanedConfig);

  if (!result.success) {
    console.error('Configuration validation failed:');
    result.error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }

  return result.data;
}

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

// Feature Flags Management
function loadFeatureFlags(): FeatureFlags {
  const rawFlags = {
    // Phase 1: Safe Foundations
    urlSummarization: process.env.FF_URL_SUMMARIZATION === 'true',
    translationMode: process.env.FF_TRANSLATION_MODE === 'true',
    messageChunking: process.env.FF_MESSAGE_CHUNKING === 'true',
    reminderSystem: process.env.FF_REMINDER_SYSTEM === 'true',
    stickerCreation: process.env.FF_STICKER_CREATION === 'true',
    
    // Phase 2: Core Enhancements
    intentClassification: process.env.FF_INTENT_CLASSIFICATION === 'true',
    pollCreator: process.env.FF_POLL_CREATOR === 'true',
    
    // Phase 3: Memory & Intelligence
    semanticMemory: process.env.FF_SEMANTIC_MEMORY === 'true',
    autoMemoryExtraction: process.env.FF_AUTO_MEMORY_EXTRACTION === 'true',
    conversationSummaries: process.env.FF_CONVERSATION_SUMMARIES === 'true',
    multiImageAnalysis: process.env.FF_MULTI_IMAGE_ANALYSIS === 'true',
    
    // Phase 4: Advanced Features
    videoAnalysis: process.env.FF_VIDEO_ANALYSIS === 'true',
    codeExecution: process.env.FF_CODE_EXECUTION === 'true',
    calendarIntegration: process.env.FF_CALENDAR_INTEGRATION === 'true',
    groupAdminControls: process.env.FF_GROUP_ADMIN_CONTROLS === 'true',
    groupKnowledgeBase: process.env.FF_GROUP_KNOWLEDGE_BASE === 'true',
    
    // Phase 5: Architecture
    pluginSystem: process.env.FF_PLUGIN_SYSTEM === 'true',
    webhookSystem: process.env.FF_WEBHOOK_SYSTEM === 'true',
  };

  const result = FeatureFlagsSchema.safeParse(rawFlags);

  if (!result.success) {
    console.error('Feature flags validation failed:');
    result.error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    // Return defaults instead of crashing
    return FeatureFlagsSchema.parse({});
  }

  return result.data;
}

let featureFlags: FeatureFlags | null = null;

export function getFeatureFlags(): FeatureFlags {
  if (!featureFlags) {
    featureFlags = loadFeatureFlags();
  }
  return featureFlags;
}

/**
 * Check if a specific feature is enabled
 * @param flag - The feature flag to check
 * @returns true if the feature is enabled
 * @example
 * if (isEnabled('urlSummarization')) {
 *   // Handle URL summarization
 * }
 */
export function isEnabled(flag: keyof FeatureFlags): boolean {
  return getFeatureFlags()[flag];
}

/**
 * Reload feature flags from environment (useful for dynamic config changes)
 */
export function reloadFeatureFlags(): void {
  featureFlags = null; // Will be reloaded on next getFeatureFlags() call
}

export * from './schema.js';
