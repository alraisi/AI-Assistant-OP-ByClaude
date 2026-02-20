import { getConfig } from '../config/index.js';
import { withRetry } from '../utils/retry.js';
import pino from 'pino';

const logger = pino({ name: 'web-search' });

const SERPER_BASE_URL = 'https://google.serper.dev';
const IMAGE_DOWNLOAD_TIMEOUT = 10_000;
const MIN_IMAGE_SIZE = 5_000; // skip tiny/broken images

export interface SearchResult {
  title: string;
  snippet: string;
  link: string;
  position: number;
}

export interface ImageResult {
  title: string;
  imageUrl: string;
  link: string;
}

export interface DownloadedImage {
  buffer: Buffer;
  url: string;
  title: string;
}

export class SerperSearchProvider {
  private static instance: SerperSearchProvider | null = null;
  private apiKey: string;

  private constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  static getInstance(): SerperSearchProvider | null {
    if (SerperSearchProvider.instance) return SerperSearchProvider.instance;

    const config = getConfig();
    if (!config.serperApiKey) return null;

    SerperSearchProvider.instance = new SerperSearchProvider(config.serperApiKey);
    return SerperSearchProvider.instance;
  }

  async searchWeb(query: string, limit = 5): Promise<SearchResult[]> {
    try {
      const response = await withRetry(
        async () => {
          const res = await fetch(`${SERPER_BASE_URL}/search`, {
            method: 'POST',
            headers: {
              'X-API-KEY': this.apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ q: query, num: limit }),
          });
          if (!res.ok) {
            const err = new Error(`Serper web search failed with status ${res.status}`);
            (err as any).status = res.status;
            throw err;
          }
          return res;
        },
        { timeoutMs: 15_000, maxRetries: 2, label: 'serper-web-search' }
      );

      const data = await response.json() as { organic?: Array<{ title: string; snippet: string; link: string; position: number }> };
      const organic = data.organic || [];

      return organic.slice(0, limit).map((r) => ({
        title: r.title,
        snippet: r.snippet,
        link: r.link,
        position: r.position,
      }));
    } catch (error) {
      logger.error({ error }, 'Web search error');
      return [];
    }
  }

  async searchImages(query: string, limit = 5): Promise<ImageResult[]> {
    try {
      const response = await withRetry(
        async () => {
          const res = await fetch(`${SERPER_BASE_URL}/images`, {
            method: 'POST',
            headers: {
              'X-API-KEY': this.apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ q: query, num: limit }),
          });
          if (!res.ok) {
            const err = new Error(`Serper image search failed with status ${res.status}`);
            (err as any).status = res.status;
            throw err;
          }
          return res;
        },
        { timeoutMs: 15_000, maxRetries: 2, label: 'serper-image-search' }
      );

      const data = await response.json() as { images?: Array<{ title: string; imageUrl: string; link: string }> };
      const images = data.images || [];

      return images.slice(0, limit).map((r) => ({
        title: r.title,
        imageUrl: r.imageUrl,
        link: r.link,
      }));
    } catch (error) {
      logger.error({ error }, 'Image search error');
      return [];
    }
  }

  async downloadImage(url: string): Promise<Buffer | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < MIN_IMAGE_SIZE) {
        logger.debug({ url, size: buffer.length }, 'Image too small, skipping');
        return null;
      }

      return buffer;
    } catch (error) {
      logger.debug({ url, error }, 'Failed to download image');
      return null;
    }
  }

  async searchAndDownloadImages(query: string, limit = 3): Promise<DownloadedImage[]> {
    const imageResults = await this.searchImages(query, limit + 2); // fetch extra in case some fail

    const downloads = await Promise.all(
      imageResults.map(async (img) => {
        const buffer = await this.downloadImage(img.imageUrl);
        if (!buffer) return null;
        return { buffer, url: img.imageUrl, title: img.title };
      })
    );

    return downloads.filter((d): d is DownloadedImage => d !== null).slice(0, limit);
  }

  formatSearchResultsForContext(results: SearchResult[]): string {
    if (results.length === 0) return '';

    const lines = results.map(
      (r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.link}`
    );

    return `\n--- Web Search Results ---\n${lines.join('\n\n')}\n--- End Search Results ---\n`;
  }
}

export function isSearchEnabled(): boolean {
  return SerperSearchProvider.getInstance() !== null;
}

export function getSearchProvider(): SerperSearchProvider | null {
  return SerperSearchProvider.getInstance();
}
