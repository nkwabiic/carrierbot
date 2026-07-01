import { IWhatsAppProvider } from './whatsapp.interface.js';
import { logger } from '../utils/logger.js';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';
import * as qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';

interface MessageCacheEntry {
  id: string;
  timestamp: number;
}

export class BaileysProvider implements IWhatsAppProvider {
  private sock: WASocket | null = null;
  private messageHandler?: (from: string, text: string) => Promise<void>;
  
  private isInitializing = false;
  private reconnectAttempt = 0;
  private readonly MAX_RECONNECT_DELAY_MS = 30000;

  // Duplicate message protection cache
  private processedMessages: MessageCacheEntry[] = [];
  private readonly CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.init().catch(err => logger.error('[Baileys] Constructor init failed', err));
  }

  public setMessageHandler(handler: (from: string, text: string) => Promise<void>) {
    this.messageHandler = handler;
  }

  private cleanMessageCache() {
    const now = Date.now();
    this.processedMessages = this.processedMessages.filter(
      entry => now - entry.timestamp < this.CACHE_EXPIRY_MS
    );
  }

  private isDuplicateMessage(messageId: string | null | undefined): boolean {
    if (!messageId) return false;
    
    this.cleanMessageCache();
    
    if (this.processedMessages.some(entry => entry.id === messageId)) {
      return true;
    }
    
    this.processedMessages.push({ id: messageId, timestamp: Date.now() });
    return false;
  }

  private async init() {
    if (this.isInitializing) {
      logger.warn('[Baileys] Initialization already in progress, skipping.');
      return;
    }

    this.isInitializing = true;

    try {
      if (this.sock) {
        logger.info('[Baileys] Closing existing socket before reconnecting...');
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        this.sock.end(undefined);
        this.sock = null;
      }

      const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth_info');

      const sockLogger = pino({ level: 'silent' });

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: sockLogger as any,
        browser: Browsers.macOS('Desktop'),
      });

      this.sock = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          logger.info('[Baileys] Scan this QR code to authenticate:');
          qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
          logger.warn(`[Baileys] Connection closed due to ${lastDisconnect?.error}. Reconnecting: ${shouldReconnect}`);
          
          if (shouldReconnect) {
            this.reconnectAttempt++;
            // Exponential backoff: 2s, 4s, 8s, up to 30s
            const delay = Math.min(Math.pow(2, this.reconnectAttempt) * 1000, this.MAX_RECONNECT_DELAY_MS);
            logger.info(`[Baileys] Scheduling reconnect attempt ${this.reconnectAttempt} in ${delay}ms`);
            setTimeout(() => {
              this.init().catch(err => logger.error('[Baileys] Reconnect failed', err));
            }, delay);
          } else {
            logger.error('[Baileys] Logged out from WhatsApp');
          }
        } else if (connection === 'open') {
          logger.info('[Baileys] Connected to WhatsApp!');
          this.reconnectAttempt = 0; // Reset retry counter on successful connection
        }
      });

      sock.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify') {
          for (const msg of m.messages) {
            // Ignore self messages
            if (msg.key.fromMe) continue;
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const remoteJid = msg.key.remoteJid || (msg.key as any).remoteJidAlt;
            if (!remoteJid) continue;
            
            // Ignore unsupported message sources
            if (
              remoteJid === 'status@broadcast' || 
              remoteJid.endsWith('@g.us') || 
              remoteJid.endsWith('@broadcast') ||
              remoteJid.endsWith('@newsletter')
            ) {
              logger.debug(`[Baileys] Ignored message from unsupported source: ${remoteJid}`);
              continue;
            }

            const messageId = msg.key.id;
            if (this.isDuplicateMessage(messageId)) {
              logger.warn(`[Baileys] Ignored duplicate message ID: ${messageId}`);
              continue;
            }

            if (msg.message) {
              const from = remoteJid.split('@')[0];
              if (!from) continue;

              let text = '';
              const messageContent = msg.message;

              if (messageContent.conversation) {
                text = messageContent.conversation;
              } else if (messageContent.extendedTextMessage?.text) {
                text = messageContent.extendedTextMessage.text;
              } else if (messageContent.buttonsResponseMessage?.selectedDisplayText) {
                text = messageContent.buttonsResponseMessage.selectedDisplayText;
              } else if (messageContent.listResponseMessage?.title) {
                text = messageContent.listResponseMessage.title;
              }

              if (text && this.messageHandler) {
                logger.info(`[Baileys] Received message from ${from}: ${text}`);
                try {
                  await this.messageHandler(from, text);
                } catch (error) {
                  logger.error(`[Baileys] Error in message handler`, error);
                }
              } else if (!text) {
                logger.debug(`[Baileys] Ignored empty message or unsupported type from ${from}`);
              }
            }
          }
        }
      });

    } catch (error) {
      logger.error('[Baileys] Failed to initialize', error);
      this.reconnectAttempt++;
      const delay = Math.min(Math.pow(2, this.reconnectAttempt) * 1000, this.MAX_RECONNECT_DELAY_MS);
      logger.info(`[Baileys] Scheduling reconnect attempt ${this.reconnectAttempt} in ${delay}ms`);
      setTimeout(() => {
        this.init().catch(err => logger.error('[Baileys] Reconnect failed', err));
      }, delay);
    } finally {
      this.isInitializing = false;
    }
  }

  async sendMessage(to: string, message: string): Promise<boolean> {
    try {
      if (!this.sock) return false;
      const jid = `${to}@s.whatsapp.net`;
      
      const pdfLinkMatch = message.match(/Unaweza kuipakua hapa:\s+(http\S+\.pdf)/);
      if (pdfLinkMatch) {
        const pdfUrl = pdfLinkMatch[1];
        
        try {
          // Validate URL format
          new URL(pdfUrl);
          
          await this.sock.sendMessage(jid, {
            document: { url: pdfUrl },
            mimetype: 'application/pdf',
            fileName: 'CV.pdf',
            caption: message
          });
          logger.info(`[Baileys] Sent document to ${to}`);
          return true;
        } catch (docError) {
          logger.error(`[Baileys] Failed to send document to ${to}, falling back to text. URL: ${pdfUrl}`, docError);
          // Fallback to text message if doc upload fails or URL is invalid
          await this.sock.sendMessage(jid, { text: message });
          logger.info(`[Baileys] Sent fallback text message to ${to}`);
          return true;
        }
      }

      await this.sock.sendMessage(jid, { text: message });
      logger.info(`[Baileys] Sent message to ${to}`);
      return true;
    } catch (error) {
      logger.error(`[Baileys] Failed to send message to ${to}`, error);
      return false;
    }
  }

  async sendInteractiveMessage(to: string, text: string, options: string[]): Promise<boolean> {
    try {
      if (!this.sock) return false;
      const jid = `${to}@s.whatsapp.net`;
      
      let formattedText = `${text}\n\n`;
      options.forEach((opt) => {
        formattedText += `${opt}\n`;
      });
      formattedText += `\n(Tafadhali jibu kwa namba ya chaguo lako)`;

      await this.sock.sendMessage(jid, { text: formattedText });
      logger.info(`[Baileys] Sent simulated interactive message to ${to}`);
      return true;
    } catch (error) {
      logger.error(`[Baileys] Failed to send interactive message to ${to}`, error);
      return false;
    }
  }

  async sendDocument(to: string, documentUrlOrPath: string, fileName: string): Promise<boolean> {
    try {
      if (!this.sock) return false;
      const jid = `${to}@s.whatsapp.net`;
      
      try {
        new URL(documentUrlOrPath);
      } catch (err) {
        logger.error(`[Baileys] Invalid document URL: ${documentUrlOrPath}`, err);
        return false; // Skip sending if URL is completely invalid here
      }

      await this.sock.sendMessage(jid, {
        document: { url: documentUrlOrPath },
        mimetype: 'application/pdf',
        fileName: fileName,
      });
      logger.info(`[Baileys] Sent document to ${to}`);
      return true;
    } catch (error) {
      logger.error(`[Baileys] Failed to send document to ${to}`, error);
      return false;
    }
  }
}
