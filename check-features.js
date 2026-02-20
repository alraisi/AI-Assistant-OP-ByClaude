#!/usr/bin/env node
/**
 * Feature Flag Checker
 * Run before starting the bot to verify features are enabled
 * 
 * Usage: npm run check
 */

import { config } from 'dotenv';
config();

// Phase 1: Safe Foundations
const phase1Features = [
  { name: 'URL Summarization', flag: 'FF_URL_SUMMARIZATION', phase: 1 },
  { name: 'Message Chunking', flag: 'FF_MESSAGE_CHUNKING', phase: 1 },
  { name: 'Sticker Creation', flag: 'FF_STICKER_CREATION', phase: 1 },
  { name: 'Reminder System', flag: 'FF_REMINDER_SYSTEM', phase: 1 },
];

// Phase 2: Core Enhancements
const phase2Features = [
  { name: 'Intent Classification', flag: 'FF_INTENT_CLASSIFICATION', phase: 2 },
  { name: 'Poll Creator', flag: 'FF_POLL_CREATOR', phase: 2 },
  { name: 'Semantic Memory Search', flag: 'FF_SEMANTIC_MEMORY', phase: 2 },
];

// Phase 3: Memory & Intelligence
const phase3Features = [
  { name: 'Auto Memory Extraction', flag: 'FF_AUTO_MEMORY_EXTRACTION', phase: 3 },
  { name: 'Conversation Summaries', flag: 'FF_CONVERSATION_SUMMARIES', phase: 3 },
  { name: 'Multi-Image Analysis', flag: 'FF_MULTI_IMAGE_ANALYSIS', phase: 3 },
];

// Phase 4: Advanced Features
const phase4Features = [
  { name: 'Video Analysis', flag: 'FF_VIDEO_ANALYSIS', phase: 4 },
  { name: 'Code Execution', flag: 'FF_CODE_EXECUTION', phase: 4 },
  { name: 'Calendar Integration', flag: 'FF_CALENDAR_INTEGRATION', phase: 4 },
  { name: 'Group Admin Controls', flag: 'FF_GROUP_ADMIN_CONTROLS', phase: 4 },
  { name: 'Group Knowledge Base', flag: 'FF_GROUP_KNOWLEDGE_BASE', phase: 4 },
];

const allFeatures = [...phase1Features, ...phase2Features, ...phase3Features, ...phase4Features];

const apiKeys = [
  { name: 'Anthropic (Claude)', flag: 'ANTHROPIC_API_KEY', required: true },
  { name: 'OpenAI', flag: 'OPENAI_API_KEY', required: true },
  { name: 'Gemini (Documents)', flag: 'GEMINI_API_KEY', required: false },
  { name: 'Serper (Web Search)', flag: 'SERPER_API_KEY', required: false },
];

console.log('\n========================================');
console.log('     BUDDY v4.0 Feature Check');
console.log('========================================\n');

// Phase 1
console.log('📦 Phase 1: Safe Foundations');
console.log('----------------------------------------');
let phase1Enabled = 0;
for (const feature of phase1Features) {
  const isEnabled = process.env[feature.flag] === 'true';
  const status = isEnabled ? '✅ ON ' : '⚪ OFF';
  console.log(`  ${status} - ${feature.name}`);
  if (isEnabled) phase1Enabled++;
}
console.log(`  (${phase1Enabled}/${phase1Features.length} enabled)\n`);

// Phase 2
console.log('🧠 Phase 2: Core Enhancements');
console.log('----------------------------------------');
let phase2Enabled = 0;
for (const feature of phase2Features) {
  const isEnabled = process.env[feature.flag] === 'true';
  const status = isEnabled ? '✅ ON ' : '⚪ OFF';
  console.log(`  ${status} - ${feature.name}`);
  if (isEnabled) phase2Enabled++;
}
console.log(`  (${phase2Enabled}/${phase2Features.length} enabled)\n`);

// Phase 3
console.log('🚀 Phase 3: Memory & Intelligence');
console.log('----------------------------------------');
let phase3Enabled = 0;
for (const feature of phase3Features) {
  const isEnabled = process.env[feature.flag] === 'true';
  const status = isEnabled ? '✅ ON ' : '⚪ OFF';
  console.log(`  ${status} - ${feature.name}`);
  if (isEnabled) phase3Enabled++;
}
console.log(`  (${phase3Enabled}/${phase3Features.length} enabled)\n`);

// Phase 4
console.log('🔥 Phase 4: Advanced Features');
console.log('----------------------------------------');
let phase4Enabled = 0;
for (const feature of phase4Features) {
  const isEnabled = process.env[feature.flag] === 'true';
  const status = isEnabled ? '✅ ON ' : '⚪ OFF';
  console.log(`  ${status} - ${feature.name}`);
  if (isEnabled) phase4Enabled++;
}
console.log(`  (${phase4Enabled}/${phase4Features.length} enabled)\n`);

const totalEnabled = phase1Enabled + phase2Enabled + phase3Enabled + phase4Enabled;
const totalFeatures = allFeatures.length;

console.log('========================================');
console.log(`   ${totalEnabled}/${totalFeatures} Features Enabled`);
console.log('========================================\n');

// API Keys
console.log('🔑 API Keys:');
console.log('----------------------------------------');
for (const key of apiKeys) {
  const isSet = process.env[key.flag] && process.env[key.flag].length > 10;
  const status = isSet ? '✅ Set' : (key.required ? '❌ MISSING' : '💤 Optional');
  console.log(`  ${status} - ${key.name}`);
}

console.log('\n========================================');

// Status summary
if (totalEnabled === 0) {
  console.log('⚠️  WARNING: No features enabled!');
  console.log('   Edit .env and set features to true');
  process.exit(1);
} else if (totalEnabled < totalFeatures) {
  console.log('💡 TIP: Some features are disabled.');
  console.log('   Enable them in .env for full functionality');
} else {
  console.log('🚀 All features enabled!');
}

console.log('========================================\n');
