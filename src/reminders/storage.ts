/**
 * Reminder Storage
 * Manages persistence of reminders
 */

import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { join } from 'path';
import { getConfig } from '../config/index.js';
import pino from 'pino';

const logger = pino({ name: 'reminder-storage' });

export interface Reminder {
  id: string;
  chatJid: string;
  creatorJid: string;
  creatorName: string;
  message: string;
  scheduledTime: Date;
  isRecurring: boolean;
  recurrencePattern?: string; // 'daily', 'weekly', 'monthly', or cron expression
  isActive: boolean;
  createdAt: Date;
  snoozeUntil?: Date;
}

interface ReminderDatabase {
  reminders: Reminder[];
  version: number;
}

const DB_VERSION = 1;

class ReminderStorage {
  private filePath: string;
  private cache: Reminder[] | null = null;
  private lastLoad: number = 0;
  private readonly CACHE_TTL = 5000; // 5 seconds

  constructor() {
    const config = getConfig();
    this.filePath = join(config.memoryStoragePath, 'reminders.json');
  }

  private async ensureDir(): Promise<void> {
    try {
      await mkdir(getConfig().memoryStoragePath, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  private async loadDatabase(): Promise<ReminderDatabase> {
    const now = Date.now();
    
    // Use cache if fresh
    if (this.cache && (now - this.lastLoad) < this.CACHE_TTL) {
      return { reminders: this.cache, version: DB_VERSION };
    }

    try {
      await access(this.filePath);
      const data = await readFile(this.filePath, 'utf-8');
      const db: ReminderDatabase = JSON.parse(data);
      
      // Convert date strings back to Date objects
      db.reminders = db.reminders.map(r => ({
        ...r,
        scheduledTime: new Date(r.scheduledTime),
        createdAt: new Date(r.createdAt),
        snoozeUntil: r.snoozeUntil ? new Date(r.snoozeUntil) : undefined,
      }));

      this.cache = db.reminders;
      this.lastLoad = now;
      
      return db;
    } catch (error) {
      // File doesn't exist or is corrupted
      return { reminders: [], version: DB_VERSION };
    }
  }

  private async saveDatabase(db: ReminderDatabase): Promise<void> {
    await this.ensureDir();
    await writeFile(this.filePath, JSON.stringify(db, null, 2), 'utf-8');
    this.cache = db.reminders;
    this.lastLoad = Date.now();
  }

  async getAllReminders(): Promise<Reminder[]> {
    const db = await this.loadDatabase();
    return db.reminders.filter(r => r.isActive);
  }

  async getReminderById(id: string): Promise<Reminder | null> {
    const reminders = await this.getAllReminders();
    return reminders.find(r => r.id === id) || null;
  }

  async getRemindersForChat(chatJid: string): Promise<Reminder[]> {
    const reminders = await this.getAllReminders();
    return reminders.filter(r => r.chatJid === chatJid);
  }

  async getDueReminders(beforeTime: Date = new Date()): Promise<Reminder[]> {
    const reminders = await this.getAllReminders();
    return reminders.filter(r => {
      if (r.snoozeUntil && r.snoozeUntil > beforeTime) {
        return false;
      }
      return r.scheduledTime <= beforeTime;
    });
  }

  async addReminder(reminder: Omit<Reminder, 'id' | 'createdAt'>): Promise<Reminder> {
    const db = await this.loadDatabase();
    
    const newReminder: Reminder = {
      ...reminder,
      id: this.generateId(),
      createdAt: new Date(),
    };

    db.reminders.push(newReminder);
    await this.saveDatabase(db);

    logger.info({ reminderId: newReminder.id }, 'Reminder added');
    return newReminder;
  }

  async updateReminder(id: string, updates: Partial<Reminder>): Promise<Reminder | null> {
    const db = await this.loadDatabase();
    const index = db.reminders.findIndex(r => r.id === id);
    
    if (index === -1) return null;

    db.reminders[index] = { ...db.reminders[index], ...updates };
    await this.saveDatabase(db);

    logger.info({ reminderId: id }, 'Reminder updated');
    return db.reminders[index];
  }

  async cancelReminder(id: string): Promise<boolean> {
    const db = await this.loadDatabase();
    const index = db.reminders.findIndex(r => r.id === id);
    
    if (index === -1) return false;

    db.reminders[index].isActive = false;
    await this.saveDatabase(db);

    logger.info({ reminderId: id }, 'Reminder cancelled');
    return true;
  }

  async deleteReminder(id: string): Promise<boolean> {
    const db = await this.loadDatabase();
    const index = db.reminders.findIndex(r => r.id === id);
    
    if (index === -1) return false;

    db.reminders.splice(index, 1);
    await this.saveDatabase(db);

    logger.info({ reminderId: id }, 'Reminder deleted');
    return true;
  }

  async snoozeReminder(id: string, snoozeUntil: Date): Promise<Reminder | null> {
    return this.updateReminder(id, { snoozeUntil });
  }

  async rescheduleReminder(id: string, newTime: Date): Promise<Reminder | null> {
    return this.updateReminder(id, { scheduledTime: newTime });
  }

  private generateId(): string {
    return `rem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  async cleanupOldReminders(olderThanDays: number = 30): Promise<number> {
    const db = await this.loadDatabase();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const originalCount = db.reminders.length;
    db.reminders = db.reminders.filter(r => {
      // Keep active reminders
      if (r.isActive) return true;
      // Keep recent inactive reminders
      return r.scheduledTime > cutoff;
    });

    const removed = originalCount - db.reminders.length;
    if (removed > 0) {
      await this.saveDatabase(db);
      logger.info({ removed }, 'Old reminders cleaned up');
    }

    return removed;
  }
}

// Singleton instance
let instance: ReminderStorage | null = null;

export function getReminderStorage(): ReminderStorage {
  if (!instance) {
    instance = new ReminderStorage();
  }
  return instance;
}
