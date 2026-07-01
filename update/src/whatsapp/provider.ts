import { IWhatsAppProvider } from './whatsapp.interface.js';
import { logger } from '../utils/logger.js';

export class WhatsAppCloudProvider implements IWhatsAppProvider {
  private messageHandler?: (from: string, text: string) => Promise<void>;

  public setMessageHandler(handler: (from: string, text: string) => Promise<void>) {
    this.messageHandler = handler;
  }

  async sendMessage(to: string, message: string): Promise<boolean> {
    try {
      // In production, use fetch/axios to hit the actual WhatsApp API
      logger.info(`[WhatsAppCloud] Sending message to ${to}: ${message}`);
      // Simulated delay
      // await new Promise(r => setTimeout(r, 500));
      return true;
    } catch (error) {
      logger.error('Failed to send WhatsApp message', error);
      return false;
    }
  }

  async sendInteractiveMessage(to: string, text: string, options: string[]): Promise<boolean> {
    try {
      logger.info(`[WhatsAppCloud] Sending interactive message to ${to}: ${text} with options ${options.join(', ')}`);
      return true;
    } catch (error) {
      logger.error('Failed to send interactive message', error);
      return false;
    }
  }

  async sendDocument(to: string, documentUrlOrPath: string, fileName: string): Promise<boolean> {
    try {
      logger.info(`[WhatsAppCloud] Sending document to ${to}: ${fileName} from ${documentUrlOrPath}`);
      return true;
    } catch (error) {
      logger.error('Failed to send document', error);
      return false;
    }
  }
}
