/**
 * URL Fetcher Tool
 * Fetches and extracts content from URLs for summarization
 */

import { withRetry } from '../utils/retry.js';
import pino from 'pino';

const logger = pino({ name: 'url-fetcher' });

const MAX_CONTENT_LENGTH = 50000; // Max characters to extract
const TIMEOUT_MS = 15000; // 15 second timeout
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface UrlContent {
  url: string;
  title: string;
  description: string;
  content: string;
  author?: string;
  publishedDate?: string;
  siteName?: string;
  imageUrl?: string;
  favicon?: string;
}

export interface FetchOptions {
  maxLength?: number;
  timeout?: number;
}

/**
 * Extract URL from text
 */
export function extractUrl(text: string): string | null {
  // Match URLs with various protocols
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/i;
  const match = text.match(urlRegex);
  
  if (match) {
    let url = match[1].trim();
    // Remove trailing punctuation that might be part of the sentence
    url = url.replace(/[.,;:!?)]+$/, '');
    return url;
  }
  
  return null;
}

/**
 * Check if text contains a URL
 */
export function containsUrl(text: string): boolean {
  return extractUrl(text) !== null;
}

/**
 * Fetch and extract content from a URL
 */
export async function fetchUrlContent(
  url: string,
  options: FetchOptions = {}
): Promise<UrlContent | null> {
  const maxLength = options.maxLength || MAX_CONTENT_LENGTH;
  
  try {
    logger.info({ url }, 'Fetching URL content');
    
    const content = await withRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate, br',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
            },
            signal: controller.signal,
            redirect: 'follow',
          });
          
          clearTimeout(timeout);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          // Check content type
          const contentType = response.headers.get('content-type') || '';
          
          // Skip non-HTML content
          if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            throw new Error(`Unsupported content type: ${contentType}`);
          }
          
          const html = await response.text();
          return extractContentFromHtml(html, url);
        } catch (error) {
          clearTimeout(timeout);
          throw error;
        }
      },
      { maxRetries: 2, timeoutMs: TIMEOUT_MS + 5000, label: 'url-fetch' }
    );
    
    // Truncate content if too long
    if (content.content.length > maxLength) {
      content.content = content.content.substring(0, maxLength) + '... [content truncated]';
    }
    
    logger.info(
      { 
        url, 
        title: content.title,
        contentLength: content.content.length 
      }, 
      'URL content fetched successfully'
    );
    
    return content;
  } catch (error) {
    logger.error({ error, url }, 'Failed to fetch URL content');
    return null;
  }
}

/**
 * Extract readable content from HTML
 */
function extractContentFromHtml(html: string, url: string): UrlContent {
  // Remove script and style tags
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<\?xml[^>]*\?>/gi, ' ');
  
  // Extract metadata
  const title = extractMetaTag(cleaned, 'og:title') || 
                extractTagContent(cleaned, 'title') || 
                'Untitled';
  
  const description = extractMetaTag(cleaned, 'og:description') || 
                      extractMetaTag(cleaned, 'description') || 
                      '';
  
  const siteName = extractMetaTag(cleaned, 'og:site_name') || 
                   extractDomain(url);
  
  const author = extractMetaTag(cleaned, 'author') || 
                 extractMetaTag(cleaned, 'article:author') || 
                 undefined;
  
  const publishedDate = extractMetaTag(cleaned, 'article:published_time') || 
                        extractMetaTag(cleaned, 'datePublished') || 
                        undefined;
  
  const imageUrl = extractMetaTag(cleaned, 'og:image') || undefined;
  
  // Extract main content
  let content = '';
  
  // Try to find main content area
  const mainContent = findMainContent(cleaned);
  if (mainContent) {
    content = mainContent;
  } else {
    // Fallback: extract all paragraph text
    content = extractParagraphs(cleaned);
  }
  
  // Clean up the content
  content = cleanText(content);
  
  return {
    url,
    title: cleanText(title),
    description: cleanText(description),
    content,
    author: author ? cleanText(author) : undefined,
    publishedDate,
    siteName: cleanText(siteName),
    imageUrl,
  };
}

/**
 * Extract content from meta tag
 */
