import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  VisionProvider,
  VisionRequest,
  VisionResponse,
  MultiVisionProvider,
  MultiVisionRequest,
  MultiVisionResponse,
  ChatWithToolsRequest,
  ChatWithToolsResponse,
  ContentBlock,
} from './types.js';
import { getConfig } from '../config/index.js';
import { withRetry } from '../utils/retry.js';

export class ClaudeProvider implements LLMProvider, VisionProvider, MultiVisionProvider {
  private client: Anthropic;
  private model: string;

  constructor() {
    const config = getConfig();
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
    this.model = config.anthropicModel;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await withRetry(
      () => this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens || 1024,
        system: request.systemPrompt,
        messages: request.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      }),
      { timeoutMs: 60_000, maxRetries: 3, label: 'claude-chat' }
    );

    const textContent = response.content.find((block) => block.type === 'text');
    const content = textContent && 'text' in textContent ? textContent.text : '';

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async analyzeImage(request: VisionRequest): Promise<VisionResponse> {
    const base64Image = request.imageBuffer.toString('base64');

    const mediaType = this.normalizeMediaType(request.mimeType);

    const response = await withRetry(
      () => this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: request.systemPrompt || 'You are a helpful assistant that describes images.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: request.prompt,
              },
            ],
          },
        ],
      }),
      { timeoutMs: 90_000, maxRetries: 3, label: 'claude-vision' }
    );

    const textContent = response.content.find((block) => block.type === 'text');
    const content = textContent && 'text' in textContent ? textContent.text : '';

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async analyzeMultipleImages(request: MultiVisionRequest): Promise<MultiVisionResponse> {
    // Build content blocks for all images
    const contentBlocks: Array<
      | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } }
      | { type: 'text'; text: string }
    > = [];

    // Add all images
    for (const image of request.images) {
      const base64Image = image.imageBuffer.toString('base64');
      const mediaType = this.normalizeMediaType(image.mimeType);
      
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Image,
        },
      });
    }

    // Add the prompt text
    contentBlocks.push({
      type: 'text',
      text: request.prompt,
    });

    const response = await withRetry(
      () => this.client.messages.create({
        model: this.model,
        max_tokens: 2048, // Higher limit for multiple images
        system: request.systemPrompt || 'You are a helpful assistant that analyzes multiple images.',
        messages: [
          {
            role: 'user',
            content: contentBlocks,
          },
        ],
      }),
      { timeoutMs: 120_000, maxRetries: 2, label: 'claude-multi-vision' }
    );

    // Type assertion since we know it's not streaming
    const msg = response as { content: Array<{ type: string; text?: string }>; usage: { input_tokens: number; output_tokens: number } };
    
    const textContent = msg.content.find((block) => block.type === 'text');
    const content = textContent?.text || '';

    return {
      content,
      usage: {
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      },
    };
  }

  async chatWithTools(request: ChatWithToolsRequest): Promise<ChatWithToolsResponse> {
    const messages = request.messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content as string | Array<{ type: string; [key: string]: unknown }>,
    }));

    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema,
    }));

    const response = await withRetry(
      async () => {
        const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
          model: this.model,
          max_tokens: request.maxTokens || 2048,
          system: request.systemPrompt,
          messages: messages as Anthropic.Messages.MessageParam[],
          ...(tools && tools.length > 0 ? { tools } : {}),
        };
        return this.client.messages.create(params);
      },
      { timeoutMs: 90_000, maxRetries: 2, label: 'claude-chat-tools' }
    );

    return {
      content: response.content as ContentBlock[],
      stopReason: response.stop_reason as 'end_turn' | 'tool_use' | 'max_tokens',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private normalizeMediaType(
    mimeType: string
  ): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
    const normalized = mimeType.toLowerCase();
    if (normalized.includes('jpeg') || normalized.includes('jpg')) {
      return 'image/jpeg';
    }
    if (normalized.includes('png')) {
      return 'image/png';
    }
    if (normalized.includes('gif')) {
      return 'image/gif';
    }
    if (normalized.includes('webp')) {
      return 'image/webp';
    }
    return 'image/jpeg'; // Default fallback
  }
}

let instance: ClaudeProvider | null = null;

export function getClaudeProvider(): ClaudeProvider {
  if (!instance) {
    instance = new ClaudeProvider();
  }
  return instance;
}
