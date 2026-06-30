import { IWhatsAppProvider } from './whatsapp.interface.js';
import { logger } from '../utils/logger.js';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import * as qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';

export class BaileysProvider implements IWhatsAppProvider {
  private sock: any;
  private messageHandler?: (from: string, text: string) => Promise<void>;

  constructor() {
    this.init();
  }

  public setMessageHandler(handler: (from: string, text: string) => Promise<void>) {
    this.messageHandler = handler;
  }

  private async init() {
    try {
      const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth_info');

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }) as any,
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
            setTimeout(() => this.init(), 2000);
          } else {
            logger.error('[Baileys] Logged out from WhatsApp');
          }
        } else if (connection === 'open') {
          logger.info('[Baileys] Connected to WhatsApp!');
        }
      });

      sock.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify') {
          for (const msg of m.messages) {
            if (!msg.key.fromMe && msg.message) {
              const from = msg.key.remoteJid?.split('@')[0];
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
              }
            }
          }
        }
      });

    } catch (error) {
      logger.error('[Baileys] Failed to initialize', error);
      setTimeout(() => this.init(), 5000);
    }
  }

  async sendMessage(to: string, message: string): Promise<boolean> {
    try {
      if (!this.sock) return false;
      const jid = `${to}@s.whatsapp.net`;
      
      const pdfLinkMatch = message.match(/Unaweza kuipakua hapa:\s+(http\S+\.pdf)/);
      if (pdfLinkMatch) {
        const pdfUrl = pdfLinkMatch[1];
        await this.sock.sendMessage(jid, {
          document: { url: pdfUrl },
          mimetype: 'application/pdf',
          fileName: 'CV.pdf',
          caption: message
        });
        logger.info(`[Baileys] Sent document to ${to}`);
        return true;
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
