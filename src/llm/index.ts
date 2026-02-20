import { getClaudeProvider, ClaudeProvider } from './claude.js';
import { getOpenAIProvider, OpenAIProvider } from './openai.js';
import { getGeminiProvider, GeminiProvider } from './gemini.js';
import { getConfig } from '../config/index.js';
import type {
  LLMProvider,
  VisionProvider,
  TranscriptionProvider,
  TTSProvider,
  ImageGenerationProvider,
  DocumentAnalysisProvider,
} from './types.js';

export type { LLMProvider, VisionProvider, TranscriptionProvider, TTSProvider, ImageGenerationProvider, DocumentAnalysisProvider };
export * from './types.js';

export function getChatProvider(): LLMProvider {
  return getClaudeProvider();
}

export function getVisionProvider(): VisionProvider {
  return getClaudeProvider();
}

export function getTranscriptionProvider(): TranscriptionProvider {
  return getOpenAIProvider();
}

export function getTTSProvider(): TTSProvider {
  return getOpenAIProvider();
}

/**
 * Get image generation provider with Gemini as primary, DALL-E as fallback
 * Gemini 2.0 Flash supports native image generation
 */
export function getImageGenerationProvider(): ImageGenerationProvider {
  const config = getConfig();
  
  // Try Gemini first if API key is available
  if (config.geminiApiKey) {
    try {
      return getGeminiProvider();
    } catch (error) {
      console.log('  Gemini image generation not available, falling back to DALL-E');
    }
  }
  
  // Fallback to OpenAI/DALL-E
  return getOpenAIProvider();
}

/**
 * Generate image with Gemini (primary) or DALL-E (fallback)
 * This helper function handles the fallback logic explicitly
 */
export async function generateImageWithFallback(
  prompt: string,
  size?: '1024x1024' | '1024x1792' | '1792x1024',
  quality?: 'standard' | 'hd'
): Promise<{ imageBuffer: Buffer; revisedPrompt?: string; provider: string }> {
  const config = getConfig();
  
  // Try Gemini first
  if (config.geminiApiKey) {
    try {
      const gemini = getGeminiProvider();
      const result = await gemini.generateImage({ prompt, size, quality });
      return { ...result, provider: 'Gemini' };
    } catch (error) {
      console.log('  Gemini image generation failed, trying DALL-E fallback...');
    }
  }
  
  // Fallback to OpenAI/DALL-E
  const openai = getOpenAIProvider();
  const result = await openai.generateImage({ prompt, size, quality });
  return { ...result, provider: 'DALL-E' };
}

export function getDocumentGenerationProvider(): LLMProvider {
  const config = getConfig();
  if (config.geminiApiKey) {
    return getGeminiProvider();
  }
  return getClaudeProvider();
}

export function getDocumentAnalysisProvider(): GeminiProvider {
  return getGeminiProvider();
}

// Re-export specific providers for direct access
export { getClaudeProvider, ClaudeProvider };
export { getOpenAIProvider, OpenAIProvider };
export { getGeminiProvider, GeminiProvider };
