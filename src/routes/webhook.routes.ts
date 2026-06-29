import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller.js';
import { WebhookService } from './services/webhook.service.js';
import { UserService } from './services/user.service.js';
import { UserRepository } from '../repositories/user.repository.js';
import { ConversationRepository } from '../repositories/conversation.repository.js';
import { FiniteStateMachine } from '../../conversation/fsm.js';
import { WhatsAppCloudProvider } from './services/whatsapp/provider.js';
import { validate } from '../middleware/validation.middleware.js';
import { webhookPayloadSchema } from '../validators/webhook.validator.js';

// Dependency Injection Setup
const userRepo = new UserRepository();
const convRepo = new ConversationRepository();
const userService = new UserService(userRepo, convRepo);

const whatsappProvider = new WhatsAppCloudProvider();
const fsm = new FiniteStateMachine(whatsappProvider, convRepo);

const webhookService = new WebhookService(userService, fsm);
const webhookController = new WebhookController(webhookService);

const router = Router();

router.get('/webhook', webhookController.verifyWebhook);
router.post('/webhook', validate(webhookPayloadSchema), webhookController.handleWebhook);

export default router;
