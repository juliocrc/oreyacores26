import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

async function extractPdfText(filePath: string): Promise<string> {
  const fileName = path.basename(filePath);
  const buffer = fs.readFileSync(filePath);
  
  // Use pdf-lib to get page count and basic info
  const pdfDoc = await PDFDocument.load(buffer);
  const pageCount = pdfDoc.getPageCount();
  
  console.log(`=== ${fileName} ===`);
  console.log(`Pages: ${pageCount}`);
  console.log(`File size: ${buffer.length} bytes`);
  console.log('');
  
  // Note: pdf-lib doesn't extract text content well
  // We'd need pdf-parse or pdfjs-dist for text extraction
  // For now, just report basic info
  return `PDF: ${fileName}, Pages: ${pageCount}, Size: ${buffer.length} bytes`;
}

async function main() {
  const files = [
    'C:/Users/julio/Desktop/OREYACORESDELUXE/OREY AZORES MAR 17 AUDIT.pdf',
    'C:/Users/julio/Desktop/OREYACORESDELUXE/certificate_of_approval_50937.pdf'
  ];
  
  for (const file of files) {
    try {
      await extractPdfText(file);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }
}

main().catch(console.error);