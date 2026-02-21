import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE the module under test is imported
// ---------------------------------------------------------------------------

vi.mock('@whiskeysockets/baileys', () => ({
  getContentType: vi.fn(),
}));

vi.mock('../handlers/text.js', () => ({
  handleTextMessage: vi.fn(),
}));

vi.mock('../handlers/voice.js', () => ({
  handleVoiceMessage: vi.fn(),
}));

vi.mock('../handlers/image.js', () => ({
  handleImageMessage: vi.fn(),
}));

vi.mock('../handlers/document.js', () => ({
  handleDocumentMessage: vi.fn(),
}));

vi.mock('../handlers/generate.js', () => ({
  detectGenerationType: vi.fn(() => 'none'),
  handleImageGeneration: vi.fn(),
  handleDocumentGeneration: vi.fn(),
}));

vi.mock('../handlers/search.js', () => ({
  detectSearchIntent: vi.fn(() => ({ detected: false })),
  handleSearchMessage: vi.fn(),
  isSearchEnabled: vi.fn(() => false),
}));

vi.mock('../handlers/url-summarizer.js', () => ({
  handleUrlSummarization: vi.fn(() => null),
}));

vi.mock('../handlers/sticker.js', () => ({
  handleStickerMessage: vi.fn(() => null),
  handleStickerCommand: vi.fn(() => null),
}));

vi.mock('../handlers/poll.js', () => ({
  handlePollCreation: vi.fn(() => null),
  handlePollVote: vi.fn(() => null),
  handlePollStatus: vi.fn(() => null),
  handlePollEnd: vi.fn(() => null),
}));

vi.mock('../handlers/reminder.js', () => ({
  handleReminderCreation: vi.fn(() => null),
  handleListReminders: vi.fn(() => null),
  handleCancelReminder: vi.fn(() => null),
  handleSnoozeReminder: vi.fn(() => null),
  handleReminderDone: vi.fn(() => null),
  handleTestReminder: vi.fn(() => null),
}));

vi.mock('../handlers/semantic-search.js', () => ({
  handleSemanticSearch: vi.fn(() => null),
}));

vi.mock('../handlers/summary.js', () => ({
  handleSummaryCommand: vi.fn(() => null),
}));

vi.mock('../handlers/video.js', () => ({
  handleVideoMessage: vi.fn(),
}));

vi.mock('../handlers/code-execution.js', () => ({
  handleCodeExecution: vi.fn(() => null),
}));

vi.mock('../handlers/calendar.js', () => ({
  handleCalendarCommand: vi.fn(() => null),
}));

vi.mock('../handlers/group-admin.js', () => ({
  handleAdminCommand: vi.fn(() => null),
}));

vi.mock('../handlers/group-kb.js', () => ({
  handleGroupKB: vi.fn(() => null),
}));

vi.mock('./intent-classifier.js', () => ({
  classifyIntent: vi.fn(() => ({ intent: 'unknown', confidence: 0, entities: {} })),
}));

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => false),
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { detectContentType, extractMessageText, routeMessage } from './message-router.js';
import { getContentType } from '@whiskeysockets/baileys';
import { handleTextMessage } from '../handlers/text.js';
import { handleVoiceMessage } from '../handlers/voice.js';
import { handleImageMessage } from '../handlers/image.js';
import { handleDocumentMessage } from '../handlers/document.js';
import { detectGenerationType, handleImageGeneration, handleDocumentGeneration } from '../handlers/generate.js';
import { detectSearchIntent, handleSearchMessage, isSearchEnabled } from '../handlers/search.js';
import { handleUrlSummarization } from '../handlers/url-summarizer.js';
import { handleStickerMessage, handleStickerCommand } from '../handlers/sticker.js';
import { handlePollCreation, handlePollVote, handlePollStatus, handlePollEnd } from '../handlers/poll.js';
import { handleSnoozeReminder, handleReminderDone, handleCancelReminder, handleListReminders, handleTestReminder, handleReminderCreation } from '../handlers/reminder.js';
import { handleSemanticSearch } from '../handlers/semantic-search.js';
import { handleSummaryCommand } from '../handlers/summary.js';
import { handleVideoMessage } from '../handlers/video.js';
import { handleCodeExecution } from '../handlers/code-execution.js';
import { handleCalendarCommand } from '../handlers/calendar.js';
import { handleAdminCommand } from '../handlers/group-admin.js';
import { handleGroupKB } from '../handlers/group-kb.js';
import { handleStickerCommand as _stickerCmd } from '../handlers/sticker.js';
import { classifyIntent } from './intent-classifier.js';
import { isEnabled } from '../config/index.js';

