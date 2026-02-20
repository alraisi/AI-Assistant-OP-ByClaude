import { getConfig } from '../config/index.js';

export interface SanitizeOptions {
  removePhoneNumbers?: boolean;
  removeEmails?: boolean;
  removeCreditCards?: boolean;
  removeSSN?: boolean;
  removeApiKeys?: boolean;
}

const PHONE_PATTERN = /\b\d{10,15}\b/g;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const CREDIT_CARD_PATTERN = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
const SSN_PATTERN = /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g;
const API_KEY_PATTERN = /\b(sk-[a-zA-Z0-9]{20,}|[a-zA-Z0-9]{32,})\b/g;

export function sanitizeForLogging(
  text: string,
  options: SanitizeOptions = {}
): string {
  const config = getConfig();

  if (!config.enablePrivacyFilter) {
    return text;
  }

  let sanitized = text;

  const defaultOptions: SanitizeOptions = {
    removePhoneNumbers: true,
    removeEmails: true,
    removeCreditCards: true,
    removeSSN: true,
    removeApiKeys: true,
    ...options,
  };

  if (defaultOptions.removePhoneNumbers) {
    sanitized = sanitized.replace(PHONE_PATTERN, '[PHONE]');
  }

  if (defaultOptions.removeEmails) {
    sanitized = sanitized.replace(EMAIL_PATTERN, '[EMAIL]');
  }

  if (defaultOptions.removeCreditCards) {
    sanitized = sanitized.replace(CREDIT_CARD_PATTERN, '[CARD]');
  }

  if (defaultOptions.removeSSN) {
    sanitized = sanitized.replace(SSN_PATTERN, '[SSN]');
  }

  if (defaultOptions.removeApiKeys) {
    sanitized = sanitized.replace(API_KEY_PATTERN, '[API_KEY]');
  }

  return sanitized;
}

export function containsSensitiveData(text: string): boolean {
  return (
    PHONE_PATTERN.test(text) ||
    EMAIL_PATTERN.test(text) ||
    CREDIT_CARD_PATTERN.test(text) ||
    SSN_PATTERN.test(text) ||
    API_KEY_PATTERN.test(text)
  );
}

export function sanitizeJid(jid: string): string {
  // Remove the phone number portion for logging
  const parts = jid.split('@');
  if (parts.length === 2) {
    const number = parts[0];
    if (number.length > 4) {
      return `***${number.slice(-4)}@${parts[1]}`;
    }
  }
  return jid;
}

export interface PrivacyGuard {
  canShareWithGroup(content: string, sourceJid: string, targetGroupJid: string): boolean;
  canMentionUser(userJid: string, inContext: string): boolean;
}

export const privacyGuard: PrivacyGuard = {
  canShareWithGroup(content: string, sourceJid: string, targetGroupJid: string): boolean {
    // Don't share content that appears to be from private DMs in groups
    if (content.includes('private') || content.includes('confidential')) {
      return false;
    }
    return true;
  },

  canMentionUser(userJid: string, inContext: string): boolean {
    // Don't mention users in contexts that might embarrass them
    const sensitiveContexts = ['mistake', 'error', 'wrong', 'fail'];
    const contextLower = inContext.toLowerCase();

    for (const sensitive of sensitiveContexts) {
      if (contextLower.includes(sensitive)) {
        return false;
      }
    }
    return true;
  },
};
