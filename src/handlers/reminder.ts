/**
 * Reminder Handler
 * Handles reminder creation, listing, and management commands
 */

import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import type { MessageContext } from '../llm/types.js';
import type { RouteResult } from '../core/message-router.js';
import { isEnabled } from '../config/index.js';
import { getReminderStorage } from '../reminders/storage.js';
import { getReminderScheduler } from '../reminders/scheduler.js';
import { parseTime, formatDateTime, formatRelativeTime, extractReminderText, containsTimeExpression } from '../reminders/time-parser.js';
import pino from 'pino';

const logger = pino({ name: 'reminder-handler' });

// Command patterns
const REMINDER_CREATE_PATTERNS = [
  /\bremind\s+me\s+(?:to\s+)?/i,
  /\bset\s+(?:a\s+)?reminder\s+(?:to\s+)?/i,
  /\breminder\s*:?\s*(?:to\s+)?/i,
  /\bdon'?t\s+let\s+me\s+forget\s+(?:to\s+)?/i,
  /\bremember\s+(?:to\s+)?/i,
];

const LIST_REMINDERS_PATTERN = /^\/(?:my\s+)?reminders?$/i;
const TEST_REMINDER_PATTERN = /^\/(?:test\s+)?reminder$/i;
const CANCEL_PATTERN = /^\/(?:cancel|delete|stop)\s+reminder\s+(\w+)$/i;
const SNOOZE_PATTERN = /\bsnooze\s+(?:for\s+)?(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs)/i;
const DONE_PATTERN = /\bdone|completed|finished\b/i;

/**
 * Check if text is a reminder creation request
 */
