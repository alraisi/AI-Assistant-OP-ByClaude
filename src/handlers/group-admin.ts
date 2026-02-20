/**
 * Group Admin Controls Handler
 * 
 * Auto-moderation, welcome messages, and group management features.
 */

import type { WASocket, WAMessage, GroupMetadata, GroupParticipant } from '@whiskeysockets/baileys';
import type { MessageContext } from '../llm/types.js';
import { getStorage, MemoryStorage } from '../memory/storage.js';
import { isEnabled } from '../config/index.js';
import pino from 'pino';

const logger = pino({ name: 'group-admin' });

const ADMIN_DIR = 'group-admin';
const CONFIG_FILE = 'admin-config.json';
const WELCOME_FILE = 'welcome-messages.json';

// Admin command patterns
const ADMIN_HELP_PATTERN = /^\/(?:admin|mod)\s+help$/i;
const SET_WELCOME_PATTERN = /^\/(?:set|add)\s+welcome\s+(.+)/is;
const REMOVE_WELCOME_PATTERN = /^\/(?:remove|delete)\s+welcome$/i;
const SHOW_WELCOME_PATTERN = /^\/(?:show|view)\s+welcome$/i;
const WARN_PATTERN = /^\/warn\s+(?:@?\w+)?/i;
const KICK_PATTERN = /^\/(?:kick|remove)\s+(?:@?\w+)?/i;
const MODERATION_TOGGLE_PATTERN = /^\/(?:enable|disable)\s+(spam|links|forwards)$/i;
const GROUP_INFO_PATTERN = /^\/(?:group|chat)\s+info$/i;
const SET_RESPONSE_RATE_PATTERN = /^\/(?:set\s+)?response(?:\s+rate)?\s*(\d+)$/i;

interface AdminConfig {
  moderation: {
    spamDetection: boolean;
    linkBlocking: boolean;
    forwardBlocking: boolean;
    maxMessagesPerMinute: number;
    bannedWords: string[];
  };
  welcomeMessages: boolean;
  autoDeleteSpam: boolean;
  botResponseRate: number; // 0-100, percentage of messages to respond to
}

interface WelcomeMessage {
  chatJid: string;
  message: string;
  setBy: string;
  setAt: string;
}

interface UserMessageTracker {
  [userJid: string]: {
    count: number;
    windowStart: number;
    warnings: number;
  };
}

// In-memory spam tracking (resets on restart)
const messageTracker: UserMessageTracker = {};
const SPAM_WINDOW_MS = 60000; // 1 minute
const SPAM_THRESHOLD = 10; // messages per minute

/**
 * Check if user is group admin
 */
async function isGroupAdmin(
  sock: WASocket,
  chatJid: string,
  userJid: string
): Promise<boolean> {
  try {
    const groupMetadata = await sock.groupMetadata(chatJid);
    const participant = groupMetadata.participants.find(p => p.id === userJid);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
  } catch (error) {
    logger.error({ error, chatJid, userJid }, 'Failed to check admin status');
    return false;
  }
}

/**
 * Get admin config for group
 */
async function getAdminConfig(
  storage: MemoryStorage,
  chatJid: string
): Promise<AdminConfig> {
  try {
    await storage.ensureDir(ADMIN_DIR);
    const fileName = `${ADMIN_DIR}/${chatJid.replace(/[^a-zA-Z0-9]/g, '_')}_${CONFIG_FILE}`;
    const data = await storage.readJson<AdminConfig>(fileName);
    
    if (data) return data;
  } catch {}
  
  // Return default config
  return {
    moderation: {
      spamDetection: true,
      linkBlocking: false,
      forwardBlocking: false,
      maxMessagesPerMinute: 10,
      bannedWords: [],
    },
    welcomeMessages: true,
    autoDeleteSpam: true,
    botResponseRate: 30, // Default: respond to 30% of messages
  };
}

/**
 * Save admin config
 */
