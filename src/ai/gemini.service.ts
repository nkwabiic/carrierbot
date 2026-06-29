import { GoogleGenAI } from '@google/genai';
import { config } from '../app/config/env.js';
import { logger } from '../utils/logger.js';
import { summaryPromptTemplate } from './prompts/summary.prompt.js';
import { experiencePromptTemplate } from './prompts/experience.prompt.js';
import { skillsPromptTemplate } from './prompts/skills.prompt.js';

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: config.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }

  private async generateWithTimeout(prompt: string, fallback: string, retries = 2): Promise<string> {
      // Promise.race for timeout
      const startTime = Date.now();
      let attempt = 0;
      
      while (attempt <= retries) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Gemini request timeout')), 15000); // 15 seconds
          });
          
          const responsePromise = this.ai.models.generateContent({
            model: config.GEMINI_MODEL,
            contents: prompt,
          });
          
          const response = await Promise.race([responsePromise, timeoutPromise]);
          
          const latency = Date.now() - startTime;
          logger.info(`[Gemini] Generated content in ${latency}ms on attempt ${attempt + 1}`);
          return response.text || fallback;
        } catch (error) {
          attempt++;
          const latency = Date.now() - startTime;
          logger.error(`[Gemini] Error generating content on attempt ${attempt} after ${latency}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          if (attempt > retries) {
            logger.error(`[Gemini] All ${retries + 1} attempts failed.`);
            return fallback;
          }
          
          const backoffMs = Math.pow(2, attempt - 1) * 1000;
          logger.info(`[Gemini] Retrying in ${backoffMs}ms...`);
          await new Promise(r => setTimeout(r, backoffMs));
        }
      }
      return fallback;
  }

  async enhanceSummary(input: string): Promise<string> {
    if (!input) return input;
    const prompt = summaryPromptTemplate.replace('{input}', input);
    return this.generateWithTimeout(prompt, input);
  }

  async enhanceExperience(input: string): Promise<string> {
    if (!input) return input;
    const prompt = experiencePromptTemplate.replace('{input}', input);
    return this.generateWithTimeout(prompt, input);
  }

  async enhanceSkills(input: string): Promise<string> {
    if (!input) return input;
    const prompt = skillsPromptTemplate.replace('{input}', input);
    return this.generateWithTimeout(prompt, input);
  }
}


