import { UserRepository } from '../database/repositories/user.repository.js';
import { ConversationRepository } from '../database/repositories/conversation.repository.js';
import { CVRepository } from '../database/repositories/cv.repository.js';
import { UserService } from '../domain/services/user.service.js';
import { ConversationService } from '../domain/services/conversation.service.js';
import { CVService } from '../domain/services/cv.service.js';
import { WebhookService } from '../domain/services/webhook.service.js';
import { FiniteStateMachine } from '../conversation/fsm/fsm.js';
import { BaileysProvider } from '../whatsapp/baileys.provider.js';
import { GeminiService } from '../ai/gemini.service.js';
import { PDFService } from '../pdf/pdf.service.js';
import { LocalStorageProvider } from '../pdf/storage/local-storage.provider.js';
import { IPdfStorageProvider } from '../pdf/storage/pdf-storage.interface.js';
import { CvPreviewService } from '../domain/services/cv-preview.service.js';

class Container {
  public userRepository: UserRepository;
  public conversationRepository: ConversationRepository;
  public cvRepository: CVRepository;

  public userService: UserService;
  public conversationService: ConversationService;
  public cvService: CVService;
  public cvPreviewService: CvPreviewService;

  public whatsappProvider: BaileysProvider;
  public geminiService: GeminiService;
  public pdfStorageProvider: IPdfStorageProvider;
  public pdfService: PDFService;
  public fsm: FiniteStateMachine;
  public webhookService: WebhookService;

  constructor() {
    // Repositories
    this.userRepository = new UserRepository();
    this.conversationRepository = new ConversationRepository();
    this.cvRepository = new CVRepository();

    // Services
    this.userService = new UserService(this.userRepository, this.conversationRepository);
    this.conversationService = new ConversationService(this.conversationRepository);
    this.cvService = new CVService(this.cvRepository);
    this.cvPreviewService = new CvPreviewService();
    this.geminiService = new GeminiService();

    // PDF & Storage
    this.pdfStorageProvider = new LocalStorageProvider();
    this.pdfService = new PDFService(this.pdfStorageProvider);

    // Provider & FSM
    this.whatsappProvider = new BaileysProvider();
    this.fsm = new FiniteStateMachine(
      this.whatsappProvider,
      this.conversationService,
      this.userService,
      this.cvService,
      this.geminiService,
      this.pdfService,
      this.cvPreviewService
    );

    // Wire up BaileysProvider incoming messages to FSM
    this.whatsappProvider.setMessageHandler(async (from: string, text: string) => {
      try {
        const { user, conversation } = await this.userService.getOrCreateUser(from);
        await this.fsm.processMessage(user, conversation, text);
      } catch (error) {
        console.error('Error processing incoming Baileys message', error);
      }
    });

    // Webhook Service (may still be used if both are active or for legacy)
    this.webhookService = new WebhookService(this.userService, this.fsm);
  }
}

export const container = new Container();
