import { getWhatsAppClient, WhatsAppClient } from './core/whatsapp.js';
import { EventHandler } from './core/event-handler.js';
import { getMemoryOrchestrator, MemoryOrchestrator } from './memory/index.js';
import { getConfig } from './config/index.js';
import { initializeReminderScheduler, stopReminderScheduler } from './handlers/reminder.js';
import { getSemanticMemory } from './memory/semantic.js';
import { isEnabled } from './config/index.js';
import pino from 'pino';

const logger = pino({ name: 'buddy' });

export class Buddy {
  private whatsapp: WhatsAppClient;
  private memory: MemoryOrchestrator;
  private eventHandler: EventHandler | null = null;
  private isRunning = false;

  constructor() {
    this.whatsapp = getWhatsAppClient();
    this.memory = getMemoryOrchestrator();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Buddy is already running');
      return;
    }

    const config = getConfig();
    logger.info({ name: config.buddyName }, 'Starting Buddy...');

    // Initialize memory system
    await this.memory.initialize();
    logger.info('Memory system initialized');

    // Set up WhatsApp event handlers
    this.whatsapp.on('onReady', async (sock, jid) => {
      logger.info({ jid }, 'WhatsApp connected');
      this.eventHandler = new EventHandler(sock, jid);
      this.isRunning = true;
      console.log(`\n${config.buddyEmoji} ${config.buddyName} is online and ready!\n`);
      
      // Initialize reminder scheduler
      try {
        initializeReminderScheduler(sock);
      } catch (error) {
        logger.error({ error }, 'Failed to initialize reminder scheduler');
      }
      
      // Initialize semantic memory
      if (isEnabled('semanticMemory')) {
        try {
          const semanticMemory = getSemanticMemory();
          await semanticMemory.initialize();
          logger.info('Semantic memory initialized');
          
          // Index existing memories in background
          semanticMemory.indexExistingMemories().then(() => {
            logger.info('Background memory indexing completed');
          });
        } catch (error) {
          logger.error({ error }, 'Failed to initialize semantic memory');
        }
      }
    });

    this.whatsapp.on('onMessage', async (upsert) => {
      if (this.eventHandler) {
        await this.eventHandler.handleMessagesUpsert(upsert);
      }
    });

    this.whatsapp.on('onGroupParticipants', async (update) => {
      if (this.eventHandler) {
        await this.eventHandler.handleGroupParticipantsUpdate(update);
      }
    });

    this.whatsapp.on('onDisconnect', (reason) => {
      logger.warn({ reason }, 'WhatsApp disconnected');
      this.isRunning = false;
      if (reason === 'logged_out') {
        console.log('\nPlease scan the QR code to reconnect.\n');
      }
    });

    // Connect to WhatsApp
    await this.whatsapp.connect();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Buddy...');
    
    // Stop reminder scheduler
    stopReminderScheduler();
    
    await this.whatsapp.disconnect();
    this.isRunning = false;
    logger.info('Buddy stopped');
  }

  isOnline(): boolean {
    return this.isRunning;
  }

  getMemory(): MemoryOrchestrator {
    return this.memory;
  }
}

let instance: Buddy | null = null;

export function getBuddy(): Buddy {
  if (!instance) {
    instance = new Buddy();
  }
  return instance;
}
