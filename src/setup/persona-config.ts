import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Go up to project root from dist/src/setup
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const CONFIG_FILE = join(PROJECT_ROOT, 'buddy-config.json');

export const PersonalityStyle = z.enum([
  'professional',
  'casual',
  'friendly',
  'witty',
  'empathetic',
  'concise',
]);
export type PersonalityStyle = z.infer<typeof PersonalityStyle>;

export const ResponseVerbosity = z.enum(['concise', 'balanced', 'verbose']);
export type ResponseVerbosity = z.infer<typeof ResponseVerbosity>;

export const PersonaConfigSchema = z.object({
  botName: z.string().min(1).default('Buddy'),
  botEmoji: z.string().default('\uD83E\uDD16'),
  personalityStyle: PersonalityStyle.default('friendly'),
  language: z.string().default('English'),
  responseVerbosity: ResponseVerbosity.default('balanced'),
  customInstructions: z.string().default(''),
  allowedNumbers: z.string().default('all'),
  setupCompleted: z.boolean().default(false),
});

export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;

export async function loadPersonaConfig(): Promise<PersonaConfig | null> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = PersonaConfigSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function savePersonaConfig(config: PersonaConfig): Promise<void> {
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export const PERSONALITY_DESCRIPTIONS: Record<PersonalityStyle, string> = {
  professional: 'Formal, polished, and business-appropriate. Clear and structured responses.',
  casual: 'Relaxed and laid-back. Uses informal language and slang naturally.',
  friendly: 'Warm, approachable, and conversational. Like talking to a good friend.',
  witty: 'Clever and humorous. Enjoys wordplay and light sarcasm.',
  empathetic: 'Caring and understanding. Focuses on emotional support and active listening.',
  concise: 'Brief and to the point. Minimal fluff, maximum information.',
};

export const VERBOSITY_DESCRIPTIONS: Record<ResponseVerbosity, string> = {
  concise: 'Short and direct responses. Gets to the point quickly.',
  balanced: 'Medium-length responses. Enough detail without being overwhelming.',
  verbose: 'Detailed and thorough responses. Explains things comprehensively.',
};