import {
  createTextMessage,
  createExtendedTextMessage,
  createImageMessage,
  createAudioMessage,
  createVideoMessage,
  createStickerMessage,
  createDocumentMessage,
  createEmptyMessage,
  createContext,
  createGroupContext,
  createMockSocket,
} from '../__tests__/test-helpers.js';

// ---------------------------------------------------------------------------
// Typed mocks
// ---------------------------------------------------------------------------

const mockGetContentType = vi.mocked(getContentType);
const mockHandleTextMessage = vi.mocked(handleTextMessage);
const mockHandleVoiceMessage = vi.mocked(handleVoiceMessage);
const mockHandleImageMessage = vi.mocked(handleImageMessage);
const mockHandleDocumentMessage = vi.mocked(handleDocumentMessage);
const mockDetectGenerationType = vi.mocked(detectGenerationType);
const mockHandleImageGeneration = vi.mocked(handleImageGeneration);
const mockHandleDocumentGeneration = vi.mocked(handleDocumentGeneration);
const mockIsSearchEnabled = vi.mocked(isSearchEnabled);
const mockDetectSearchIntent = vi.mocked(detectSearchIntent);
const mockHandleSearchMessage = vi.mocked(handleSearchMessage);
const mockHandleUrlSummarization = vi.mocked(handleUrlSummarization);
const mockHandleStickerMessage = vi.mocked(handleStickerMessage);
const mockHandleStickerCommand = vi.mocked(handleStickerCommand);
const mockHandlePollVote = vi.mocked(handlePollVote);
const mockHandlePollStatus = vi.mocked(handlePollStatus);
const mockHandlePollEnd = vi.mocked(handlePollEnd);
const mockHandlePollCreation = vi.mocked(handlePollCreation);
const mockHandleSnoozeReminder = vi.mocked(handleSnoozeReminder);
const mockHandleReminderDone = vi.mocked(handleReminderDone);
const mockHandleCancelReminder = vi.mocked(handleCancelReminder);
const mockHandleListReminders = vi.mocked(handleListReminders);
const mockHandleTestReminder = vi.mocked(handleTestReminder);
const mockHandleReminderCreation = vi.mocked(handleReminderCreation);
const mockHandleSemanticSearch = vi.mocked(handleSemanticSearch);
const mockHandleSummaryCommand = vi.mocked(handleSummaryCommand);
const mockHandleVideoMessage = vi.mocked(handleVideoMessage);
const mockHandleCodeExecution = vi.mocked(handleCodeExecution);
const mockHandleCalendarCommand = vi.mocked(handleCalendarCommand);
const mockHandleAdminCommand = vi.mocked(handleAdminCommand);
const mockHandleGroupKB = vi.mocked(handleGroupKB);
const mockClassifyIntent = vi.mocked(classifyIntent);
const mockIsEnabled = vi.mocked(isEnabled);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResult(response = 'ok') {
  return { response, success: true };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Reset defaults
  mockDetectGenerationType.mockReturnValue('none');
  mockHandleUrlSummarization.mockResolvedValue(null);
  mockIsSearchEnabled.mockReturnValue(false);
  mockDetectSearchIntent.mockReturnValue({ detected: false } as any);
  mockHandlePollVote.mockResolvedValue(null);
  mockHandlePollStatus.mockResolvedValue(null);
  mockHandlePollEnd.mockResolvedValue(null);
  mockHandlePollCreation.mockResolvedValue(null);
  mockHandleSnoozeReminder.mockResolvedValue(null);
  mockHandleReminderDone.mockResolvedValue(null);
  mockHandleCancelReminder.mockResolvedValue(null);
  mockHandleListReminders.mockResolvedValue(null);
  mockHandleTestReminder.mockResolvedValue(null);
  mockHandleReminderCreation.mockResolvedValue(null);
  mockHandleSemanticSearch.mockResolvedValue(null);
  mockHandleSummaryCommand.mockResolvedValue(null);
  mockHandleCodeExecution.mockResolvedValue(null);
  mockHandleCalendarCommand.mockResolvedValue(null);
  mockHandleAdminCommand.mockResolvedValue(null);
  mockHandleGroupKB.mockResolvedValue(null);
  mockHandleStickerCommand.mockResolvedValue(null);
  mockHandleStickerMessage.mockResolvedValue(null);
  mockIsEnabled.mockReturnValue(false);
  mockClassifyIntent.mockResolvedValue({ intent: 'unknown', confidence: 0, entities: {} });

  // Default text handler (fallback)
  mockHandleTextMessage.mockResolvedValue({ response: 'text-fallback', success: true } as any);
});

