import path from 'path';
import fs from 'fs';
import { IPdfStorageProvider } from './pdf-storage.interface.js';
import { config } from '../../app/config/env.js';

export class LocalStorageProvider implements IPdfStorageProvider {
  private outputDir: string;

  constructor() {
    this.outputDir = path.resolve(config.PDF_OUTPUT_PATH);
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async savePdf(fileName: string, content: Buffer): Promise<string | null> {
    try {
      const filePath = path.join(this.outputDir, fileName);
      fs.writeFileSync(filePath, content);
      return this.getPdfUrl(fileName);
    } catch {
      return null;
    }
  }

  getPdfUrl(fileName: string): string {
    return `${config.APP_URL}/assets/pdfs/${fileName}`;
  }
}
