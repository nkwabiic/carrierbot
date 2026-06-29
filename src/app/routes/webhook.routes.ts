import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { webhookPayloadSchema } from '../../validators/webhook.validator.js';
import { container } from '../container.js';

// Dependency Injection via Container
const webhookController = new WebhookController(container.webhookService);

const router = Router();

router.get('/webhook', webhookController.verifyWebhook);
router.post('/webhook', validate(webhookPayloadSchema), webhookController.handleWebhook);

export default router;