// =========================================================================
// A. detectContentType()
// =========================================================================

describe('detectContentType', () => {
  it('returns "text" for conversation messages', () => {
    mockGetContentType.mockReturnValue('conversation');
    expect(detectContentType(createTextMessage('hello'))).toBe('text');
  });

  it('returns "text" for extendedTextMessage', () => {
    mockGetContentType.mockReturnValue('extendedTextMessage');
    expect(detectContentType(createExtendedTextMessage('hello'))).toBe('text');
  });

  it('returns "image" for imageMessage', () => {
    mockGetContentType.mockReturnValue('imageMessage');
    expect(detectContentType(createImageMessage())).toBe('image');
  });

  it('returns "audio" for audioMessage', () => {
    mockGetContentType.mockReturnValue('audioMessage');
    expect(detectContentType(createAudioMessage())).toBe('audio');
  });

  it('returns "video" for videoMessage', () => {
    mockGetContentType.mockReturnValue('videoMessage');
    expect(detectContentType(createVideoMessage())).toBe('video');
  });

  it('returns "sticker" for stickerMessage', () => {
    mockGetContentType.mockReturnValue('stickerMessage');
    expect(detectContentType(createStickerMessage())).toBe('sticker');
  });

  it('returns "document" for documentMessage', () => {
    mockGetContentType.mockReturnValue('documentMessage');
    expect(detectContentType(createDocumentMessage())).toBe('document');
  });

  it('returns "document" for documentWithCaptionMessage', () => {
    mockGetContentType.mockReturnValue('documentWithCaptionMessage');
    expect(detectContentType(createDocumentMessage())).toBe('document');
  });

  it('returns "unknown" when message content is null', () => {
    expect(detectContentType(createEmptyMessage())).toBe('unknown');
  });

  it('returns "unknown" for an unrecognised content type', () => {
    mockGetContentType.mockReturnValue('reactionMessage' as any);
    const msg = createTextMessage('hi');
    expect(detectContentType(msg)).toBe('unknown');
  });
});

// =========================================================================
// B. extractMessageText()
// =========================================================================

describe('extractMessageText', () => {
  it('extracts conversation text', () => {
    expect(extractMessageText(createTextMessage('hello world'))).toBe('hello world');
  });

  it('extracts extendedTextMessage text', () => {
    expect(extractMessageText(createExtendedTextMessage('extended text'))).toBe('extended text');
  });

  it('extracts image caption', () => {
    expect(extractMessageText(createImageMessage('look at this'))).toBe('look at this');
  });

  it('extracts video caption', () => {
    expect(extractMessageText(createVideoMessage('watch this'))).toBe('watch this');
  });

  it('returns null when no text is present', () => {
    expect(extractMessageText(createAudioMessage())).toBeNull();
  });

  it('returns null when message content is undefined', () => {
    expect(extractMessageText(createEmptyMessage())).toBeNull();
  });

  it('prefers conversation over other fields', () => {
    const msg = {
      key: { remoteJid: 'x@s.whatsapp.net', fromMe: false, id: '1' },
      message: {
        conversation: 'conv-text',
        extendedTextMessage: { text: 'ext-text' },
      },
      messageTimestamp: 1000,
    } as any;
    expect(extractMessageText(msg)).toBe('conv-text');
  });
});

