import { getConfig } from '../config/index.js';
import pino from 'pino';

const logger = pino({ name: 'whitelist' });

export interface WhitelistConfig {
  mode: 'all' | 'whitelist';
  allowedNumbers: Set<string>;
  allowedGroups: Set<string>;
}

function normalizeNumber(jid: string): string {
  // Strip @s.whatsapp.net, @g.us, and :device suffixes
  return jid
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@g\.us$/, '')
    .replace(/:\d+$/, '');
}

let cachedConfig: WhitelistConfig | null = null;

export function getWhitelistConfig(): WhitelistConfig {
  if (cachedConfig) return cachedConfig;

  const config = getConfig();
  const raw = config.allowedNumbers.trim().toLowerCase();

  if (raw === 'all' || raw === '') {
    cachedConfig = {
      mode: 'all',
      allowedNumbers: new Set(),
      allowedGroups: new Set(),
    };
  } else {
    const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const numbers = new Set<string>();
    const groups = new Set<string>();

    for (const entry of entries) {
      // Group JIDs contain @g.us or end with @g.us format
      if (entry.includes('@g.us') || entry.includes('-')) {
        groups.add(normalizeNumber(entry));
      } else {
        numbers.add(normalizeNumber(entry));
      }
    }

    cachedConfig = {
      mode: 'whitelist',
      allowedNumbers: numbers,
      allowedGroups: groups,
    };

    logger.info(
      { numbers: numbers.size, groups: groups.size },
      'Whitelist configured'
    );
  }

  return cachedConfig;
}

export function isAllowed(senderJid: string, chatJid: string): boolean {
  const config = getWhitelistConfig();

  if (config.mode === 'all') {
    return true;
  }

  // Check if the chat is a whitelisted group
  const normalizedChat = normalizeNumber(chatJid);
  if (chatJid.includes('@g.us') && config.allowedGroups.has(normalizedChat)) {
    return true;
  }

  // Check if the sender's number is whitelisted
  const normalizedSender = normalizeNumber(senderJid);
  if (config.allowedNumbers.has(normalizedSender)) {
    return true;
  }

  return false;
}

export function resetWhitelistCache(): void {
  cachedConfig = null;
}
