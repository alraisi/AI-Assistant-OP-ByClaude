import { parseMentions, type MentionInfo } from './mention-parser.js';
import type { WAMessage } from '@whiskeysockets/baileys';
import { getConfig } from '../config/index.js';
import { getGroupResponseRate } from '../handlers/group-admin.js';

export interface EtiquetteDecision {
  shouldRespond: boolean;
  reason: string;
  priority: 'high' | 'medium' | 'low' | 'none';
}

const BANTER_PATTERNS = [
  /^lol$/i,
  /^lmao$/i,
  /^haha+$/i,
  /^hehe+$/i,
  /^xd+$/i,
  /^gg$/i,
  /^rip$/i,
  /^bruh$/i,
  /^nice$/i,
  /^ok+$/i,
  /^k+$/i,
  /^yes$/i,
  /^no$/i,
  /^ya$/i,
  /^yep$/i,
  /^nope$/i,
  /^wow$/i,
  /^omg$/i,
  /^wtf$/i,
  /^ikr$/i,
  /^fr$/i,
  /^ngl$/i,
  /^tbh$/i,
];

const EMOJI_ONLY_PATTERN = /^[\p{Emoji}\s]+$/u;

const QUESTION_PATTERNS = [
  /\?$/,
  /^(what|who|where|when|why|how|can|could|would|should|is|are|do|does|did|will|have|has)/i,
  /anyone know/i,
  /does anyone/i,
  /can someone/i,
];

export async function evaluateGroupEtiquette(
  message: WAMessage,
  messageText: string,
  botJid: string,
  chatJid?: string
): Promise<EtiquetteDecision> {
  const config = getConfig();
  const mentionInfo = parseMentions(message, botJid);

  // Priority 1: Bot is directly mentioned
  if (mentionInfo.isBotMentioned) {
    return {
      shouldRespond: true,
      reason: 'Bot was @mentioned',
      priority: 'high',
    };
  }

  // Priority 2: Reply to bot's message
  if (mentionInfo.isReplyToBot) {
    return {
      shouldRespond: true,
      reason: 'Reply to bot message',
      priority: 'high',
    };
  }

  // Filter: Too short (but be more lenient)
  if (messageText.length < 5) {
    return {
      shouldRespond: false,
      reason: 'Message too short',
      priority: 'none',
    };
  }

  // Filter: Pure banter (single word responses)
  if (isBanter(messageText) && messageText.split(/\s+/).length <= 2) {
    return {
      shouldRespond: false,
      reason: 'Banter/casual message',
      priority: 'none',
    };
  }

  // Filter: Emoji only
  if (EMOJI_ONLY_PATTERN.test(messageText.trim())) {
    return {
      shouldRespond: false,
      reason: 'Emoji-only message',
      priority: 'none',
    };
  }

  // Priority 3: Contains a question
  if (isQuestion(messageText)) {
    return {
      shouldRespond: true,
      reason: 'Contains a question',
      priority: 'medium',
    };
  }

  // NEW: Respond to substantive messages with probability
  // This makes Buddy more conversational in groups
  const wordCount = messageText.split(/\s+/).length;
  if (wordCount >= 5 && chatJid) {
    // Get group's configured response rate (default 30%)
    const responseRate = await getGroupResponseRate(chatJid);
    
    if (responseRate > 0) {
      const shouldContribute = Math.random() < (responseRate / 100);
      
      if (shouldContribute) {
        return {
          shouldRespond: true,
          reason: 'Contributing to conversation',
          priority: 'low',
        };
      }
    }
  }

  // Default: Don't respond to general chat
  return {
    shouldRespond: false,
    reason: 'General group chat',
    priority: 'none',
  };
}

function isBanter(text: string): boolean {
  const trimmed = text.trim().toLowerCase();

  // Check against banter patterns
  for (const pattern of BANTER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  // Check if it's just a few repeated characters
  if (/^(.)\1{2,}$/.test(trimmed)) {
    return true;
  }

  return false;
}

function isQuestion(text: string): boolean {
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

export function shouldShowTyping(decision: EtiquetteDecision): boolean {
  return decision.shouldRespond && decision.priority !== 'none';
}

export { parseMentions, type MentionInfo };