function isReminderRequest(text: string): boolean {
  for (const pattern of REMINDER_CREATE_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract raw time text from message (for debugging)
 */
function extractTimeText(text: string): string {
  const timePatterns = [
    /\bin\s+\d+\s+(?:minute|minutes|min|mins|hour|hours|hr|hrs|day|days)\b/i,
    /\bat\s+\d{1,2}:?\d{2}?\s*(?:am|pm)?\b/i,
    /\btomorrow\b/i,
    /\btoday\b/i,
    /\bevery\s+(?:day|week)\b/i,
  ];
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return '';
}

/**
 * Handle reminder creation
 */
export async function handleReminderCreation(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('reminderSystem')) {
    return null;
  }

  // Check if it's a reminder request
  if (!isReminderRequest(text)) {
    return null;
  }

  try {
    logger.info({ chat: context.chatJid }, 'Processing reminder creation');

    // Parse time from the text
    const timeResult = parseTime(text);
    
    if (!timeResult) {
      return {
        response: `⏰ I couldn't understand when to remind you.\n\nTry saying:\n` +
                 `• "Remind me to call mom in 30 minutes"\n` +
                 `• "Remind me to take medicine at 8pm"\n` +
                 `• "Remind me tomorrow at 9am to go to the gym"\n` +
                 `• "Remind me every day at 10am to drink water"`,
        success: true,
        contentType: 'text',
      };
    }

    // Extract the reminder message
    const reminderText = extractReminderText(text);
    
    if (!reminderText || reminderText.length < 3) {
      return {
        response: `⏰ What should I remind you about?\n\n` +
                 `Example: "Remind me to call mom in 30 minutes"`,
        success: true,
        contentType: 'text',
      };
    }

    // Create the reminder
    const storage = getReminderStorage();
    const reminder = await storage.addReminder({
      chatJid: context.chatJid,
      creatorJid: context.senderJid,
      creatorName: context.senderName,
      message: reminderText,
      scheduledTime: timeResult.date,
      isRecurring: timeResult.isRecurring,
      recurrencePattern: timeResult.recurrencePattern,
      isActive: true,
    });

    // Format confirmation message
    let response = `✅ *Reminder Set*\n\n`;
    response += `📋 ${reminderText}\n`;
    response += `⏰ ${formatDateTime(timeResult.date)}`;
    
    if (timeResult.isRecurring) {
      response += `\n🔄 Recurring: ${timeResult.recurrencePattern}`;
    }
    
    response += `\n\n_${formatRelativeTime(timeResult.date)}_`;
    response += `\n\nID: \`${reminder.id}\``;
    response += `\n\nTo cancel: /cancel reminder ${reminder.id}`;

    logger.info({ 
      reminderId: reminder.id,
      message: reminderText,
      time: timeResult.date 
    }, 'Reminder created');

    return {
      response,
      success: true,
      contentType: 'text',
    };

  } catch (error) {
    logger.error({ error }, 'Failed to create reminder');
    return {
      response: "Sorry, I couldn't set that reminder. Please try again.",
      success: false,
      contentType: 'text',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle listing reminders
 */
export async function handleListReminders(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('reminderSystem')) {
    return null;
  }

  // Check if it's a list command
  if (!LIST_REMINDERS_PATTERN.test(text)) {
    return null;
  }

  try {
    const storage = getReminderStorage();
    const reminders = await storage.getRemindersForChat(context.chatJid);

    if (reminders.length === 0) {
      return {
        response: `📭 *No Active Reminders*\n\n` +
                 `Set a reminder with:\n` +
                 `"Remind me to call mom in 30 minutes"`,
        success: true,
        contentType: 'text',
      };
    }

    let response = `📋 *Your Reminders* (${reminders.length})\n\n`;
    
    reminders.forEach((reminder, index) => {
      const timeStr = formatRelativeTime(reminder.scheduledTime);
      const recurring = reminder.isRecurring ? '🔄 ' : '';
      response += `${index + 1}. ${recurring}${reminder.message}\n`;
      response += `   _${timeStr}_ · ID: \`${reminder.id}\`\n\n`;
    });

    response += `To cancel: /cancel reminder <ID>`;

    return {
      response,
      success: true,
      contentType: 'text',
    };

  } catch (error) {
    logger.error({ error }, 'Failed to list reminders');
    return {
      response: "Sorry, I couldn't retrieve your reminders.",
      success: false,
      contentType: 'text',
    };
  }
}

/**
 * Handle cancel reminder
 */
export async function handleCancelReminder(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('reminderSystem')) {
    return null;
  }

  // Check if it's a cancel command
  const match = text.match(CANCEL_PATTERN);
  if (!match) {
    // Also check for "cancel reminder" or "cancel all reminders"
    if (/\bcancel\s+(?:all\s+)?reminders?\b/i.test(text)) {
      // Handle cancel all
      return handleCancelAllReminders(sock, message, text, context);
    }
    return null;
  }

  const reminderId = match[1];

  try {
    const storage = getReminderStorage();
    
    // Try to find by partial ID (first few characters)
    const reminders = await storage.getRemindersForChat(context.chatJid);
    const reminder = reminders.find(r => r.id.startsWith(reminderId));
    
    if (!reminder) {
      return {
        response: `❌ Reminder not found.\n\nUse /myreminders to see your active reminders.`,
        success: true,
        contentType: 'text',
      };
    }

    await storage.cancelReminder(reminder.id);

    return {
      response: `✅ Reminder cancelled:\n_${reminder.message}_`,
      success: true,
      contentType: 'text',
    };

  } catch (error) {
    logger.error({ error }, 'Failed to cancel reminder');
    return {
      response: "Sorry, I couldn't cancel that reminder.",
      success: false,
      contentType: 'text',
    };
  }
}

/**
 * Handle cancel all reminders
 */
async function handleCancelAllReminders(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult> {
  try {
    const storage = getReminderStorage();
    const reminders = await storage.getRemindersForChat(context.chatJid);
    
    for (const reminder of reminders) {
      await storage.cancelReminder(reminder.id);
    }

    return {
      response: `✅ Cancelled ${reminders.length} reminder${reminders.length !== 1 ? 's' : ''}.`,
      success: true,
      contentType: 'text',
    };

  } catch (error) {
    logger.error({ error }, 'Failed to cancel all reminders');
    return {
      response: "Sorry, I couldn't cancel your reminders.",
      success: false,
      contentType: 'text',
    };
  }
}

/**
 * Handle snooze reminder
 */
export async function handleSnoozeReminder(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('reminderSystem')) {
    return null;
  }

  // Check if it's a snooze command (usually in reply to a reminder)
  const match = text.match(SNOOZE_PATTERN);
  if (!match && !text.toLowerCase().includes('snooze')) {
    return null;
  }

  try {
    // Find the most recent reminder for this chat
    const storage = getReminderStorage();
    const reminders = await storage.getRemindersForChat(context.chatJid);
    
    if (reminders.length === 0) {
      return {
        response: `No active reminders to snooze.`,
        success: true,
        contentType: 'text',
      };
    }

    // Parse snooze duration
    let snoozeMinutes = 10; // Default 10 minutes
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      snoozeMinutes = unit.startsWith('hour') || unit.startsWith('hr') ? amount * 60 : amount;
    }

    // Snooze the most recent reminder
    const reminder = reminders[reminders.length - 1];
    const snoozeUntil = new Date();
    snoozeUntil.setMinutes(snoozeUntil.getMinutes() + snoozeMinutes);

    await storage.snoozeReminder(reminder.id, snoozeUntil);

    return {
      response: `⏰ Snoozed for ${snoozeMinutes} minutes.\n\n` +
               `I'll remind you again at ${formatDateTime(snoozeUntil)}.`,
      success: true,
      contentType: 'text',
    };

  } catch (error) {
    logger.error({ error }, 'Failed to snooze reminder');
    return {
      response: "Sorry, I couldn't snooze that reminder.",
      success: false,
      contentType: 'text',
    };
  }
}

/**
 * Handle test reminder (creates a reminder 10 seconds in the future)
 */
export async function handleTestReminder(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('reminderSystem')) {
    return null;
  }

  // Check if it's a test command
  if (!TEST_REMINDER_PATTERN.test(text)) {
    return null;
  }

  try {
    const storage = getReminderStorage();
    const testTime = new Date();
    testTime.setSeconds(testTime.getSeconds() + 10); // 10 seconds from now
    
    const reminder = await storage.addReminder({
      chatJid: context.chatJid,
      creatorJid: context.senderJid,
      creatorName: context.senderName,
      message: 'This is a test reminder! 🎉',
      scheduledTime: testTime,
      isRecurring: false,
      isActive: true,
    });

    return {
      response: `🧪 Test reminder created!\n\nYou should receive it in 10 seconds.\n\nID: \`${reminder.id}\``,
      success: true,
      contentType: 'text',
    };

  } catch (error) {
    logger.error({ error }, 'Failed to create test reminder');
    return {
      response: "Failed to create test reminder.",
      success: false,
      contentType: 'text',
    };
  }
}

/**
 * Handle "done" response to reminder
 */
export async function handleReminderDone(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('reminderSystem')) {
    return null;
  }

  // Check if user marked as done
  if (!DONE_PATTERN.test(text)) {
    return null;
  }

  return {
    response: `✅ Great! I've marked that as done.`,
    success: true,
    contentType: 'text',
  };
}

/**
 * Initialize reminder scheduler when bot starts
 */
export function initializeReminderScheduler(sock: WASocket): void {
  // Check feature flag
  if (!isEnabled('reminderSystem')) {
    logger.info('Reminder system disabled, skipping scheduler');
    return;
  }
  
  try {
    const scheduler = getReminderScheduler();
    scheduler.initialize(sock);
    scheduler.start();
    logger.info('✅ Reminder scheduler started - will check every minute');
    
    // Log active reminders count
    const storage = getReminderStorage();
    storage.getAllReminders().then(reminders => {
      logger.info({ activeReminders: reminders.length }, 'Active reminders loaded');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start reminder scheduler');
  }
}

/**
 * Stop reminder scheduler
 */
export function stopReminderScheduler(): void {
  const scheduler = getReminderScheduler();
  scheduler.stop();
  logger.info('Reminder scheduler stopped');
}
