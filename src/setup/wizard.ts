import { createInterface } from 'readline/promises';
import { stdin, stdout } from 'process';
import {
  type PersonaConfig,
  type PersonalityStyle,
  type ResponseVerbosity,
  PERSONALITY_DESCRIPTIONS,
  VERBOSITY_DESCRIPTIONS,
} from './persona-config.js';
import { runWebWizard } from './web-wizard.js';

const PERSONALITY_OPTIONS: PersonalityStyle[] = [
  'professional',
  'casual',
  'friendly',
  'witty',
  'empathetic',
  'concise',
];

const VERBOSITY_OPTIONS: ResponseVerbosity[] = ['concise', 'balanced', 'verbose'];

export type WizardResult = 
  | { persona: PersonaConfig; apiKeys: Record<string, string>; features: Record<string, boolean> }
  | PersonaConfig;

export async function runSetupWizard(): Promise<WizardResult> {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('\n' + '='.repeat(50));
  console.log('  How would you like to configure Buddy?');
  console.log('='.repeat(50));
  console.log('  1. 🌐 GUI  — Opens in your browser (recommended)');
  console.log('  2. ⌨️  CLI  — Right here in the terminal');
  console.log('');

  const choice = (await rl.question('  Choose (1 or 2, default: 1): ')).trim();
  rl.close();

  if (choice === '2') {
    return runCLIWizard();
  }
  
  // Run enhanced web wizard
  const result = await runWebWizard();
  return {
    persona: result.persona,
    apiKeys: result.apiKeys,
    features: result.features,
  };
}

export async function runCLIWizard(): Promise<PersonaConfig> {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('\n' + '='.repeat(50));
  console.log('  Welcome to Buddy Setup Wizard!');
  console.log('  Let\'s configure your WhatsApp AI Assistant.');
  console.log('='.repeat(50) + '\n');

  try {
    // Bot Name
    const botName = (await rl.question('Bot name (default: Buddy): ')).trim() || 'Buddy';

    // Bot Emoji
    const botEmoji = (await rl.question('Bot emoji (default: 🤖): ')).trim() || '🤖';

    // Personality Style
    console.log('\nPersonality styles:');
    PERSONALITY_OPTIONS.forEach((style, i) => {
      console.log(`  ${i + 1}. ${style} - ${PERSONALITY_DESCRIPTIONS[style]}`);
    });
    const styleInput = (await rl.question('\nChoose a style (1-6, default: 3): ')).trim();
    const styleIndex = styleInput ? parseInt(styleInput, 10) - 1 : 2;
    const personalityStyle: PersonalityStyle =
      PERSONALITY_OPTIONS[styleIndex] ?? 'friendly';

    // Language
    const language = (await rl.question('\nPrimary language (default: English): ')).trim() || 'English';

    // Response Verbosity
    console.log('\nResponse verbosity:');
    VERBOSITY_OPTIONS.forEach((v, i) => {
      console.log(`  ${i + 1}. ${v} - ${VERBOSITY_DESCRIPTIONS[v]}`);
    });
    const verbosityInput = (await rl.question('\nChoose verbosity (1-3, default: 2): ')).trim();
    const verbosityIndex = verbosityInput ? parseInt(verbosityInput, 10) - 1 : 1;
    const responseVerbosity: ResponseVerbosity =
      VERBOSITY_OPTIONS[verbosityIndex] ?? 'balanced';

    // Custom Instructions
    console.log('\nCustom instructions (optional):');
    console.log('  Add any special instructions for your bot (press Enter to skip)');
    const customInstructions = (await rl.question('> ')).trim();

    // Contact Whitelist
    console.log('\nContact whitelist:');
    console.log('  1. Allow all contacts');
    console.log('  2. Specific numbers only');
    const whitelistChoice = (await rl.question('\nChoose (1-2, default: 1): ')).trim();

    let allowedNumbers = 'all';
    if (whitelistChoice === '2') {
      console.log('\nEnter phone numbers separated by commas.');
      console.log('  Use international format without + (country code + number)');
      console.log('  Example: 971501234567,14155551234');
      allowedNumbers = (await rl.question('> ')).trim() || 'all';
    }

    const config: PersonaConfig = {
      botName,
      botEmoji,
      personalityStyle,
      language,
      responseVerbosity,
      customInstructions,
      allowedNumbers,
      setupCompleted: true,
    };

    // Show summary
    console.log('\n' + '='.repeat(50));
    console.log('  Configuration Summary');
    console.log('='.repeat(50));
    console.log(`  Name:         ${config.botName} ${config.botEmoji}`);
    console.log(`  Personality:  ${config.personalityStyle}`);
    console.log(`  Language:     ${config.language}`);
    console.log(`  Verbosity:    ${config.responseVerbosity}`);
    console.log(`  Whitelist:    ${config.allowedNumbers === 'all' ? 'All contacts' : config.allowedNumbers}`);
    if (config.customInstructions) {
      console.log(`  Custom:       ${config.customInstructions.slice(0, 60)}${config.customInstructions.length > 60 ? '...' : ''}`);
    }
    console.log('='.repeat(50));

    const confirm = (await rl.question('\nSave this configuration? (Y/n): ')).trim().toLowerCase();
    if (confirm === 'n' || confirm === 'no') {
      console.log('Setup cancelled. Using defaults.');
      rl.close();
      return {
        botName: 'Buddy',
        botEmoji: '🤖',
        personalityStyle: 'friendly',
        language: 'English',
        responseVerbosity: 'balanced',
        customInstructions: '',
        allowedNumbers: 'all',
        setupCompleted: false,
      };
    }

    console.log('\nConfiguration saved!\n');
    rl.close();
    return config;
  } catch (error) {
    rl.close();
    throw error;
  }
}
