import { z } from 'zod';

export const webhookPayloadSchema = z.object({
  body: z.object({
    object: z.string(),
    entry: z.array(
      z.object({
        id: z.string(),
        changes: z.array(
          z.object({
            value: z.object({
              messaging_product: z.string(),
              metadata: z.object({
                display_phone_number: z.string(),
                phone_number_id: z.string(),
              }),
              contacts: z.array(z.any()).optional(),
              messages: z.array(z.any()).optional(),
            }),
            field: z.string(),
          })
        ),
      })
    ),
  }),
});
