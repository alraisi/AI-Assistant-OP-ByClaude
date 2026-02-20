import type { WASocket } from '@whiskeysockets/baileys';
import { generateImageWithFallback, getChatProvider, getDocumentGenerationProvider } from '../llm/index.js';
import type { MessageContext } from '../llm/types.js';
import PDFDocument from 'pdfkit';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
} from 'docx';
import PptxGenJS from 'pptxgenjs';
import ExcelJS from 'exceljs';
import { getSearchProvider, type SearchResult, type DownloadedImage } from '../tools/web-search.js';
import pino from 'pino';

const logger = pino({ name: 'generate-handler' });

export interface GenerateResult {
  success: boolean;
  type: 'image' | 'document' | 'none';
  error?: string;
}

type DocumentType = 'pdf' | 'word' | 'powerpoint' | 'excel' | 'none';

// Patterns to detect generation requests
const IMAGE_PATTERNS = [
  /\b(create|generate|make|draw|design)\b.{0,20}\b(image|picture|photo|illustration|art|artwork|logo|icon)\b/i,
  /\b(image|picture|photo|illustration)\b.{0,20}\b(of|for|about|showing)\b/i,
];

const WORD_PATTERNS = [
  /\b(create|generate|make|write)\b.{0,20}\b(word|docx|word document|word file)\b/i,
  /\bword\s+(document|file)\b.{0,20}\b(about|for|on)\b/i,
];

const POWERPOINT_PATTERNS = [
  /\b(create|generate|make)\b.{0,20}\b(powerpoint|pptx|presentation|ppt|slides?)\b/i,
  /\b(powerpoint|presentation|slides?)\b.{0,20}\b(about|for|on)\b/i,
];

const EXCEL_PATTERNS = [
  /\b(create|generate|make)\b.{0,20}\b(excel|xlsx|spreadsheet|worksheet)\b/i,
  /\b(excel|spreadsheet)\b.{0,20}\b(about|for|on|with)\b/i,
];

const PDF_PATTERNS = [
  /\b(create|generate|make|write)\b.{0,20}\b(pdf|document|doc|file|report|guide|manual|instructions|recipe)\b/i,
  /\b(document|doc|pdf|file|report|guide)\b.{0,20}\b(about|for|on|explaining)\b/i,
];

export function detectGenerationType(text: string): 'image' | 'document' | 'none' {
  for (const pattern of IMAGE_PATTERNS) {
    if (pattern.test(text)) {
      return 'image';
    }
  }

  // Check for any document type
  if (detectDocumentType(text) !== 'none') {
    return 'document';
  }

  return 'none';
}

function detectDocumentType(text: string): DocumentType {
  // Check specific formats first (more specific patterns)
  for (const pattern of WORD_PATTERNS) {
    if (pattern.test(text)) return 'word';
  }
  for (const pattern of POWERPOINT_PATTERNS) {
    if (pattern.test(text)) return 'powerpoint';
  }
  for (const pattern of EXCEL_PATTERNS) {
    if (pattern.test(text)) return 'excel';
  }
  // Default to PDF for generic document requests
  for (const pattern of PDF_PATTERNS) {
    if (pattern.test(text)) return 'pdf';
  }
  return 'none';
}

