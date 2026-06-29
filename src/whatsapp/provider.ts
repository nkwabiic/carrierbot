import { IWhatsAppProvider } from './whatsapp.interface.js';
import { logger } from '../utils/logger.js';

export class WhatsAppCloudProvider implements IWhatsAppProvider {
  private apiUrl = 'https://graph.facebook.com/v17.0'; // Example version

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
}
