export interface IPdfStorageProvider {
  savePdf(fileName: string, content: Buffer): Promise<string | null>;
  getPdfUrl(fileName: string): string;
}
