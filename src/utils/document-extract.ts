import { OfficeParser } from 'officeparser';
import pino from 'pino';

const logger = pino({ name: 'document-extract' });

const MAX_TEXT_LENGTH = 100_000;

export interface ExtractedDocument {
  text: string;
  format: string;
}

export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractedDocument> {
  // PDF: return empty text — buffer is sent directly to Gemini via inlineData
  if (mimeType === 'application/pdf') {
    return { text: '', format: 'pdf' };
  }

  // Plain text, CSV, JSON: decode as UTF-8
  if (
    mimeType === 'text/plain' ||
    mimeType === 'text/csv' ||
    mimeType === 'application/json'
  ) {
    const format = mimeType === 'text/csv' ? 'csv'
      : mimeType === 'application/json' ? 'json'
      : 'txt';
    let text = buffer.toString('utf-8');
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.slice(0, MAX_TEXT_LENGTH) + '\n\n[Content truncated due to size]';
    }
    return { text, format };
  }

  // Office formats (DOCX, PPTX, XLSX): use officeparser
  try {
    const ast = await OfficeParser.parseOffice(buffer);
    let text = ast.toText();
    const format = getFormatFromMime(mimeType, fileName);

    if (text.length > MAX_TEXT_LENGTH) {
      text = text.slice(0, MAX_TEXT_LENGTH) + '\n\n[Content truncated due to size]';
    }

    logger.info({
      fileName,
      mimeType,
      format,
      extractedLength: text.length,
    }, 'Text extracted from document');

    return { text, format };
  } catch (error) {
    logger.error({ error, fileName, mimeType }, 'Failed to extract text from document');
    throw new Error(`Failed to extract text from ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function getFormatFromMime(mimeType: string, fileName: string): string {
  if (mimeType.includes('wordprocessingml') || fileName.endsWith('.docx')) return 'docx';
  if (mimeType.includes('spreadsheetml') || fileName.endsWith('.xlsx')) return 'xlsx';
  if (mimeType.includes('presentationml') || fileName.endsWith('.pptx')) return 'pptx';
  return 'document';
}