export async function handleImageGeneration(
  sock: WASocket,
  prompt: string,
  context: MessageContext
): Promise<GenerateResult> {
  try {
    logger.info({ prompt: prompt.slice(0, 100) }, 'Generating image');
    await sock.sendPresenceUpdate('composing', context.chatJid);

    // Use Gemini as primary, DALL-E as fallback
    const result = await generateImageWithFallback(prompt, '1024x1024', 'standard');

    await sock.sendMessage(context.chatJid, {
      image: result.imageBuffer,
      caption: `🎨 Generated with ${result.provider}\n\n${result.revisedPrompt || 'Here\'s your image!'}`,
    });

    logger.info({ size: result.imageBuffer.length, provider: result.provider }, 'Image sent');
    return { success: true, type: 'image' };
  } catch (error) {
    logger.error({ error }, 'Failed to generate image');
    await sock.sendMessage(context.chatJid, {
      text: "Sorry, I couldn't generate that image. Please try a different description.",
    });
    return { success: false, type: 'image', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============== WEB RESEARCH ==============

interface ResearchData {
  snippets: string;
  images: DownloadedImage[];
}

function extractSearchQuery(request: string): string {
  // Strip common command prefixes to get the topic
  return request
    .replace(/\b(create|generate|make|write)\b.{0,20}\b(a|an|the|my)?\s*/i, '')
    .replace(/\b(pdf|document|doc|word|docx|powerpoint|pptx|presentation|slides?|excel|xlsx|spreadsheet|file|report|guide)\b\s*/gi, '')
    .replace(/\b(about|for|on|explaining)\b\s*/i, '')
    .trim() || request;
}

async function gatherResearch(topic: string): Promise<ResearchData> {
  const searchProvider = getSearchProvider();
  if (!searchProvider) {
    return { snippets: '', images: [] };
  }

  try {
    const [webResults, images] = await Promise.all([
      searchProvider.searchWeb(topic, 5),
      searchProvider.searchAndDownloadImages(topic, 3),
    ]);

    const snippets = searchProvider.formatSearchResultsForContext(webResults);

    logger.info({
      topic,
      webResults: webResults.length,
      images: images.length,
    }, 'Research gathered');

    return { snippets, images };
  } catch (error) {
    logger.error({ error }, 'Failed to gather research');
    return { snippets: '', images: [] };
  }
}

// ============== DOCUMENT GENERATION ==============

export async function handleDocumentGeneration(
  sock: WASocket,
  request: string,
  context: MessageContext
): Promise<GenerateResult> {
  const docType = detectDocumentType(request);

  switch (docType) {
    case 'word':
      return handleWordGeneration(sock, request, context);
    case 'powerpoint':
      return handlePowerPointGeneration(sock, request, context);
    case 'excel':
      return handleExcelGeneration(sock, request, context);
    case 'pdf':
    default:
      return handlePDFGeneration(sock, request, context);
  }
}

// ============== PDF GENERATION ==============

interface DocumentSection {
  heading: string;
  content: string;
  subsections?: { heading: string; content: string }[];
}

interface DocumentStructure {
  title: string;
  subtitle?: string;
  introduction: string;
  sections: DocumentSection[];
  conclusion?: string;
}

async function handlePDFGeneration(
  sock: WASocket,
  request: string,
  context: MessageContext
): Promise<GenerateResult> {
  const chatProvider = getDocumentGenerationProvider();

  try {
    logger.info({ request: request.slice(0, 100) }, 'Generating PDF');
    await sock.sendPresenceUpdate('composing', context.chatJid);

    // Gather web research in parallel
    const topic = extractSearchQuery(request);
    const research = await gatherResearch(topic);

    let researchPrompt = '';
    if (research.snippets) {
      researchPrompt = `\n\nUse the following web research to enrich your content with accurate, up-to-date information:\n${research.snippets}`;
    }

    const response = await chatProvider.chat({
      systemPrompt: `You are a professional document writer. Create well-structured content.

Respond with a valid JSON object:
{
  "title": "Document Title",
  "subtitle": "Optional subtitle",
  "introduction": "Introduction paragraph.",
  "sections": [
    {
      "heading": "Section Title",
      "content": "Section content...",
      "subsections": [{"heading": "Subsection", "content": "..."}]
    }
  ],
  "conclusion": "Concluding paragraph."
}

Create comprehensive, professional content. Respond ONLY with JSON.${researchPrompt}`,
      messages: [{ role: 'user', content: `Create a detailed document about: ${request}` }],
      maxTokens: 8192,
    });

    const documentData = parseJSON<DocumentStructure>(response.content, {
      title: extractTitle(request),
      introduction: 'Document content.',
      sections: [{ heading: 'Content', content: response.content }],
    });

    const pdfBuffer = await generatePDF(documentData, research.images);
    const fileName = sanitizeFileName(documentData.title) + '.pdf';

    await sock.sendMessage(context.chatJid, {
      document: pdfBuffer,
      mimetype: 'application/pdf',
      fileName,
      caption: `📄 ${documentData.title}`,
    });

    logger.info({ fileName, images: research.images.length }, 'PDF sent');
    return { success: true, type: 'document' };
  } catch (error) {
    logger.error({ error }, 'Failed to generate PDF');
    await sock.sendMessage(context.chatJid, { text: "Sorry, I couldn't create that PDF. Please try again." });
    return { success: false, type: 'document', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============== WORD GENERATION ==============

interface WordStructure {
  title: string;
  sections: { heading: string; paragraphs: string[] }[];
}

async function handleWordGeneration(
  sock: WASocket,
  request: string,
  context: MessageContext
): Promise<GenerateResult> {
  const chatProvider = getDocumentGenerationProvider();

  try {
    logger.info({ request: request.slice(0, 100) }, 'Generating Word document');
    await sock.sendPresenceUpdate('composing', context.chatJid);

    const topic = extractSearchQuery(request);
    const research = await gatherResearch(topic);

    let researchPrompt = '';
    if (research.snippets) {
      researchPrompt = `\n\nUse the following web research to enrich your content with accurate, up-to-date information:\n${research.snippets}`;
    }

    const response = await chatProvider.chat({
      systemPrompt: `You are a professional document writer. Create well-structured content for a Word document.

Respond with a valid JSON object:
{
  "title": "Document Title",
  "sections": [
    {
      "heading": "Section Heading",
      "paragraphs": ["Paragraph 1 text...", "Paragraph 2 text..."]
    }
  ]
}

Create comprehensive, professional content with multiple sections. Respond ONLY with JSON.${researchPrompt}`,
      messages: [{ role: 'user', content: `Create a Word document about: ${request}` }],
      maxTokens: 8192,
    });

    const docData = parseJSON<WordStructure>(response.content, {
      title: extractTitle(request),
      sections: [{ heading: 'Content', paragraphs: [response.content] }],
    });

    const wordBuffer = await generateWord(docData, research.images);
    const fileName = sanitizeFileName(docData.title) + '.docx';

    await sock.sendMessage(context.chatJid, {
      document: wordBuffer,
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName,
      caption: `📝 ${docData.title}`,
    });

    logger.info({ fileName, images: research.images.length }, 'Word document sent');
    return { success: true, type: 'document' };
  } catch (error) {
    logger.error({ error }, 'Failed to generate Word document');
    await sock.sendMessage(context.chatJid, { text: "Sorry, I couldn't create that Word document. Please try again." });
    return { success: false, type: 'document', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function generateWord(data: WordStructure, images: DownloadedImage[] = []): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      text: data.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Date
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          italics: true,
          size: 20,
          color: '888888',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Sections
  for (const section of data.sections) {
    children.push(
      new Paragraph({
        text: section.heading,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    for (const para of section.paragraphs) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: para, size: 24 })],
          spacing: { after: 200 },
        })
      );
    }
  }

  // Reference Images
  if (images.length > 0) {
    children.push(
      new Paragraph({
        text: 'Reference Images',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    for (const img of images) {
      try {
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: img.buffer,
                transformation: { width: 400, height: 300 },
                type: 'png',
              }),
            ],
            spacing: { after: 100 },
            alignment: AlignmentType.CENTER,
          })
        );
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: img.title, italics: true, size: 18, color: '666666' }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          })
        );
      } catch (error) {
        logger.debug({ error, title: img.title }, 'Failed to embed image in Word');
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return await Packer.toBuffer(doc);
}

