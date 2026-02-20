import type { WAMessage } from '@whiskeysockets/baileys';

export interface MentionInfo {
  mentionedJids: string[];
  isBotMentioned: boolean;
  isReplyToBot: boolean;
  quotedParticipant?: string;
  quotedMessage?: string;
}

export function parseMentions(
  message: WAMessage,
  botJid: string
): MentionInfo {
  const content = message.message;
  if (!content) {
    return {
      mentionedJids: [],
      isBotMentioned: false,
      isReplyToBot: false,
    };
  }

  // Get the message content based on type
  const extendedText = content.extendedTextMessage;
  const contextInfo = extendedText?.contextInfo ||
    content.imageMessage?.contextInfo ||
    content.videoMessage?.contextInfo ||
    content.audioMessage?.contextInfo;

  // Extract mentioned JIDs
  const mentionedJids = contextInfo?.mentionedJid || [];

  // Check if bot is mentioned
  const normalizedBotJid = normalizeJid(botJid);
  const isBotMentioned = mentionedJids.some(
    (jid) => normalizeJid(jid) === normalizedBotJid
  );

  // Check if this is a reply to bot's message
  const quotedParticipant = contextInfo?.participant;
  const isReplyToBot = quotedParticipant
    ? normalizeJid(quotedParticipant) === normalizedBotJid
    : false;

  // Extract quoted message text if available
  const quotedMessage = contextInfo?.quotedMessage?.conversation ||
    contextInfo?.quotedMessage?.extendedTextMessage?.text;

  return {
    mentionedJids,
    isBotMentioned,
    isReplyToBot,
    quotedParticipant: quotedParticipant ?? undefined,
    quotedMessage: quotedMessage ?? undefined,
  };
}

export function normalizeJid(jid: string): string {
  // Remove device suffix and normalize
  return jid.split(':')[0].split('@')[0];
}

export function extractTextMentions(text: string): string[] {
  // Extract @mentions from text (format: @1234567890)
  const mentionRegex = /@(\d+)/g;
  const matches = text.matchAll(mentionRegex);
  return Array.from(matches, (m) => m[1]);
}
