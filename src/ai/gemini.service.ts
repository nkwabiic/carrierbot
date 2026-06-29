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

  private async generate(prompt: string, fallback: string): Promise<string> {
    const startTime = Date.now();
    try {
      const response = await this.ai.models.generateContent({
        model: config.GEMINI_MODEL,
        contents: prompt,
      });
      const latency = Date.now() - startTime;
      logger.info(`[Gemini] Generated content in ${latency}ms`);
      return response.text || fallback;
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error(`[Gemini] Error generating content after ${latency}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Retry once
      try {
        logger.info(`[Gemini] Retrying generation...`);
        const retryResponse = await this.ai.models.generateContent({
          model: config.GEMINI_MODEL,
          contents: prompt,
        });
        return retryResponse.text || fallback;
      } catch (retryError) {
        logger.error(`[Gemini] Retry failed: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
        return fallback;
      }
    }
  }

  async enhanceSummary(input: string): Promise<string> {
    if (!input) return input;
    const prompt = summaryPromptTemplate.replace('{input}', input);
    return this.generate(prompt, input);
  }

  async enhanceExperience(input: string): Promise<string> {
    if (!input) return input;
    const prompt = experiencePromptTemplate.replace('{input}', input);
    return this.generate(prompt, input);
  }

  async enhanceSkills(input: string): Promise<string> {
    if (!input) return input;
    const prompt = skillsPromptTemplate.replace('{input}', input);
    return this.generate(prompt, input);
  }
}
