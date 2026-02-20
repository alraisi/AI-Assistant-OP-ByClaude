/**
 * Reminder Scheduler
 * Background job that checks and sends reminders
 */

import * as cron from 'node-cron';
import type { WASocket } from '@whiskeysockets/baileys';
import { getReminderStorage, type Reminder } from './storage.js';
import { formatDateTime } from './time-parser.js';
import pino from 'pino';

const logger = pino({ name: 'reminder-scheduler' });

export class ReminderScheduler {
  private storage = getReminderStorage();
  private sock: WASocket | null = null;
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;

  /**
   * Initialize the scheduler with a WhatsApp socket
   */
  initialize(sock: WASocket): void {
    this.sock = sock;
    logger.info('Reminder scheduler initialized');
  }

  /**
   * Start the background scheduler (runs every minute)
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Scheduler already running');
      return;
    }

    if (!this.sock) {
      throw new Error('Scheduler not initialized. Call initialize() first.');
    }

    // Run every minute
    this.task = cron.schedule('* * * * *', async () => {
      await this.checkAndSendReminders();
    });

    this.isRunning = true;
    logger.info('Reminder scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    this.isRunning = false;
    logger.info('Reminder scheduler stopped');
  }

  /**
   * Check for due reminders and send them
   */
  private async checkAndSendReminders(): Promise<void> {
    if (!this.sock) {
      logger.warn('No WhatsApp socket, cannot send reminders');
      return;
    }

    try {
      const now = new Date();
      logger.debug({ time: now.toISOString() }, 'Checking for due reminders');
      
      const dueReminders = await this.storage.getDueReminders(now);
      
      logger.debug({ count: dueReminders.length }, 'Due reminders found');

      for (const reminder of dueReminders) {
        logger.info({ 
          reminderId: reminder.id, 
          message: reminder.message,
          scheduledFor: reminder.scheduledTime 
        }, 'Sending reminder');
        
        await this.sendReminder(reminder);
        
        if (reminder.isRecurring) {
          // Reschedule recurring reminder
          await this.rescheduleRecurring(reminder);
        } else {
          // Mark as inactive
          await this.storage.cancelReminder(reminder.id);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error checking reminders');
    }
  }

  /**
   * Send a reminder message
   */
  private async sendReminder(reminder: Reminder): Promise<void> {
    if (!this.sock) return;

    try {
      const timeText = formatDateTime(reminder.scheduledTime);
      
      let message = `⏰ *Reminder*\n\n${reminder.message}\n\n_Set for: ${timeText}_`;
      
      if (reminder.isRecurring) {
        message += '\n\n_This is a recurring reminder_';
      }
      
      message += '\n\nReply with:\n';
      message += '• "done" to dismiss\n';
      message += '• "snooze 10 minutes" to snooze\n';
      message += '• "cancel reminder" to stop';

      await this.sock.sendMessage(reminder.chatJid, { text: message });
      
      logger.info({ 
        reminderId: reminder.id, 
        chat: reminder.chatJid,
        message: reminder.message 
      }, 'Reminder sent');
    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, 'Failed to send reminder');
    }
  }

  /**
   * Reschedule a recurring reminder
   */
  private async rescheduleRecurring(reminder: Reminder): Promise<void> {
    if (!reminder.recurrencePattern) return;

    const nextTime = new Date(reminder.scheduledTime);
    
    switch (reminder.recurrencePattern) {
      case 'daily':
        nextTime.setDate(nextTime.getDate() + 1);
        break;
      case 'weekly':
        nextTime.setDate(nextTime.getDate() + 7);
        break;
      case 'monthly':
        nextTime.setMonth(nextTime.getMonth() + 1);
        break;
      default:
        // Custom pattern - try to parse
        if (reminder.recurrencePattern.includes('minutes')) {
          const mins = parseInt(reminder.recurrencePattern.match(/\d+/)?.[0] || '60');
          nextTime.setMinutes(nextTime.getMinutes() + mins);
        } else if (reminder.recurrencePattern.includes('hours')) {
          const hours = parseInt(reminder.recurrencePattern.match(/\d+/)?.[0] || '1');
          nextTime.setHours(nextTime.getHours() + hours);
        }
    }

    await this.storage.rescheduleReminder(reminder.id, nextTime);
    
    logger.info({ 
      reminderId: reminder.id, 
      nextTime 
    }, 'Recurring reminder rescheduled');
  }

  /**
   * Check if scheduler is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
let instance: ReminderScheduler | null = null;

export function getReminderScheduler(): ReminderScheduler {
  if (!instance) {
    instance = new ReminderScheduler();
  }
  return instance;
}
