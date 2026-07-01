import { GoogleGenAI } from '@google/genai';
import { config } from '../app/config/env.js';
import { logger } from '../utils/logger.js';
import { cvEnhancementPromptTemplate } from './prompts/cv-enhancement.prompt.js';

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: config.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  async enhanceCV(cvData: any): Promise<any> {
    if (!cvData) return cvData;

    const startTime = Date.now();
    try {
      const prompt =
        cvEnhancementPromptTemplate + '\n\nINPUT JSON:\n' + JSON.stringify(cvData, null, 2);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Gemini request timeout')), 25000); // 25 seconds timeout for full CV
      });

      const responsePromise = this.ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const response = await Promise.race([responsePromise, timeoutPromise]);
      const latency = Date.now() - startTime;
      logger.info(`[Gemini] Enhanced CV in ${latency}ms`);

      const text = response.text || '{}';
      try {
        const enhancedData = JSON.parse(text.trim());
        // Merge the enhanced fields carefully
        return {
          ...cvData,
          professionalSummary: enhancedData.professionalSummary || cvData.professionalSummary,
          experience: enhancedData.experience || cvData.experience,
          skills: enhancedData.skills || cvData.skills,
          languages: enhancedData.languages || cvData.languages,
          // education and references should be unchanged, but just in case:
          education: cvData.education,
          references: cvData.references,
        };
      } catch (parseError) {
        logger.error(`[Gemini] Failed to parse JSON response: ${parseError}`);
        return cvData;
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error(
        `[Gemini] Error generating content after ${latency}ms: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return cvData; // fallback to original data
    }
  }
}