function extractMetaTag(html: string, property: string): string | null {
  // Try property attribute (Open Graph)
  const propertyRegex = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const propertyMatch = html.match(propertyRegex);
  if (propertyMatch) return decodeHtmlEntities(propertyMatch[1]);
  
  // Try name attribute
  const nameRegex = new RegExp(
    `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const nameMatch = html.match(nameRegex);
  if (nameMatch) return decodeHtmlEntities(nameMatch[1]);
  
  // Try content attribute first (some sites use this order)
  const contentFirstRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    'i'
  );
  const contentMatch = html.match(contentFirstRegex);
  if (contentMatch) return decodeHtmlEntities(contentMatch[1]);
  
  return null;
}

/**
 * Extract content from HTML tag
 */
function extractTagContent(html: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
  const match = html.match(regex);
  return match ? decodeHtmlEntities(match[1]) : null;
}

/**
 * Find main content area in HTML
 */
function findMainContent(html: string): string | null {
  // Common content container selectors
  const contentPatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]+class=["'][^"']*(?:content|article|post|entry|main)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+id=["'](?:content|article|post|entry|main)["'][^>]*>([\s\S]*?)<\/div>/i,
  ];
  
  for (const pattern of contentPatterns) {
    const match = html.match(pattern);
    if (match) {
      const text = stripHtmlTags(match[1]);
      if (text.length > 200) { // Must have substantial content
        return text;
      }
    }
  }
  
  return null;
}

/**
 * Extract all paragraphs from HTML
 */
function extractParagraphs(html: string): string {
  const paragraphs: string[] = [];
  const regex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    const text = stripHtmlTags(match[1]);
    if (text.length > 30) { // Skip very short paragraphs
      paragraphs.push(text);
    }
  }
  
  // If no paragraphs found, try divs
  if (paragraphs.length === 0) {
    const divRegex = /<div[^>]*>([\s\S]*?)<\/div>/gi;
    while ((match = divRegex.exec(html)) !== null) {
      const text = stripHtmlTags(match[1]);
      if (text.length > 50 && text.length < 1000) {
        paragraphs.push(text);
      }
    }
  }
  
  return paragraphs.join('\n\n');
}

/**
 * Strip HTML tags from text
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ') // Remove tags
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * Clean up extracted text
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/&nbsp;/g, ' ')        // Non-breaking spaces
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Max 2 consecutive newlines
    .trim();
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&hellip;': '...',
  };
  
  return text.replace(
    /&(?:amp|lt|gt|quot|#39|apos|nbsp|ndash|mdash|lsquo|rsquo|ldquo|rdquo|hellip|#[0-9]+|#x[0-9a-f]+);/gi,
    (match) => {
      if (entities[match]) return entities[match];
      
      // Handle numeric entities
      if (match.startsWith('&#x')) {
        return String.fromCharCode(parseInt(match.slice(3, -1), 16));
      }
      if (match.startsWith('&#')) {
        return String.fromCharCode(parseInt(match.slice(2, -1), 10));
      }
      
      return match;
    }
  );
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Format URL content for display
 */
export function formatUrlContent(content: UrlContent): string {
  const parts: string[] = [];
  
  // Title
  parts.push(`📄 *${content.title}*`);
  
  // Site name
  if (content.siteName) {
    parts.push(`🔗 ${content.siteName}`);
  }
  
  // Author and date
  const metaParts: string[] = [];
  if (content.author) metaParts.push(`✍️ ${content.author}`);
  if (content.publishedDate) {
    const date = new Date(content.publishedDate);
    if (!isNaN(date.getTime())) {
      metaParts.push(`📅 ${date.toLocaleDateString()}`);
    }
  }
  if (metaParts.length > 0) {
    parts.push(metaParts.join(' • '));
  }
  
  parts.push(''); // Empty line
  
  // Description
  if (content.description) {
    parts.push(content.description);
    parts.push('');
  }
  
  // Content preview
  if (content.content) {
    const preview = content.content.substring(0, 800);
    parts.push(preview);
    if (content.content.length > 800) {
      parts.push('...');
    }
  }
  
  return parts.join('\n');
}
