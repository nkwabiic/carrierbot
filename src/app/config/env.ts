import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string(),
  WHATSAPP_API_TOKEN: z.string(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  GEMINI_API_KEY: z.string(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  PDF_OUTPUT_PATH: z.string().default('./assets/pdfs'),
  APP_URL: z.string().default('http://localhost:3000'),
});

const envVars = envSchema.safeParse(process.env);

if (!envVars.success) {
  console.error('Invalid environment variables', envVars.error.format());
  process.exit(1);
}

export const config = envVars.data;