// ============== POWERPOINT GENERATION ==============

interface SlideData {
  title: string;
  bullets?: string[];
  content?: string;
}

interface PresentationStructure {
  title: string;
  subtitle?: string;
  slides: SlideData[];
}

async function handlePowerPointGeneration(
  sock: WASocket,
  request: string,
  context: MessageContext
): Promise<GenerateResult> {
  const chatProvider = getDocumentGenerationProvider();

  try {
    logger.info({ request: request.slice(0, 100) }, 'Generating PowerPoint');
    await sock.sendPresenceUpdate('composing', context.chatJid);

    const topic = extractSearchQuery(request);
    const research = await gatherResearch(topic);

    let researchPrompt = '';
    if (research.snippets) {
      researchPrompt = `\n\nUse the following web research to enrich your content with accurate, up-to-date information:\n${research.snippets}`;
    }

    const response = await chatProvider.chat({
      systemPrompt: `You are a presentation designer. Create content for a PowerPoint presentation.

Respond with a valid JSON object:
{
  "title": "Presentation Title",
  "subtitle": "Optional subtitle",
  "slides": [
    {
      "title": "Slide Title",
      "bullets": ["Point 1", "Point 2", "Point 3"]
    },
    {
      "title": "Another Slide",
      "content": "Paragraph content for this slide"
    }
  ]
}

Create 5-10 informative slides. Use bullets for most slides. Respond ONLY with JSON.${researchPrompt}`,
      messages: [{ role: 'user', content: `Create a PowerPoint presentation about: ${request}` }],
      maxTokens: 8192,
    });

    const pptData = parseJSON<PresentationStructure>(response.content, {
      title: extractTitle(request),
      slides: [{ title: 'Content', bullets: [response.content.slice(0, 200)] }],
    });

    const pptBuffer = await generatePowerPoint(pptData, research.images);
    const fileName = sanitizeFileName(pptData.title) + '.pptx';

    await sock.sendMessage(context.chatJid, {
      document: pptBuffer,
      mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileName,
      caption: `📊 ${pptData.title}`,
    });

    logger.info({ fileName, images: research.images.length }, 'PowerPoint sent');
    return { success: true, type: 'document' };
  } catch (error) {
    logger.error({ error }, 'Failed to generate PowerPoint');
    await sock.sendMessage(context.chatJid, { text: "Sorry, I couldn't create that presentation. Please try again." });
    return { success: false, type: 'document', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function generatePowerPoint(data: PresentationStructure, images: DownloadedImage[] = []): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = 'Buddy AI Assistant';
  pptx.title = data.title;

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.addText(data.title, {
    x: 0.5,
    y: 2,
    w: 9,
    h: 1.5,
    fontSize: 44,
    bold: true,
    align: 'center',
    color: '363636',
  });
  if (data.subtitle) {
    titleSlide.addText(data.subtitle, {
      x: 0.5,
      y: 3.5,
      w: 9,
      h: 0.75,
      fontSize: 24,
      align: 'center',
      color: '666666',
    });
  }

  // Content slides
  for (const slideData of data.slides) {
    const slide = pptx.addSlide();

    // Slide title
    slide.addText(slideData.title, {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: '363636',
    });

    if (slideData.bullets && slideData.bullets.length > 0) {
      // Bullet points
      const bulletText = slideData.bullets.map((b) => ({ text: b, options: { bullet: true, fontSize: 18 } }));
      slide.addText(bulletText, {
        x: 0.5,
        y: 1.3,
        w: 9,
        h: 4,
        color: '444444',
        valign: 'top',
      });
    } else if (slideData.content) {
      // Paragraph content
      slide.addText(slideData.content, {
        x: 0.5,
        y: 1.3,
        w: 9,
        h: 4,
        fontSize: 18,
        color: '444444',
        valign: 'top',
      });
    }
  }

  // Image slides
  if (images.length > 0) {
    for (const img of images) {
      try {
        const slide = pptx.addSlide();
        slide.addText(img.title, {
          x: 0.5,
          y: 0.3,
          w: 9,
          h: 0.6,
          fontSize: 18,
          italic: true,
          color: '666666',
          align: 'center',
        });
        const base64 = img.buffer.toString('base64');
        slide.addImage({
          data: `image/png;base64,${base64}`,
          x: 1.5,
          y: 1.2,
          w: 7,
          h: 4.5,
        });
      } catch (error) {
        logger.debug({ error, title: img.title }, 'Failed to embed image in PowerPoint');
      }
    }
  }

  // Generate buffer
  const uint8Array = await pptx.write({ outputType: 'uint8array' }) as Uint8Array;
  return Buffer.from(uint8Array);
}

// ============== EXCEL GENERATION ==============

interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

interface ExcelSheet {
  name: string;
  columns: ExcelColumn[];
  rows: Record<string, string | number>[];
}

interface ExcelStructure {
  title: string;
  sheets: ExcelSheet[];
}

async function handleExcelGeneration(
  sock: WASocket,
  request: string,
  context: MessageContext
): Promise<GenerateResult> {
  const chatProvider = getDocumentGenerationProvider();

  try {
    logger.info({ request: request.slice(0, 100) }, 'Generating Excel');
    await sock.sendPresenceUpdate('composing', context.chatJid);

    // Only gather web snippets for Excel (no images)
    const topic = extractSearchQuery(request);
    const searchProvider = getSearchProvider();
    let researchPrompt = '';
    if (searchProvider) {
      try {
        const webResults = await searchProvider.searchWeb(topic, 5);
        const snippets = searchProvider.formatSearchResultsForContext(webResults);
        if (snippets) {
          researchPrompt = `\n\nUse the following web research to provide accurate, up-to-date data:\n${snippets}`;
        }
      } catch (error) {
        logger.debug({ error }, 'Excel research failed, continuing without');
      }
    }

    const response = await chatProvider.chat({
      systemPrompt: `You are a spreadsheet expert. Create structured data for an Excel file.

Respond with a valid JSON object:
{
  "title": "Spreadsheet Title",
  "sheets": [
    {
      "name": "Sheet1",
      "columns": [
        {"header": "Column A", "key": "colA", "width": 20},
        {"header": "Column B", "key": "colB", "width": 30}
      ],
      "rows": [
        {"colA": "Value 1", "colB": "Value 2"},
        {"colA": "Value 3", "colB": "Value 4"}
      ]
    }
  ]
}

Create useful, realistic data with 5-20 rows. Respond ONLY with JSON.${researchPrompt}`,
      messages: [{ role: 'user', content: `Create an Excel spreadsheet about: ${request}` }],
      maxTokens: 8192,
    });

    const excelData = parseJSON<ExcelStructure>(response.content, {
      title: extractTitle(request),
      sheets: [{
        name: 'Sheet1',
        columns: [{ header: 'Data', key: 'data', width: 50 }],
        rows: [{ data: 'Generated content' }],
      }],
    });

    const excelBuffer = await generateExcel(excelData);
    const fileName = sanitizeFileName(excelData.title) + '.xlsx';

    await sock.sendMessage(context.chatJid, {
      document: excelBuffer,
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName,
      caption: `📊 ${excelData.title}`,
    });

    logger.info({ fileName }, 'Excel sent');
    return { success: true, type: 'document' };
  } catch (error) {
    logger.error({ error }, 'Failed to generate Excel');
    await sock.sendMessage(context.chatJid, { text: "Sorry, I couldn't create that spreadsheet. Please try again." });
    return { success: false, type: 'document', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function generateExcel(data: ExcelStructure): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Buddy AI Assistant';
  workbook.created = new Date();

  for (const sheetData of data.sheets) {
    const sheet = workbook.addWorksheet(sheetData.name);

    // Set columns
    sheet.columns = sheetData.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 15,
    }));

    // Style header row
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add rows
    for (const row of sheetData.rows) {
      sheet.addRow(row);
    }

    // Auto-fit columns (approximate)
    sheet.columns.forEach((column) => {
      if (column.width && column.width < 10) {
        column.width = 10;
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ============== PDF GENERATION (existing) ==============

async function generatePDF(doc: DocumentStructure, images: DownloadedImage[] = []): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const chunks: Buffer[] = [];
      const pdf = new PDFDocument({
        size: 'A4',
        margins: { top: 72, bottom: 72, left: 72, right: 72 },
        info: { Title: doc.title, Author: 'Buddy AI Assistant' },
      });

      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      // Title
      pdf.fontSize(24).font('Helvetica-Bold').text(doc.title, { align: 'center' });

      if (doc.subtitle) {
        pdf.moveDown(0.5).fontSize(14).font('Helvetica-Oblique').fillColor('#666666').text(doc.subtitle, { align: 'center' });
      }

      // Date
      pdf.moveDown(0.5).fontSize(10).font('Helvetica').fillColor('#888888')
        .text(`Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });

      // Line
      pdf.moveDown(1).strokeColor('#cccccc').lineWidth(1).moveTo(72, pdf.y).lineTo(pdf.page.width - 72, pdf.y).stroke();

      // Introduction
      pdf.moveDown(1.5).fontSize(12).font('Helvetica').fillColor('#333333').text(doc.introduction, { align: 'justify', lineGap: 4 });

      // Sections
      for (const section of doc.sections) {
        pdf.moveDown(1.5).fontSize(16).font('Helvetica-Bold').fillColor('#000000').text(section.heading);
        pdf.moveDown(0.5).fontSize(12).font('Helvetica').fillColor('#333333').text(section.content, { align: 'justify', lineGap: 4 });

        if (section.subsections) {
          for (const sub of section.subsections) {
            pdf.moveDown(1).fontSize(13).font('Helvetica-Bold').fillColor('#444444').text(sub.heading);
            pdf.moveDown(0.3).fontSize(12).font('Helvetica').fillColor('#333333').text(sub.content, { align: 'justify', lineGap: 4 });
          }
        }
      }

      if (doc.conclusion) {
        pdf.moveDown(1.5).fontSize(16).font('Helvetica-Bold').fillColor('#000000').text('Conclusion');
        pdf.moveDown(0.5).fontSize(12).font('Helvetica').fillColor('#333333').text(doc.conclusion, { align: 'justify', lineGap: 4 });
      }

      // Reference Images
      if (images.length > 0) {
        pdf.addPage();
        pdf.fontSize(18).font('Helvetica-Bold').fillColor('#000000').text('Reference Images', { align: 'center' });
        pdf.moveDown(1);

        for (const img of images) {
          try {
            const imgY = pdf.y;
            if (imgY > pdf.page.height - 300) {
              pdf.addPage();
            }
            pdf.image(img.buffer, {
              fit: [400, 300],
              align: 'center',
            });
            pdf.moveDown(0.5).fontSize(9).font('Helvetica-Oblique').fillColor('#666666')
              .text(img.title, { align: 'center' });
            pdf.moveDown(1);
          } catch (error) {
            logger.debug({ error, title: img.title }, 'Failed to embed image in PDF');
          }
        }
      }

      pdf.moveDown(2).fontSize(9).font('Helvetica-Oblique').fillColor('#999999').text('Generated by Buddy AI Assistant', { align: 'center' });

      pdf.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ============== UTILITIES ==============

function extractTitle(request: string): string {
  const match = request.match(/(?:about|for|on|explaining|how to)\s+(.+?)(?:\.|$)/i);
  return match ? match[1].slice(0, 50).replace(/[^a-zA-Z0-9\s]/g, '').trim() : 'Document';
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').slice(0, 50);
}

function parseJSON<T>(content: string, fallback: T): T {
  try {
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
    return JSON.parse(jsonStr.trim());
  } catch {
    logger.warn({ content: content.slice(0, 100) }, 'Failed to parse JSON, using fallback');
    return fallback;
  }
}
