import { z } from 'zod';

export const ConfigSchema = z.object({
  // API Keys
  anthropicApiKey: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  openaiApiKey: z.string().min(1, 'OPENAI_API_KEY is required'),
  serperApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),

  // Model Configuration
  anthropicModel: z.string().default('claude-sonnet-4-20250514'),
  geminiModel: z.string().default('gemini-2.0-flash'),
  geminiImageModel: z.string().default('gemini-2.0-flash-exp'),
  whisperModel: z.string().default('whisper-1'),
  ttsModel: z.string().default('tts-1'),
  ttsVoice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).default('nova'),
  dalleModel: z.string().default('dall-e-3'),
  embeddingModel: z.string().default('text-embedding-3-small'),

  // Buddy Configuration
  buddyName: z.string().default('Buddy'),
  buddyEmoji: z.string().default('🤖'),

  // Storage Paths
  memoryStoragePath: z.string().default('./buddy-memory'),
  whatsappAuthPath: z.string().default('./auth/baileys_auth_info'),

  // Group Chat Settings
  groupResponseThreshold: z.number().min(0).max(1).default(0.6),
  groupMinMessageLength: z.number().min(1).default(10),

  // Rate Limiting
  rateLimitWindowMs: z.number().min(1000).default(60000),
  rateLimitMaxMessages: z.number().min(1).default(20),

  // Safety
  enablePrivacyFilter: z.boolean().default(true),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Memory
  memoryRetentionDays: z.number().min(1).default(30),

  // Contact Whitelist
  allowedNumbers: z.string().default('all'),
});

export type Config = z.infer<typeof ConfigSchema>;

export const GroupEtiquetteSchema = z.object({
  banterPatterns: z.array(z.string()).default([
    'lol',
    'lmao',
    'haha',
    'hehe',
    'xd',
    '😂',
    '🤣',
    '😭',
    '💀',
    'gg',
    'rip',
    'bruh',
  ]),
  minMessageLength: z.number().default(10),
  responseThreshold: z.number().default(0.6),
});

export type GroupEtiquetteConfig = z.infer<typeof GroupEtiquetteSchema>;

export const MemoryConfigSchema = z.object({
  dailyNotesEnabled: z.boolean().default(true),
  longTermEnabled: z.boolean().default(true),
  maxContextMessages: z.number().default(20),
  maxDailyNoteSize: z.number().default(50000), // chars
  summarizeThreshold: z.number().default(40000), // chars
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

// Feature Flags for safe incremental development
export const FeatureFlagsSchema = z.object({
  // Phase 1: Safe Foundations
  urlSummarization: z.boolean().default(false),
  translationMode: z.boolean().default(false),
  messageChunking: z.boolean().default(false),
  reminderSystem: z.boolean().default(false),
  stickerCreation: z.boolean().default(false),
  
  // Phase 2: Core Enhancements
  intentClassification: z.boolean().default(false),
  pollCreator: z.boolean().default(false),
  
  // Phase 3: Memory & Intelligence
  semanticMemory: z.boolean().default(false),
  autoMemoryExtraction: z.boolean().default(false),
  conversationSummaries: z.boolean().default(false),
  multiImageAnalysis: z.boolean().default(false),
  
  // Phase 4: Advanced Features
  videoAnalysis: z.boolean().default(false),
  codeExecution: z.boolean().default(false),
  calendarIntegration: z.boolean().default(false),
  groupAdminControls: z.boolean().default(false),
  groupKnowledgeBase: z.boolean().default(false),
  
  // Phase 5: Architecture
  pluginSystem: z.boolean().default(false),
  webhookSystem: z.boolean().default(false),
});

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