// =========================================================================
// C. routeMessage() — text dispatch
// =========================================================================

describe('routeMessage — text dispatch', () => {
  let sock: ReturnType<typeof createMockSocket>;
  let ctx: ReturnType<typeof createContext>;

  beforeEach(() => {
    sock = createMockSocket();
    ctx = createContext();
    // All text messages go through this path
    mockGetContentType.mockReturnValue('conversation');
  });

  // -----------------------------------------------------------------------
  // C.1 Generation routing
  // -----------------------------------------------------------------------

  describe('C.1 generation routing', () => {
    it('routes to image generation when detected', async () => {
      mockDetectGenerationType.mockReturnValue('image');
      mockHandleImageGeneration.mockResolvedValue({ success: true, type: 'image' } as any);

      const result = await routeMessage(sock, createTextMessage('generate an image of a cat'), ctx);

      expect(mockHandleImageGeneration).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.contentType).toBe('text');
    });

    it('routes to document generation when detected', async () => {
      mockDetectGenerationType.mockReturnValue('document');
      mockHandleDocumentGeneration.mockResolvedValue({ success: true, type: 'document' } as any);

      const result = await routeMessage(sock, createTextMessage('create a PDF report'), ctx);

      expect(mockHandleDocumentGeneration).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('falls through when generation type is "none"', async () => {
      mockDetectGenerationType.mockReturnValue('none');
      mockHandleTextMessage.mockResolvedValue({ response: 'fallback', success: true } as any);

      await routeMessage(sock, createTextMessage('hello'), ctx);

      expect(mockHandleImageGeneration).not.toHaveBeenCalled();
      expect(mockHandleDocumentGeneration).not.toHaveBeenCalled();
      expect(mockHandleTextMessage).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // C.2 URL summarization
  // -----------------------------------------------------------------------

  describe('C.2 URL summarization', () => {
    it('returns URL summarization result when matched', async () => {
      mockHandleUrlSummarization.mockResolvedValue({ response: 'summary', success: true } as any);

      const result = await routeMessage(sock, createTextMessage('https://example.com'), ctx);

      expect(result.response).toBe('summary');
      expect(result.contentType).toBe('text');
    });

    it('falls through when URL summarization returns null', async () => {
      mockHandleUrlSummarization.mockResolvedValue(null);

      await routeMessage(sock, createTextMessage('no urls here'), ctx);

      expect(mockHandleTextMessage).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // C.3 Search routing
  // -----------------------------------------------------------------------

  describe('C.3 search routing', () => {
    it('routes to search when enabled and intent detected', async () => {
      mockIsSearchEnabled.mockReturnValue(true);
      mockDetectSearchIntent.mockReturnValue({ detected: true, query: 'vitest' } as any);
      mockHandleSearchMessage.mockResolvedValue({ response: 'search result', success: true } as any);

      const result = await routeMessage(sock, createTextMessage('search for vitest'), ctx);

      expect(mockHandleSearchMessage).toHaveBeenCalled();
      expect(result.response).toBe('search result');
    });

    it('skips search when disabled', async () => {
      mockIsSearchEnabled.mockReturnValue(false);

      await routeMessage(sock, createTextMessage('search for vitest'), ctx);

      expect(mockDetectSearchIntent).not.toHaveBeenCalled();
    });

    it('skips search when no intent detected', async () => {
      mockIsSearchEnabled.mockReturnValue(true);
      mockDetectSearchIntent.mockReturnValue({ detected: false } as any);

      await routeMessage(sock, createTextMessage('hello'), ctx);

      expect(mockHandleSearchMessage).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // C.4 Poll routing (vote > status > end > creation)
  // -----------------------------------------------------------------------

  describe('C.4 poll routing', () => {
    it('routes to poll vote first', async () => {
      mockHandlePollVote.mockResolvedValue(okResult('voted') as any);
      mockHandlePollStatus.mockResolvedValue(okResult('status') as any);

      const result = await routeMessage(sock, createTextMessage('vote A'), ctx);

      expect(result.response).toBe('voted');
      expect(mockHandlePollStatus).not.toHaveBeenCalled();
    });

    it('routes to poll status when vote returns null', async () => {
      mockHandlePollStatus.mockResolvedValue(okResult('status') as any);

      const result = await routeMessage(sock, createTextMessage('poll status'), ctx);

      expect(result.response).toBe('status');
    });

    it('routes to poll end when vote and status return null', async () => {
      mockHandlePollEnd.mockResolvedValue(okResult('ended') as any);

      const result = await routeMessage(sock, createTextMessage('end poll'), ctx);

      expect(result.response).toBe('ended');
    });

    it('routes to poll creation as last poll handler', async () => {
      mockHandlePollCreation.mockResolvedValue(okResult('created') as any);

      const result = await routeMessage(sock, createTextMessage('create poll'), ctx);

      expect(result.response).toBe('created');
    });
  });

  // -----------------------------------------------------------------------
  // C.5 Reminder routing (snooze > done > cancel > list > test > creation)
  // -----------------------------------------------------------------------

  describe('C.5 reminder routing', () => {
    it('routes to snooze first', async () => {
      mockHandleSnoozeReminder.mockResolvedValue(okResult('snoozed') as any);
      mockHandleReminderDone.mockResolvedValue(okResult('done') as any);

      const result = await routeMessage(sock, createTextMessage('snooze'), ctx);

      expect(result.response).toBe('snoozed');
      expect(mockHandleReminderDone).not.toHaveBeenCalled();
    });

    it('routes to done when snooze returns null', async () => {
      mockHandleReminderDone.mockResolvedValue(okResult('done') as any);

      const result = await routeMessage(sock, createTextMessage('done'), ctx);

      expect(result.response).toBe('done');
    });

    it('routes to cancel when snooze+done return null', async () => {
      mockHandleCancelReminder.mockResolvedValue(okResult('cancelled') as any);

      const result = await routeMessage(sock, createTextMessage('cancel'), ctx);

      expect(result.response).toBe('cancelled');
    });

    it('routes to list when snooze+done+cancel return null', async () => {
      mockHandleListReminders.mockResolvedValue(okResult('listed') as any);

      const result = await routeMessage(sock, createTextMessage('list reminders'), ctx);

      expect(result.response).toBe('listed');
    });

    it('routes to test when earlier reminder handlers return null', async () => {
      mockHandleTestReminder.mockResolvedValue(okResult('tested') as any);

      const result = await routeMessage(sock, createTextMessage('test reminder'), ctx);

      expect(result.response).toBe('tested');
    });

    it('routes to creation as last reminder handler', async () => {
      mockHandleReminderCreation.mockResolvedValue(okResult('remind-created') as any);

      const result = await routeMessage(sock, createTextMessage('remind me'), ctx);

      expect(result.response).toBe('remind-created');
    });
  });

  // -----------------------------------------------------------------------
  // C.6 Remaining handlers
  // -----------------------------------------------------------------------

  describe('C.6 remaining text handlers', () => {
    it('routes to semantic search', async () => {
      mockHandleSemanticSearch.mockResolvedValue(okResult('memory hit') as any);

      const result = await routeMessage(sock, createTextMessage('search memory'), ctx);

      expect(result.response).toBe('memory hit');
    });

    it('routes to summary command', async () => {
      mockHandleSummaryCommand.mockResolvedValue(okResult('summary') as any);

      const result = await routeMessage(sock, createTextMessage('summarize last 20'), ctx);

      expect(result.response).toBe('summary');
    });

    it('routes to code execution', async () => {
      mockHandleCodeExecution.mockResolvedValue(okResult('code-output') as any);

      const result = await routeMessage(sock, createTextMessage('```python\nprint(1)\n```'), ctx);

      expect(result.response).toBe('code-output');
    });

    it('routes to calendar command', async () => {
      mockHandleCalendarCommand.mockResolvedValue(okResult('event created') as any);

      const result = await routeMessage(sock, createTextMessage('calendar add'), ctx);

      expect(result.response).toBe('event created');
    });

    it('routes to admin command', async () => {
      mockHandleAdminCommand.mockResolvedValue(okResult('admin done') as any);

      const result = await routeMessage(sock, createTextMessage('!ban user'), ctx);

      expect(result.response).toBe('admin done');
    });

    it('routes to group knowledge base', async () => {
      mockHandleGroupKB.mockResolvedValue(okResult('kb answer') as any);

      const result = await routeMessage(sock, createTextMessage('kb search'), ctx);

      expect(result.response).toBe('kb answer');
    });

    it('routes to sticker command', async () => {
      mockHandleStickerCommand.mockResolvedValue(okResult('sticker sent') as any);

      const result = await routeMessage(sock, createTextMessage('!sticker'), ctx);

      expect(result.response).toBe('sticker sent');
    });
  });

  // -----------------------------------------------------------------------
  // C.7 Fallback
  // -----------------------------------------------------------------------

  describe('C.7 fallback', () => {
    it('falls back to handleTextMessage when nothing matches', async () => {
      mockHandleTextMessage.mockResolvedValue({ response: 'text-fallback', success: true } as any);

      const result = await routeMessage(sock, createTextMessage('just chatting'), ctx);

      expect(mockHandleTextMessage).toHaveBeenCalled();
      expect(result.response).toBe('text-fallback');
      expect(result.contentType).toBe('text');
    });

    it('returns error when no text is extracted from a text content type', async () => {
      // A message with content but empty conversation
      const msg = {
        key: { remoteJid: 'x@s.whatsapp.net', fromMe: false, id: '1' },
        message: { conversation: '' },
        messageTimestamp: 1000,
      } as any;
      // getContentType returns 'conversation' but extractMessageText returns falsy
      mockGetContentType.mockReturnValue('conversation');

      const result = await routeMessage(sock, msg, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No text content found');
    });
  });

  // -----------------------------------------------------------------------
  // C.8 Intent classification
  // -----------------------------------------------------------------------

  describe('C.8 intent classification', () => {
    it('calls classifyIntent when intentClassification is enabled', async () => {
      mockIsEnabled.mockImplementation((flag) => flag === 'intentClassification');
      mockClassifyIntent.mockResolvedValue({ intent: 'greeting', confidence: 0.9, entities: {} });

      await routeMessage(sock, createTextMessage('hello'), ctx);

      expect(mockClassifyIntent).toHaveBeenCalledWith('hello');
    });

    it('skips classifyIntent when intentClassification is disabled', async () => {
      mockIsEnabled.mockReturnValue(false);

      await routeMessage(sock, createTextMessage('hello'), ctx);

      expect(mockClassifyIntent).not.toHaveBeenCalled();
    });
  });
});

// =========================================================================
// D. Non-text content routing
// =========================================================================

describe('routeMessage — non-text content', () => {
  let sock: ReturnType<typeof createMockSocket>;
  let ctx: ReturnType<typeof createContext>;

  beforeEach(() => {
    sock = createMockSocket();
    ctx = createContext();
  });

  it('routes image: checks sticker first, then image handler', async () => {
    mockGetContentType.mockReturnValue('imageMessage');
    mockHandleStickerMessage.mockResolvedValue(null);
    mockHandleImageMessage.mockResolvedValue({ response: 'image-desc', success: true } as any);

    const result = await routeMessage(sock, createImageMessage(), ctx);

    expect(mockHandleStickerMessage).toHaveBeenCalled();
    expect(mockHandleImageMessage).toHaveBeenCalled();
    expect(result.response).toBe('image-desc');
    expect(result.contentType).toBe('image');
  });

  it('routes image: returns sticker result when matched', async () => {
    mockGetContentType.mockReturnValue('imageMessage');
    mockHandleStickerMessage.mockResolvedValue(okResult('sticker-created') as any);

    const result = await routeMessage(sock, createImageMessage(), ctx);

    expect(result.response).toBe('sticker-created');
    expect(mockHandleImageMessage).not.toHaveBeenCalled();
  });

  it('routes audio to voice handler', async () => {
    mockGetContentType.mockReturnValue('audioMessage');
    mockHandleVoiceMessage.mockResolvedValue({ response: 'transcribed', success: true } as any);

    const result = await routeMessage(sock, createAudioMessage(), ctx);

    expect(mockHandleVoiceMessage).toHaveBeenCalled();
    expect(result.response).toBe('transcribed');
    expect(result.contentType).toBe('audio');
  });

  it('routes video to video handler', async () => {
    mockGetContentType.mockReturnValue('videoMessage');
    mockHandleVideoMessage.mockResolvedValue({ response: 'video-analyzed', success: true } as any);

    const result = await routeMessage(sock, createVideoMessage(), ctx);

    expect(mockHandleVideoMessage).toHaveBeenCalled();
    expect(result.contentType).toBe('video');
  });

  it('returns early for sticker without calling any handler', async () => {
    mockGetContentType.mockReturnValue('stickerMessage');

    const result = await routeMessage(sock, createStickerMessage(), ctx);

    expect(result.success).toBe(true);
    expect(result.contentType).toBe('sticker');
    expect(result.error).toBe('Stickers are not processed');
  });

  it('routes document to document handler', async () => {
    mockGetContentType.mockReturnValue('documentMessage');
    mockHandleDocumentMessage.mockResolvedValue({ response: 'doc-analyzed', success: true } as any);

    const result = await routeMessage(sock, createDocumentMessage(), ctx);

    expect(mockHandleDocumentMessage).toHaveBeenCalled();
    expect(result.contentType).toBe('document');
  });

  it('returns error for unknown content type', async () => {
    mockGetContentType.mockReturnValue('reactionMessage' as any);

    const result = await routeMessage(sock, createTextMessage('x'), ctx);

    expect(result.success).toBe(false);
    expect(result.contentType).toBe('unknown');
    expect(result.error).toBe('Unknown content type');
  });

  it('preserves contentType field on all results', async () => {
    mockGetContentType.mockReturnValue('audioMessage');
    mockHandleVoiceMessage.mockResolvedValue({ response: 'ok', success: true } as any);

    const result = await routeMessage(sock, createAudioMessage(), ctx);

    expect(result).toHaveProperty('contentType', 'audio');
  });
});

// =========================================================================
// E. Priority ordering
// =========================================================================

describe('routeMessage — priority ordering', () => {
  let sock: ReturnType<typeof createMockSocket>;
  let ctx: ReturnType<typeof createContext>;

  beforeEach(() => {
    sock = createMockSocket();
    ctx = createContext();
    mockGetContentType.mockReturnValue('conversation');
  });

  it('image gen takes priority over URL summarization', async () => {
    mockDetectGenerationType.mockReturnValue('image');
    mockHandleImageGeneration.mockResolvedValue({ success: true, type: 'image' } as any);
    mockHandleUrlSummarization.mockResolvedValue(okResult('url-summary') as any);

    await routeMessage(sock, createTextMessage('generate image'), ctx);

    expect(mockHandleImageGeneration).toHaveBeenCalled();
    expect(mockHandleUrlSummarization).not.toHaveBeenCalled();
  });

  it('URL summarization takes priority over search', async () => {
    mockHandleUrlSummarization.mockResolvedValue(okResult('url-summary') as any);
    mockIsSearchEnabled.mockReturnValue(true);
    mockDetectSearchIntent.mockReturnValue({ detected: true, query: 'q' } as any);

    const result = await routeMessage(sock, createTextMessage('summarize url'), ctx);

    expect(result.response).toBe('url-summary');
    expect(mockHandleSearchMessage).not.toHaveBeenCalled();
  });

  it('search takes priority over polls', async () => {
    mockIsSearchEnabled.mockReturnValue(true);
    mockDetectSearchIntent.mockReturnValue({ detected: true, query: 'q' } as any);
    mockHandleSearchMessage.mockResolvedValue({ response: 'search-result', success: true } as any);
    mockHandlePollVote.mockResolvedValue(okResult('voted') as any);

    const result = await routeMessage(sock, createTextMessage('search'), ctx);

    expect(result.response).toBe('search-result');
    expect(mockHandlePollVote).not.toHaveBeenCalled();
  });

  it('polls take priority over reminders', async () => {
    mockHandlePollVote.mockResolvedValue(okResult('voted') as any);
    mockHandleSnoozeReminder.mockResolvedValue(okResult('snoozed') as any);

    const result = await routeMessage(sock, createTextMessage('vote'), ctx);

    expect(result.response).toBe('voted');
    expect(mockHandleSnoozeReminder).not.toHaveBeenCalled();
  });
});
