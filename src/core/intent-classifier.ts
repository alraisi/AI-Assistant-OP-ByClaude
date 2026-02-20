/**
 * Intent Classifier
 * Analyzes user messages to determine intent before routing
 */

import { isEnabled } from '../config/index.js';
import { getChatProvider } from '../llm/index.js';
import pino from 'pino';

const logger = pino({ name: 'intent-classifier' });

export type IntentType =
  | 'question'           // User is asking a question
  | 'task_request'       // User wants the bot to do something
  | 'casual_chat'        // General conversation
  | 'help_request'       // User needs help
  | 'image_generation'   // User wants to generate an image
  | 'document_creation'  // User wants to create a document
  | 'url_summary'        // User wants to summarize a URL
  | 'reminder'           // User wants to set a reminder
  | 'translation'        // User wants translation
  | 'search'             // User wants to search the web
  | 'code_help'          // User needs help with code
  | 'greeting'           // Hello, hi, etc.
  | 'farewell'           // Goodbye, bye, etc.
  | 'thanks'             // Thank you, thanks
  | 'unknown';           // Cannot determine intent

export interface IntentResult {
  intent: IntentType;
  confidence: number;  // 0-1 confidence score
  entities: Record<string, string>;  // Extracted entities like dates, urls, etc.
  suggestedResponse?: string;  // Optional suggested response approach
}

// Pattern-based intent detection for common cases
const INTENT_PATTERNS: Record<IntentType, RegExp[]> = {
  greeting: [
    /^\s*(hi|hello|hey|greetings|howdy|hola|bonjour|salam)\s*$/i,
    /^(hi|hello|hey)\s+(buddy|bot|there|everyone)/i,
  ],
  farewell: [
    /^\s*(bye|goodbye|see\s+you|cya|later|take\s+care)\s*$/i,
  ],
  thanks: [
    /^\s*(thanks|thank\s+you|ty|appreciate\s+it|grateful)\s*$/i,
  ],
  image_generation: [
    /\b(create|generate|make|draw|design)\b.{0,20}\b(image|picture|photo|illustration|art|artwork|logo|icon)\b/i,
    /\b(image|picture|photo)\b.{0,20}\b(of|for|about|showing)\b/i,
  ],
  document_creation: [
    /\b(create|generate|make|write)\b.{0,20}\b(document|pdf|word|doc|report|guide|presentation)\b/i,
    /\b(pdf|document|word|presentation)\b.{0,20}\b(about|for|on)\b/i,
  ],
  url_summary: [
    /\b(summarize|summary|tl;dr|tldr)\b.{0,10}(https?:\/\/)/i,
    /\bwhat\s+does\s+this\s+(link|url|article|page)\s+say/i,
    /\bexplain\s+this\s+(article|link|url|page)/i,
  ],
  reminder: [
    /\b(remind\s+me|set\s+(a\s+)?reminder|reminder\s+to)\b/i,
    /\b(don't\s+let\s+me\s+forget|remember\s+to)\b/i,
  ],
  translation: [
    /\b(translate|translation)\b.{0,20}\b(to|into|in)\s+\w+/i,
    /\b(in\s+\w+\s+)?(translate|say)\s+this/i,
  ],
  search: [
    /^\s*(search|look\s+up|find|google)\s+(for\s+)?/i,
    /\b(what|who|where|when|why|how)\s+(is|are|was|were)\s+the\s+latest/i,
  ],
  code_help: [
    /\b(write|create)\s+(a\s+)?(code|script|function|program)\b/i,
    /\b(how\s+to|help\s+me)\s+(code|program|write)\b/i,
    /\b(debug|fix)\s+(this\s+)?(code|error|bug)\b/i,
    /\b(explain|what\s+does)\s+(this\s+)?code\b/i,
  ],
  help_request: [
    /^\s*help\s*$/i,
    /\b(help\s+me|i\s+need\s+help|can\s+you\s+help)/i,
    /\bhow\s+do\s+i\s+/i,
    /\bwhat\s+can\s+you\s+do\b/i,
  ],
  question: [
    /\?\s*$/,
    /^(what|who|where|when|why|how|can|could|would|should|is|are|do|does|did|will|have|has|am)\s+/i,
  ],
  task_request: [
    /\b(can\s+you|could\s+you|would\s+you|please)\s+\w+/i,
  ],
  casual_chat: [],
  unknown: [],
};

/**
 * Classify intent using pattern matching (fast, no API call)
 */
function classifyWithPatterns(text: string): IntentResult | null {
  // Check patterns in order of specificity
  const priorityOrder: IntentType[] = [
    'greeting',
    'farewell',
    'thanks',
    'image_generation',
    'document_creation',
    'url_summary',
    'reminder',
    'translation',
    'code_help',
    'search',
    'help_request',
    'question',
    'task_request',
  ];

  for (const intent of priorityOrder) {
    const patterns = INTENT_PATTERNS[intent];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          intent,
          confidence: 0.8, // High confidence for pattern matches
          entities: extractEntities(text, intent),
        };
      }
    }
  }

  return null;
}

/**
 * Extract relevant entities based on intent
 */
