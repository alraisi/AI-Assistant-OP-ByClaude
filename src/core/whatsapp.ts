import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type BaileysEventMap,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { rm } from 'fs/promises';
import { getConfig } from '../config/index.js';
import { setQRCode, setConnected } from '../setup/web-wizard.js';

const logger = pino({ name: 'whatsapp' });

export interface WhatsAppClientEvents {
  onReady: (sock: WASocket, jid: string) => void;
  onMessage: (upsert: BaileysEventMap['messages.upsert']) => void;
  onDisconnect: (reason: string) => void;
  onGroupParticipants: (update: BaileysEventMap['group-participants.update']) => void;
}

export class WhatsAppClient {
  private sock: WASocket | null = null;
  private events: Partial<WhatsAppClientEvents> = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private botJid: string | null = null;

  async connect(): Promise<void> {
    const config = getConfig();
    const { state, saveCreds } = await useMultiFileAuthState(config.whatsappAuthPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger: logger.child({ level: 'silent' }),
      generateHighQualityLinkPreview: true,
    });

    this.sock = sock;

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.info('QR Code received - scan with WhatsApp');
        // Send to wizard if running
        setQRCode(qr);
        // Also display in terminal for CLI mode
        console.log('\nScan this QR code with WhatsApp:\n');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;

        logger.info({ reason, shouldReconnect }, 'Connection closed');

        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.getReconnectDelay();
          logger.info({ attempt: this.reconnectAttempts, delay }, 'Reconnecting...');
          setTimeout(() => this.connect(), delay);
        } else if (reason === DisconnectReason.loggedOut) {
          logger.warn('Logged out - clearing session and reconnecting');
          this.events.onDisconnect?.('logged_out');
          // Clear auth state and reconnect to show QR code
          this.reconnectAttempts = 0;
          this.sock = null;
          try {
            const config = getConfig();
            await rm(config.whatsappAuthPath, { recursive: true, force: true });
            logger.info('Auth state cleared');
          } catch (err) {
            logger.warn({ err }, 'Failed to clear auth state');
          }
          setTimeout(() => this.connect(), 2000);
        } else {
          logger.error('Max reconnect attempts reached');
          this.events.onDisconnect?.('max_attempts');
        }
      }

      if (connection === 'open') {
        this.reconnectAttempts = 0;
        this.botJid = sock.user?.id || null;
        logger.info({ jid: this.botJid }, 'Connected to WhatsApp');
        
        // Notify wizard of connection
        setConnected(true);

        if (this.botJid) {
          this.events.onReady?.(sock, this.botJid);
        }
      }
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', (upsert) => {
      this.events.onMessage?.(upsert);
    });

    // Handle group participant updates
    sock.ev.on('group-participants.update', (update) => {
      this.events.onGroupParticipants?.(update);
    });
  }

  on<K extends keyof WhatsAppClientEvents>(
    event: K,
    handler: WhatsAppClientEvents[K]
  ): void {
    this.events[event] = handler;
  }

  getSocket(): WASocket | null {
    return this.sock;
  }

  getBotJid(): string | null {
    return this.botJid;
  }

  async sendMessage(
    jid: string,
    content: string,
    quotedMessage?: { key: { id: string; remoteJid: string; participant?: string } }
  ): Promise<void> {
    if (!this.sock) {
      throw new Error('WhatsApp not connected');
    }

    await this.sock.sendMessage(jid, {
      text: content,
    }, {
      quoted: quotedMessage as any,
    });
  }

  async sendPresenceUpdate(
    type: 'composing' | 'paused' | 'recording',
    jid: string
  ): Promise<void> {
    if (!this.sock) return;
    await this.sock.sendPresenceUpdate(type, jid);
  }

  private getReconnectDelay(): number {
    const baseDelay = 1000 * Math.pow(2, this.reconnectAttempts - 1);
    const capped = Math.min(baseDelay, 60000);
    // Add +/- 20% jitter
    const jitter = 0.8 + Math.random() * 0.4;
    return Math.round(capped * jitter);
  }

  async disconnect(): Promise<void> {
    if (this.sock) {
      await this.sock.logout();
      this.sock = null;
    }
  }
}

let instance: WhatsAppClient | null = null;

export function getWhatsAppClient(): WhatsAppClient {
  if (!instance) {
    instance = new WhatsAppClient();
  }
  return instance;
}
