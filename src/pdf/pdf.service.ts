import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { config } from '../app/config/env.js';

export class PDFService {
  async generatePDF(htmlContent: string, fileName: string): Promise<string | null> {
    const startTime = Date.now();
    try {
      // Ensure the output directory exists
      const outputDir = path.resolve(config.PDF_OUTPUT_PATH);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filePath = path.join(outputDir, fileName);

      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
      });

      await browser.close();

      const latency = Date.now() - startTime;
      logger.info(`[PDF] Generated PDF ${fileName} in ${latency}ms`);

      return filePath;
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error(`[PDF] Error generating PDF after ${latency}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }
}
