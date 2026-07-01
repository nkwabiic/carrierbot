export interface IWhatsAppProvider {
  setMessageHandler(handler: (from: string, text: string) => Promise<void>): void;
  sendMessage(to: string, message: string): Promise<boolean>;
  sendInteractiveMessage(to: string, text: string, options: string[]): Promise<boolean>;
  sendDocument(to: string, documentUrlOrPath: string, fileName: string): Promise<boolean>;
}

export interface WebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: {
            body: string;
          };
          type: string;
          interactive?: {
            type: string;
            list_reply?: {
              id: string;
              title: string;
            };
            button_reply?: {
              id: string;
              title: string;
            };
          };
        }>;
      };
      field: string;
    }>;
  }>;
}
