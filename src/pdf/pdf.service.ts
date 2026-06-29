import puppeteer from 'puppeteer';
import { logger } from '../utils/logger.js';
import { IPdfStorageProvider } from './storage/pdf-storage.interface.js';

export class PDFService {
  constructor(private storageProvider: IPdfStorageProvider) {}

  async generatePDF(htmlContent: string, fileName: string): Promise<string | null> {
    const startTime = Date.now();
    let browser;
    try {
      const puppeteerOptions: Parameters<typeof puppeteer.launch>[0] = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      };

      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }

      browser = await puppeteer.launch(puppeteerOptions);

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
      });

      await browser.close();
      browser = undefined;

      const pdfUrl = await this.storageProvider.savePdf(fileName, Buffer.from(pdfBuffer));

      const latency = Date.now() - startTime;
      logger.info(`[PDF] Generated PDF ${fileName} in ${latency}ms`);

      return pdfUrl;
    } catch (error) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      const latency = Date.now() - startTime;
      logger.error(`[PDF] Error generating PDF after ${latency}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }
}