function extractEntities(text: string, intent: IntentType): Record<string, string> {
  const entities: Record<string, string> = {};

  // Extract URL
  const urlMatch = text.match(/(https?:\/\/[^\s]+)/i);
  if (urlMatch) {
    entities.url = urlMatch[1];
  }

  // Extract time/date references
  const timeMatch = text.match(/\b(tomorrow|today|tonight|next\s+\w+|in\s+\d+\s+(minutes?|hours?|days?))\b/i);
  if (timeMatch) {
    entities.timeReference = timeMatch[1];
  }

  // Extract language for translation
  if (intent === 'translation') {
    const langMatch = text.match(/\b(to|into|in)\s+(\w+)/i);
    if (langMatch) {
      entities.targetLanguage = langMatch[2];
    }
  }

  // Extract search query
  if (intent === 'search') {
    const queryMatch = text.match(/(?:search|look\s+up|find|google)\s+(?:for\s+)?(.+)/i);
    if (queryMatch) {
      entities.searchQuery = queryMatch[1].trim();
    }
  }

  return entities;
}

/**
 * Classify intent using AI (more accurate but slower)
 */
async function classifyWithAI(text: string, context?: string): Promise<IntentResult> {
  const chatProvider = getChatProvider();

  const systemPrompt = `You are an intent classifier for a WhatsApp AI assistant.
Analyze the user's message and classify it into exactly one of these intents:
- greeting: Hello, hi, hey
- farewell: Goodbye, bye, see you
- thanks: Thank you, thanks
- question: Asking for information (what, how, why, etc.)
- image_generation: Request to create/generate an image
- document_creation: Request to create a document/PDF
- url_summary: Request to summarize a URL/link
- reminder: Setting a reminder
- translation: Translating text
- search: Web search request
- code_help: Programming/coding help
- help_request: General help request
- task_request: Asking the bot to do something
- casual_chat: General conversation
- unknown: Cannot determine

Respond ONLY with a JSON object in this exact format:
{
  "intent": "intent_name",
  "confidence": 0.95,
  "entities": {
    "key": "value"
  }
}`;

  const prompt = context
    ? `Context: ${context}\n\nMessage: "${text}"`
    : `Message: "${text}"`;

  try {
    const response = await chatProvider.chat({
      systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
    });

    // Parse JSON response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        intent: result.intent as IntentType,
        confidence: result.confidence || 0.5,
        entities: result.entities || {},
      };
    }
  } catch (error) {
    logger.warn({ error }, 'AI intent classification failed');
  }

  // Fallback to unknown
  return {
    intent: 'unknown',
    confidence: 0,
    entities: extractEntities(text, 'unknown'),
  };
}

/**
 * Main intent classification function
 * Uses fast pattern matching first, then AI if needed
 */
export async function classifyIntent(
  text: string,
  useAI: boolean = false,
  context?: string
): Promise<IntentResult> {
  // Check feature flag
  if (!isEnabled('intentClassification')) {
    return {
      intent: 'unknown',
      confidence: 0,
      entities: {},
    };
  }

  logger.debug({ text: text.slice(0, 50) }, 'Classifying intent');

  // First try pattern matching (fast, no API cost)
  const patternResult = classifyWithPatterns(text);
  if (patternResult && patternResult.confidence >= 0.8) {
    logger.debug({ intent: patternResult.intent }, 'Intent classified via patterns');
    return patternResult;
  }

  // If high confidence pattern match, use it
  if (patternResult && !useAI) {
    return patternResult;
  }

  // Fall back to AI classification for unclear intents
  if (useAI) {
    const aiResult = await classifyWithAI(text, context);
    logger.debug({ intent: aiResult.intent }, 'Intent classified via AI');
    return aiResult;
  }

  // Return pattern result if exists, otherwise unknown
  return patternResult || {
    intent: 'unknown',
    confidence: 0,
    entities: {},
  };
}

/**
 * Get suggested response strategy based on intent
 */
export function getResponseStrategy(intent: IntentType): {
  shouldRespond: boolean;
  responseType: 'text' | 'voice' | 'image' | 'document';
  priority: 'high' | 'medium' | 'low';
} {
  const strategies: Record<IntentType, {
    shouldRespond: boolean;
    responseType: 'text' | 'voice' | 'image' | 'document';
    priority: 'high' | 'medium' | 'low';
  }> = {
    greeting: { shouldRespond: true, responseType: 'text', priority: 'medium' },
    farewell: { shouldRespond: true, responseType: 'text', priority: 'low' },
    thanks: { shouldRespond: true, responseType: 'text', priority: 'low' },
    question: { shouldRespond: true, responseType: 'text', priority: 'high' },
    help_request: { shouldRespond: true, responseType: 'text', priority: 'high' },
    task_request: { shouldRespond: true, responseType: 'text', priority: 'high' },
    image_generation: { shouldRespond: true, responseType: 'image', priority: 'high' },
    document_creation: { shouldRespond: true, responseType: 'document', priority: 'high' },
    url_summary: { shouldRespond: true, responseType: 'text', priority: 'high' },
    reminder: { shouldRespond: true, responseType: 'text', priority: 'high' },
    translation: { shouldRespond: true, responseType: 'text', priority: 'high' },
    search: { shouldRespond: true, responseType: 'text', priority: 'high' },
    code_help: { shouldRespond: true, responseType: 'text', priority: 'high' },
    casual_chat: { shouldRespond: true, responseType: 'text', priority: 'medium' },
    unknown: { shouldRespond: true, responseType: 'text', priority: 'medium' },
  };

  return strategies[intent] || strategies.unknown;
}

/**
 * Batch classify multiple messages
 */
export async function classifyBatch(texts: string[]): Promise<IntentResult[]> {
  return Promise.all(texts.map(text => classifyIntent(text)));
}