async function saveAdminConfig(
  storage: MemoryStorage,
  chatJid: string,
  config: AdminConfig
): Promise<void> {
  await storage.ensureDir(ADMIN_DIR);
  const fileName = `${ADMIN_DIR}/${chatJid.replace(/[^a-zA-Z0-9]/g, '_')}_${CONFIG_FILE}`;
  await storage.writeJson(fileName, config);
}

/**
 * Get welcome message for group
 */
async function getWelcomeMessage(
  storage: MemoryStorage,
  chatJid: string
): Promise<string | null> {
  try {
    await storage.ensureDir(ADMIN_DIR);
    const data = await storage.readJson<Record<string, WelcomeMessage>>(`${ADMIN_DIR}/${WELCOME_FILE}`);
    return data?.[chatJid]?.message || null;
  } catch {
    return null;
  }
}

/**
 * Set welcome message
 */
async function setWelcomeMessage(
  storage: MemoryStorage,
  chatJid: string,
  message: string,
  setBy: string
): Promise<void> {
  await storage.ensureDir(ADMIN_DIR);
  const fileName = `${ADMIN_DIR}/${WELCOME_FILE}`;
  
  let data: Record<string, WelcomeMessage> = {};
  try {
    data = await storage.readJson<Record<string, WelcomeMessage>>(fileName) || {};
  } catch {}
  
  data[chatJid] = {
    chatJid,
    message,
    setBy,
    setAt: new Date().toISOString(),
  };
  
  await storage.writeJson(fileName, data);
}

/**
 * Remove welcome message
 */
async function removeWelcomeMessage(
  storage: MemoryStorage,
  chatJid: string
): Promise<void> {
  await storage.ensureDir(ADMIN_DIR);
  const fileName = `${ADMIN_DIR}/${WELCOME_FILE}`;
  
  let data: Record<string, WelcomeMessage> = {};
  try {
    data = await storage.readJson<Record<string, WelcomeMessage>>(fileName) || {};
  } catch {}
  
  delete data[chatJid];
  await storage.writeJson(fileName, data);
}

/**
 * Check if message is spam
 */
function isSpam(userJid: string): { isSpam: boolean; warnings: number } {
  const now = Date.now();
  
  if (!messageTracker[userJid]) {
    messageTracker[userJid] = { count: 1, windowStart: now, warnings: 0 };
    return { isSpam: false, warnings: 0 };
  }
  
  const tracker = messageTracker[userJid];
  
  // Reset window if expired
  if (now - tracker.windowStart > SPAM_WINDOW_MS) {
    tracker.count = 1;
    tracker.windowStart = now;
    return { isSpam: false, warnings: tracker.warnings };
  }
  
  tracker.count++;
  
  if (tracker.count > SPAM_THRESHOLD) {
    tracker.warnings++;
    return { isSpam: true, warnings: tracker.warnings };
  }
  
  return { isSpam: false, warnings: tracker.warnings };
}

/**
 * Check for links in message
 */
function containsLink(text: string): boolean {
  const linkPattern = /(https?:\/\/|www\.)[^\s]+/i;
  return linkPattern.test(text);
}

/**
 * Check for forwarded message
 */
function isForwarded(message: WAMessage): boolean {
  return message.message?.extendedTextMessage?.contextInfo?.isForwarded || false;
}

/**
 * Handle spam detection and moderation
 */
