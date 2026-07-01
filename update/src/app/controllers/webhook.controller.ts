import { Request, Response, NextFunction } from 'express';
import { WebhookService } from '../../domain/services/webhook.service.js';
import { config } from '../config/env.js';
import { logger } from '../../utils/logger.js';
import { WebhookPayload } from '../../whatsapp/whatsapp.interface.js';

export class WebhookController {
  constructor(private webhookService: WebhookService) {}

  verifyWebhook = (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
      if (mode === 'subscribe' && token === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        logger.info('WEBHOOK_VERIFIED');
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(400);
    }
  };

  handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload: WebhookPayload = req.body;
      await this.webhookService.processWebhook(payload);
      res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
      next(error);
    }
  };
}
