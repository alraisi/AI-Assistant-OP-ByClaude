import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PersonaConfig } from '../src/setup/persona-config.js';
import { PERSONALITY_DESCRIPTIONS, VERBOSITY_DESCRIPTIONS } from '../src/setup/persona-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Persona {
  soul: string;
  identity: string;
  agents: string;
}

let cachedPersona: Persona | null = null;

export async function loadPersona(): Promise<Persona> {
  if (cachedPersona) {
    return cachedPersona;
  }

  // Go up two levels from dist/persona to reach project root
  const projectRoot = join(__dirname, '..', '..');

  const [soul, identity, agents] = await Promise.all([
    readFile(join(projectRoot, 'persona', 'SOUL.md'), 'utf-8'),
    readFile(join(projectRoot, 'persona', 'IDENTITY.md'), 'utf-8'),
    readFile(join(projectRoot, 'persona', 'AGENTS.md'), 'utf-8'),
  ]);

  cachedPersona = { soul, identity, agents };
  return cachedPersona;
}

export function buildSystemPrompt(persona: Persona, context?: string, personaConfig?: PersonaConfig | null): string {
  const parts = [
    '# Your Core Identity',
    persona.soul,
    '',
    '# Your Identity Details',
    persona.identity,
    '',
    '# Your Behavioral Rules',
    persona.agents,
  ];

  // Merge persona config customizations
  if (personaConfig) {
    const personaParts: string[] = ['', '# Persona Customization'];

    if (personaConfig.personalityStyle) {
      const desc = PERSONALITY_DESCRIPTIONS[personaConfig.personalityStyle];
      personaParts.push(`Personality style: ${personaConfig.personalityStyle}. ${desc}`);
    }

    if (personaConfig.language && personaConfig.language !== 'English') {
      personaParts.push(`Primary language: Respond in ${personaConfig.language} unless the user writes in another language.`);
    }

    if (personaConfig.responseVerbosity) {
      const desc = VERBOSITY_DESCRIPTIONS[personaConfig.responseVerbosity];
      personaParts.push(`Response verbosity: ${personaConfig.responseVerbosity}. ${desc}`);
    }

    if (personaConfig.customInstructions) {
      personaParts.push(`Additional instructions: ${personaConfig.customInstructions}`);
    }

    parts.push(...personaParts);
  }

  if (context) {
    parts.push('', '# Conversation Context', context);
  }

  return parts.join('\n');
}

export function buildGroupSystemPrompt(
  persona: Persona,
  groupName: string,
  context?: string,
  personaConfig?: PersonaConfig | null
): string {
  const basePrompt = buildSystemPrompt(persona, context, personaConfig);

  return `${basePrompt}

# Current Context
You are in a group chat called "${groupName}".
Remember: Only respond when mentioned, replied to, or when you can add genuine value.
Keep responses concise and group-appropriate.`;
}

export function buildDMSystemPrompt(
  persona: Persona,
  userName: string,
  context?: string,
  personaConfig?: PersonaConfig | null
): string {
  const basePrompt = buildSystemPrompt(persona, context, personaConfig);

  return `${basePrompt}

# Current Context
You are in a direct conversation with ${userName}.
Be conversational and helpful. Remember past interactions if context is provided.`;
}