export async function handleModeration(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<{ shouldDelete: boolean; warning?: string } | null> {
  if (!isEnabled('groupAdminControls')) {
    return null;
  }
  
  if (!context.isGroup) {
    return null;
  }

  const storage = getStorage();
  const config = await getAdminConfig(storage, context.chatJid);
  
  if (!config.moderation.spamDetection && 
      !config.moderation.linkBlocking && 
      !config.moderation.forwardBlocking) {
    return null;
  }

  // Skip moderation for admins
  const isAdmin = await isGroupAdmin(sock, context.chatJid, context.senderJid);
  if (isAdmin) {
    return null;
  }

  // Check spam
  if (config.moderation.spamDetection) {
    const spamCheck = isSpam(context.senderJid);
    if (spamCheck.isSpam) {
      logger.info({
        user: context.senderJid,
        chat: context.chatJid,
        warnings: spamCheck.warnings,
      }, 'Spam detected');
      
      if (spamCheck.warnings >= 3) {
        return {
          shouldDelete: true,
          warning: `@${context.senderJid.split('@')[0]} has been removed for spamming.`,
        };
      }
      
      return {
        shouldDelete: config.autoDeleteSpam,
        warning: `@${context.senderJid.split('@')[0]} please slow down. Warning ${spamCheck.warnings}/3`,
      };
    }
  }

  // Check links
  if (config.moderation.linkBlocking && containsLink(text)) {
    return {
      shouldDelete: true,
      warning: `@${context.senderJid.split('@')[0]} links are not allowed in this group.`,
    };
  }

  // Check forwards
  if (config.moderation.forwardBlocking && isForwarded(message)) {
    return {
      shouldDelete: true,
      warning: `@${context.senderJid.split('@')[0]} forwarded messages are not allowed.`,
    };
  }

  return null;
}

/**
 * Handle new member welcome
 */
export async function handleNewMember(
  sock: WASocket,
  chatJid: string,
  newParticipants: string[]
): Promise<void> {
  if (!isEnabled('groupAdminControls')) {
    return;
  }

  const storage = getStorage();
  const config = await getAdminConfig(storage, chatJid);
  
  if (!config.welcomeMessages) {
    return;
  }

  const welcomeMessage = await getWelcomeMessage(storage, chatJid);
  if (!welcomeMessage) {
    return;
  }

  for (const participantJid of newParticipants) {
    const userTag = `@${participantJid.split('@')[0]}`;
    const personalizedMessage = welcomeMessage.replace(/@user/g, userTag);
    
    try {
      await sock.sendMessage(chatJid, {
        text: personalizedMessage,
        mentions: [participantJid],
      });
      
      logger.info({ user: participantJid, chat: chatJid }, 'Sent welcome message');
    } catch (error) {
      logger.error({ error, user: participantJid }, 'Failed to send welcome message');
    }
  }
}

/**
 * Handle admin commands
 */
export async function handleAdminCommand(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<{ response: string; success: boolean } | null> {
  if (!isEnabled('groupAdminControls')) {
    return null;
  }

  if (!context.isGroup) {
    return null;
  }

  const storage = getStorage();

  // Check admin status for all admin commands
  const isAdmin = await isGroupAdmin(sock, context.chatJid, context.senderJid);
  if (!isAdmin) {
    // Some commands can be checked without admin status (help)
    if (!text.match(ADMIN_HELP_PATTERN)) {
      return null;
    }
  }

  // Help command
  const helpMatch = text.match(ADMIN_HELP_PATTERN);
  if (helpMatch) {
    let helpText = '🛡️ *Group Admin Commands*\n\n';
    helpText += '*Welcome Messages:*\n';
    helpText += '• `/set welcome [message]` - Set welcome message\n';
    helpText += '  Use @user to mention new members\n';
    helpText += '• `/show welcome` - View current welcome\n';
    helpText += '• `/remove welcome` - Remove welcome\n\n';
    helpText += '*Moderation:*\n';
    helpText += '• `/enable spam` - Enable spam detection\n';
    helpText += '• `/disable links` - Disable link blocking\n';
    helpText += '• `/enable forwards` - Block forwarded msgs\n\n';
    helpText += '*Bot Behavior:*\n';
    helpText += '• `/response rate [0-100]` - Set response %\n';
    helpText += '  (e.g., `/response rate 50` for 50%)\n\n';
    helpText += '*Group Info:*\n';
    helpText += '• `/group info` - Show group stats\n\n';
    
    if (!isAdmin) {
      helpText += '_⚠️ You need admin rights to use these commands_';
    }

    return { response: helpText, success: true };
  }

  // Set welcome message
  const setWelcomeMatch = text.match(SET_WELCOME_PATTERN);
  if (setWelcomeMatch) {
    const welcomeMsg = setWelcomeMatch[1].trim();
    await setWelcomeMessage(storage, context.chatJid, welcomeMsg, context.senderJid);
    
    return {
      response: `✅ Welcome message set!\n\n"${welcomeMsg}"\n\n_New members will see this when they join._`,
      success: true,
    };
  }

  // Show welcome message
  if (text.match(SHOW_WELCOME_PATTERN)) {
    const welcomeMsg = await getWelcomeMessage(storage, context.chatJid);
    if (welcomeMsg) {
      return {
        response: `📋 *Current Welcome Message:*\n\n"${welcomeMsg}"`,
        success: true,
      };
    } else {
      return {
        response: '❌ No welcome message set.\n\nUse `/set welcome [message]` to set one.',
        success: false,
      };
    }
  }

  // Remove welcome message
  if (text.match(REMOVE_WELCOME_PATTERN)) {
    await removeWelcomeMessage(storage, context.chatJid);
    return {
      response: '✅ Welcome message removed.',
      success: true,
    };
  }

  // Toggle moderation features
  const moderationMatch = text.match(MODERATION_TOGGLE_PATTERN);
  if (moderationMatch) {
    const action = text.toLowerCase().startsWith('/enable') ? 'enable' : 'disable';
    const feature = moderationMatch[1];
    
    const config = await getAdminConfig(storage, context.chatJid);
    
    switch (feature) {
      case 'spam':
        config.moderation.spamDetection = action === 'enable';
        break;
      case 'links':
        config.moderation.linkBlocking = action === 'enable';
        break;
      case 'forwards':
        config.moderation.forwardBlocking = action === 'enable';
        break;
    }
    
    await saveAdminConfig(storage, context.chatJid, config);
    
    return {
      response: `✅ ${feature} detection ${action}d.`,
      success: true,
    };
  }

  // Group info
  if (text.match(GROUP_INFO_PATTERN)) {
    try {
      const metadata = await sock.groupMetadata(context.chatJid);
      const config = await getAdminConfig(storage, context.chatJid);
      
      let info = `📊 *Group Info*\n\n`;
      info += `*Name:* ${metadata.subject}\n`;
      info += `*Members:* ${metadata.participants.length}\n`;
      info += `*Created:* ${new Date(metadata.creation! * 1000).toLocaleDateString()}\n\n`;
      info += `*Moderation:*\n`;
      info += `• Spam detection: ${config.moderation.spamDetection ? '✅' : '❌'}\n`;
      info += `• Link blocking: ${config.moderation.linkBlocking ? '✅' : '❌'}\n`;
      info += `• Forward blocking: ${config.moderation.forwardBlocking ? '✅' : '❌'}\n`;
      info += `• Welcome messages: ${config.welcomeMessages ? '✅' : '❌'}\n\n`;
      info += `*Bot Settings:*\n`;
      info += `• Response rate: ${config.botResponseRate}%\n`;
      
      return { response: info, success: true };
    } catch (error) {
      return { response: '❌ Failed to get group info.', success: false };
    }
  }

  // Set response rate
  const responseRateMatch = text.match(SET_RESPONSE_RATE_PATTERN);
  if (responseRateMatch) {
    const rate = parseInt(responseRateMatch[1], 10);
    
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return {
        response: '❌ Invalid rate. Please use a number between 0 and 100.',
        success: false,
      };
    }
    
    const config = await getAdminConfig(storage, context.chatJid);
    config.botResponseRate = rate;
    await saveAdminConfig(storage, context.chatJid, config);
    
    return {
      response: `✅ Bot response rate set to ${rate}%.\n\n${rate === 0 ? '_Bot will only respond when @mentioned or replied to._' : `_Bot will respond to ~${rate}% of substantive messages._`}`,
      success: true,
    };
  }

  return null;
}

/**
 * Get group's bot response rate
 */
export async function getGroupResponseRate(chatJid: string): Promise<number> {
  const storage = getStorage();
  const config = await getAdminConfig(storage, chatJid);
  return config.botResponseRate;
}
