import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string(),
  WHATSAPP_API_TOKEN: z.string(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const envVars = envSchema.safeParse(process.env);

if (!envVars.success) {
  console.error('Invalid environment variables', envVars.error.format());
  process.exit(1);
}

export const config = envVars.data;
