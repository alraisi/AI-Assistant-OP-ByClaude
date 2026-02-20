import { getBuddy } from './buddy.js';
import { getConfig, reloadFeatureFlags } from './config/index.js';
import {
  loadPersonaConfig,
  savePersonaConfig,
  runSetupWizard,
  setPersonaConfig,
} from './setup/index.js';
import pino from 'pino';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const logger = pino({
  name: 'buddy-main',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

/**
 * Update .env file with new values
 */
function updateEnvFile(updates: Record<string, string>): void {
  const envPath = join(process.cwd(), '.env');
  let envContent = '';
  
  // Read existing .env if it exists
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf-8');
  }
  
  // Parse existing env vars
  const envVars: Record<string, string> = {};
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      envVars[match[1]] = match[2];
    }
  });
  
  // Merge updates
  Object.assign(envVars, updates);
  
  // Write back
  const newContent = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  writeFileSync(envPath, newContent + '\n', 'utf-8');
}

/**
 * Convert feature flags to env format
 */
function featuresToEnv(features: Record<string, boolean>): Record<string, string> {
  const env: Record<string, string> = {};
  
  const mapping: Record<string, string> = {
    urlSummarization: 'FF_URL_SUMMARIZATION',
    stickerCreation: 'FF_STICKER_CREATION',
    reminderSystem: 'FF_REMINDER_SYSTEM',
    messageChunking: 'FF_MESSAGE_CHUNKING',
    intentClassification: 'FF_INTENT_CLASSIFICATION',
    pollCreator: 'FF_POLL_CREATOR',
    semanticMemory: 'FF_SEMANTIC_MEMORY',
    autoMemoryExtraction: 'FF_AUTO_MEMORY_EXTRACTION',
    conversationSummaries: 'FF_CONVERSATION_SUMMARIES',
    multiImageAnalysis: 'FF_MULTI_IMAGE_ANALYSIS',
    videoAnalysis: 'FF_VIDEO_ANALYSIS',
    codeExecution: 'FF_CODE_EXECUTION',
    calendarIntegration: 'FF_CALENDAR_INTEGRATION',
    groupAdminControls: 'FF_GROUP_ADMIN_CONTROLS',
    groupKnowledgeBase: 'FF_GROUP_KNOWLEDGE_BASE',
  };
  
  Object.entries(features).forEach(([key, value]) => {
    const envKey = mapping[key];
    if (envKey) {
      env[envKey] = value ? 'true' : 'false';
    }
  });
  
  return env;
}

/**
 * Check if essential API keys are missing
 */
function checkApiKeys(): { missing: string[]; hasKeys: boolean } {
  const required = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];
  const optional = ['GEMINI_API_KEY', 'SERPER_API_KEY'];
  
  const missing = required.filter(key => !process.env[key]);
  const hasKeys = missing.length === 0;
  
  return { missing, hasKeys };
}

async function main(): Promise<void> {
  // Check for --setup flag or first run
  const forceSetup = process.argv.includes('--setup');
  const existingConfig = await loadPersonaConfig();
  
  // Pre-check API keys if not running setup
  if (!forceSetup && existingConfig?.setupCompleted) {
    const { missing, hasKeys } = checkApiKeys();
    if (!hasKeys) {
      console.log('\n' + '='.repeat(60));
      console.log('  ⚠️  Missing Required API Keys');
      console.log('='.repeat(60));
      console.log('  The following required API keys are missing:');
      missing.forEach(key => console.log(`    • ${key}`));
      console.log('');
      console.log('  Run with --setup flag to configure:');
      console.log('    npm start -- --setup');
      console.log('='.repeat(60) + '\n');
      process.exit(1);
    }
  }

  if (forceSetup || !existingConfig?.setupCompleted) {
    const wizardResult = await runSetupWizard();
    
    // Check if we got the enhanced result (with apiKeys and features)
    if ('persona' in wizardResult && 'apiKeys' in wizardResult && 'features' in wizardResult) {
      const { persona, apiKeys, features } = wizardResult;
      
      // Save persona config
      if (persona.setupCompleted) {
        await savePersonaConfig(persona);
      }
      setPersonaConfig(persona);
      
      // Apply to env vars for this session
      if (persona.botName) process.env.BUDDY_NAME = persona.botName;
      if (persona.botEmoji) process.env.BUDDY_EMOJI = persona.botEmoji;
      if (persona.allowedNumbers) process.env.ALLOWED_NUMBERS = persona.allowedNumbers;
      
      // Save API keys and features to .env
      const envUpdates: Record<string, string> = {};
      
      if (apiKeys.anthropicApiKey) envUpdates.ANTHROPIC_API_KEY = apiKeys.anthropicApiKey;
      if (apiKeys.openaiApiKey) envUpdates.OPENAI_API_KEY = apiKeys.openaiApiKey;
      if (apiKeys.geminiApiKey) envUpdates.GEMINI_API_KEY = apiKeys.geminiApiKey;
      if (apiKeys.serperApiKey) envUpdates.SERPER_API_KEY = apiKeys.serperApiKey;
      
      // Add feature flags
      Object.assign(envUpdates, featuresToEnv(features));
      
      updateEnvFile(envUpdates);
      
      // Reload environment variables for this process
      Object.entries(envUpdates).forEach(([key, value]) => {
        process.env[key] = value;
      });
      
      reloadFeatureFlags();
      
      console.log('\n  ✅ Configuration saved to .env');
      console.log(`  🔑 API Keys: ${Object.keys(apiKeys).filter(k => apiKeys[k as keyof typeof apiKeys]).length} configured`);
      console.log(`  🎯 Features: ${Object.values(features).filter(Boolean).length} / 15 enabled\n`);
    } else {
      // Legacy persona-only result (CLI mode)
      const persona = wizardResult;
      
      if (persona.setupCompleted) {
        await savePersonaConfig(persona);
      }
      setPersonaConfig(persona);
      
      if (persona.botName) process.env.BUDDY_NAME = persona.botName;
      if (persona.botEmoji) process.env.BUDDY_EMOJI = persona.botEmoji;
      if (persona.allowedNumbers) process.env.ALLOWED_NUMBERS = persona.allowedNumbers;
    }
  } else {
    setPersonaConfig(existingConfig);

    // Apply saved persona config to env vars
    if (existingConfig.botName) process.env.BUDDY_NAME = existingConfig.botName;
    if (existingConfig.botEmoji) process.env.BUDDY_EMOJI = existingConfig.botEmoji;
    if (existingConfig.allowedNumbers) process.env.ALLOWED_NUMBERS = existingConfig.allowedNumbers;
  }

  const config = getConfig();

  console.log(`
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║   ${config.buddyEmoji} ${config.buddyName.padEnd(32)}  ║
  ║   WhatsApp AI Assistant               ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
  `);

  const buddy = getBuddy();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await buddy.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await buddy.stop();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
    process.exit(1);
  });

  try {
    await buddy.start();
  } catch (error) {
    logger.error({ error }, 'Failed to start Buddy');
    process.exit(1);
  }
}

main();
