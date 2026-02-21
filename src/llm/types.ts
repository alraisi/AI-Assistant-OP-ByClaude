export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  systemPrompt: string;
  messages: Message[];
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
}

export interface TranscriptionRequest {
  audioBuffer: Buffer;
  mimeType: string;
  language?: string;
}

export interface TranscriptionResponse {
  text: string;
  language?: string;
  duration?: number;
}

export interface TranscriptionProvider {
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse>;
}

export interface VisionRequest {
  imageBuffer: Buffer;
  mimeType: string;
  prompt: string;
  systemPrompt?: string;
}

export interface VisionResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface VisionProvider {
  analyzeImage(request: VisionRequest): Promise<VisionResponse>;
}

// Multi-Image Analysis (Phase 3)
export interface ImageData {
  imageBuffer: Buffer;
  mimeType: string;
  caption?: string;
}

export interface MultiVisionRequest {
  images: ImageData[];
  prompt: string;
  systemPrompt?: string;
}

export interface MultiVisionResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface MultiVisionProvider {
  analyzeMultipleImages(request: MultiVisionRequest): Promise<MultiVisionResponse>;
}

export interface MessageContext {
  isGroup: boolean;
  groupName?: string;
  senderName: string;
  senderJid: string;
  chatJid: string;
  quotedMessage?: string;
  mentionedJids?: string[];
  timestamp: number;
  respondWithVoice?: boolean;
}

export interface TTSRequest {
  text: string;
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?: number;
}

export interface TTSResponse {
  audioBuffer: Buffer;
  mimeType: string;
}

export interface TTSProvider {
  synthesize(request: TTSRequest): Promise<TTSResponse>;
}

export interface ImageGenerationRequest {
  prompt: string;
  size?: '1024x1024' | '1024x1792' | '1792x1024';
  quality?: 'standard' | 'hd';
}

export interface ImageGenerationResponse {
  imageBuffer: Buffer;
  revisedPrompt?: string;
}

export interface ImageGenerationProvider {
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;
}

export interface DocumentAnalysisRequest {
  documentBuffer: Buffer;
  mimeType: string;
  fileName: string;
  extractedText: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
}

export interface DocumentAnalysisResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface DocumentAnalysisProvider {
  analyzeDocument(request: DocumentAnalysisRequest): Promise<DocumentAnalysisResponse>;
}

// Tool_use content blocks (matches Anthropic API format)
export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

// Tool definition (matches Anthropic API format)
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Extended message type for tool conversations
export interface ToolMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

// Request/Response for tool-aware chat
export interface ChatWithToolsRequest {
  systemPrompt: string;
  messages: ToolMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
}

export interface ChatWithToolsResponse {
  content: ContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
