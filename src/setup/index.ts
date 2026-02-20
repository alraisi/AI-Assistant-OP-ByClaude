export {
  type PersonaConfig,
  type PersonalityStyle,
  type ResponseVerbosity,
  PersonaConfigSchema,
  loadPersonaConfig,
  savePersonaConfig,
  PERSONALITY_DESCRIPTIONS,
  VERBOSITY_DESCRIPTIONS,
} from './persona-config.js';

export { runSetupWizard, runCLIWizard, type WizardResult } from './wizard.js';
export { runWebWizard, setQRCode, setConnected } from './web-wizard.js';

import { type PersonaConfig } from './persona-config.js';

let cachedPersonaConfig: PersonaConfig | null = null;

export function getPersonaConfig(): PersonaConfig | null {
  return cachedPersonaConfig;
}

export function setPersonaConfig(config: PersonaConfig): void {
  cachedPersonaConfig = config;
}
