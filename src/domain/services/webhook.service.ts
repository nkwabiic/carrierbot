import { WebhookPayload } from '../../whatsapp/whatsapp.interface.js';
import { UserService } from './user.service.js';
import { FiniteStateMachine } from '../../conversation/fsm/fsm.js';
import { logger } from '../../utils/logger.js';

export class WebhookService {
  constructor(
    private userService: UserService,
    private fsm: FiniteStateMachine
  ) {}

  async processWebhook(payload: WebhookPayload): Promise<void> {
    try {
      if (payload.object !== 'whatsapp_business_account') {
        logger.warn('Unknown webhook object');
        return;
      }

      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          if (change.value.messages) {
            for (const message of change.value.messages) {
              const from = message.from;
              
              // Extract text from standard text messages or interactive buttons
              let text = '';
              if (message.type === 'text' && message.text) {
                text = message.text.body;
              } else if (message.type === 'interactive' && message.interactive) {
                text = message.interactive.list_reply?.title || message.interactive.button_reply?.title || '';
              }

              if (text) {
                const { user, conversation } = await this.userService.getOrCreateUser(from);
                await this.fsm.processMessage(user, conversation, text);
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error processing webhook', error);
      throw error;
    }
  }
}
