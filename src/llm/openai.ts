import OpenAI from 'openai';
import type {
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResponse,
  TTSProvider,
  TTSRequest,
  TTSResponse,
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResponse,
} from './types.js';
import { getConfig } from '../config/index.js';
import { withRetry } from '../utils/retry.js';

export class OpenAIProvider implements TranscriptionProvider, TTSProvider, ImageGenerationProvider {
  private client: OpenAI;
  private whisperModel: string;

  constructor() {
    const config = getConfig();
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.whisperModel = config.whisperModel;
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    // Create a File-like object from the buffer
    const file = new File([request.audioBuffer], 'audio.ogg', {
      type: request.mimeType,
    });

    const response = await withRetry(
      () => this.client.audio.transcriptions.create({
        file,
        model: this.whisperModel,
        language: request.language,
        response_format: 'verbose_json',
      }),
      { timeoutMs: 60_000, maxRetries: 3, label: 'openai-transcribe' }
    );

    return {
      text: response.text,
      language: response.language,
      duration: response.duration,
    };
  }

  async synthesize(request: TTSRequest): Promise<TTSResponse> {
    const response = await withRetry(
      () => this.client.audio.speech.create({
        model: 'tts-1',
        voice: request.voice || 'nova',
        input: request.text,
        speed: request.speed || 1.0,
        response_format: 'opus',
      }),
      { timeoutMs: 30_000, maxRetries: 2, label: 'openai-tts' }
    );

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    return {
      audioBuffer,
      mimeType: 'audio/ogg; codecs=opus',
    };
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const response = await withRetry(
      () => this.client.images.generate({
        model: 'dall-e-3',
        prompt: request.prompt,
        n: 1,
        size: request.size || '1024x1024',
        quality: request.quality || 'standard',
        response_format: 'b64_json',
      }),
      { timeoutMs: 120_000, maxRetries: 2, label: 'openai-image-gen' }
    );

    if (!response.data || response.data.length === 0) {
      throw new Error('No image data received');
    }

    const imageData = response.data[0];
    if (!imageData.b64_json) {
      throw new Error('No image data in response');
    }

    const imageBuffer = Buffer.from(imageData.b64_json, 'base64');

    return {
      imageBuffer,
      revisedPrompt: imageData.revised_prompt,
    };
  }
}

// Export OpenAI client for direct use (e.g., embeddings)
export const openai = new OpenAI({
  apiKey: getConfig().openaiApiKey,
});

let instance: OpenAIProvider | null = null;

export function getOpenAIProvider(): OpenAIProvider {
  if (!instance) {
    instance = new OpenAIProvider();
  }
  return instance;
}
