import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => true),
}));

const mockStorage = {
  addReminder: vi.fn().mockResolvedValue({ id: 'rem_123', message: 'test' }),
  getRemindersForChat: vi.fn().mockResolvedValue([]),
  cancelReminder: vi.fn().mockResolvedValue(undefined),
  snoozeReminder: vi.fn().mockResolvedValue(undefined),
  getAllReminders: vi.fn().mockResolvedValue([]),
};

vi.mock('../reminders/storage.js', () => ({
  getReminderStorage: vi.fn(() => mockStorage),
}));

vi.mock('../reminders/scheduler.js', () => ({
  getReminderScheduler: vi.fn(() => ({
    initialize: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock('../reminders/time-parser.js', () => ({
  parseTime: vi.fn(() => ({ date: new Date('2025-06-15T14:00:00Z'), isRecurring: false })),
  formatDateTime: vi.fn(() => 'Jun 15, 2:00 PM'),
  formatRelativeTime: vi.fn(() => 'in 2 hours'),
  extractReminderText: vi.fn(() => 'call mom'),
  containsTimeExpression: vi.fn(() => true),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  handleReminderCreation,
  handleListReminders,
  handleCancelReminder,
  handleSnoozeReminder,
  handleTestReminder,
  handleReminderDone,
} from './reminder.js';
import { isEnabled } from '../config/index.js';
import { parseTime, extractReminderText } from '../reminders/time-parser.js';
import { createMockSocket, createTextMessage, createContext } from '../__tests__/test-helpers.js';

const mockIsEnabled = vi.mocked(isEnabled);
const mockParseTime = vi.mocked(parseTime);
const mockExtractReminderText = vi.mocked(extractReminderText);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockReturnValue(true);
  mockParseTime.mockReturnValue({ date: new Date('2025-06-15T14:00:00Z'), isRecurring: false } as any);
  mockExtractReminderText.mockReturnValue('call mom');
  mockStorage.addReminder.mockResolvedValue({ id: 'rem_123', message: 'call mom' });
  mockStorage.getRemindersForChat.mockResolvedValue([]);
});

describe('handleReminderCreation', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleReminderCreation(sock, createTextMessage('remind me'), 'remind me to call mom in 30 minutes', createContext());
    expect(result).toBeNull();
  });

  it('returns null when text is not a reminder request', async () => {
    const sock = createMockSocket();
    const result = await handleReminderCreation(sock, createTextMessage('hello'), 'hello', createContext());
    expect(result).toBeNull();
  });

  it('returns help when time cannot be parsed', async () => {
    mockParseTime.mockReturnValue(null as any);
    const sock = createMockSocket();
    const result = await handleReminderCreation(sock, createTextMessage('remind me'), 'remind me to do something', createContext());

    expect(result).not.toBeNull();
    expect(result!.response).toContain("couldn't understand when");
  });

  it('returns help when reminder text is too short', async () => {
    mockExtractReminderText.mockReturnValue('ab');
    const sock = createMockSocket();
    const result = await handleReminderCreation(sock, createTextMessage('remind me'), 'remind me to ab', createContext());

    expect(result).not.toBeNull();
    expect(result!.response).toContain('What should I remind');
  });

  it('creates reminder and returns confirmation', async () => {
    const sock = createMockSocket();
    const result = await handleReminderCreation(
      sock,
      createTextMessage('remind me to call mom in 30 minutes'),
      'remind me to call mom in 30 minutes',
      createContext(),
    );

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.response).toContain('Reminder Set');
    expect(result!.response).toContain('call mom');
    expect(mockStorage.addReminder).toHaveBeenCalled();
  });

  it('includes reminder ID in response', async () => {
    const sock = createMockSocket();
    const result = await handleReminderCreation(
      sock,
      createTextMessage('remind me to test in 5 min'),
      'remind me to test in 5 min',
      createContext(),
    );

    expect(result!.response).toContain('rem_123');
  });

  it('shows recurring info when applicable', async () => {
    mockParseTime.mockReturnValue({ date: new Date(), isRecurring: true, recurrencePattern: 'daily' } as any);
    const sock = createMockSocket();
    const result = await handleReminderCreation(
      sock,
      createTextMessage('remind me every day'),
      'remind me every day to exercise',
      createContext(),
    );

    expect(result!.response).toContain('Recurring');
  });

  it('returns error on failure', async () => {
    mockStorage.addReminder.mockRejectedValue(new Error('storage fail'));
    const sock = createMockSocket();
    const result = await handleReminderCreation(
      sock,
      createTextMessage('remind me to fail'),
      'remind me to fail in 5 min',
      createContext(),
    );

    expect(result!.success).toBe(false);
  });
});

describe('handleListReminders', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleListReminders(sock, createTextMessage('/reminders'), '/reminders', createContext());
    expect(result).toBeNull();
  });

  it('returns null when text is not a list command', async () => {
    const sock = createMockSocket();
    const result = await handleListReminders(sock, createTextMessage('hello'), 'hello', createContext());
    expect(result).toBeNull();
  });

  it('shows no-reminders message when empty', async () => {
    const sock = createMockSocket();
    const result = await handleListReminders(sock, createTextMessage('/reminders'), '/reminders', createContext());

    expect(result!.response).toContain('No Active Reminders');
  });

  it('lists active reminders', async () => {
    mockStorage.getRemindersForChat.mockResolvedValue([
      { id: 'rem_1', message: 'Call mom', scheduledTime: new Date(), isRecurring: false },
      { id: 'rem_2', message: 'Buy milk', scheduledTime: new Date(), isRecurring: true },
    ]);
    const sock = createMockSocket();
    const result = await handleListReminders(sock, createTextMessage('/reminders'), '/reminders', createContext());

    expect(result!.success).toBe(true);
    expect(result!.response).toContain('Your Reminders');
    expect(result!.response).toContain('2');
  });
});

describe('handleCancelReminder', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleCancelReminder(sock, createTextMessage('/cancel reminder abc'), '/cancel reminder abc', createContext());
    expect(result).toBeNull();
  });

  it('returns null when not a cancel command', async () => {
    const sock = createMockSocket();
    const result = await handleCancelReminder(sock, createTextMessage('hello'), 'hello', createContext());
    expect(result).toBeNull();
  });

  it('returns not-found when reminder does not exist', async () => {
    mockStorage.getRemindersForChat.mockResolvedValue([]);
    const sock = createMockSocket();
    const result = await handleCancelReminder(sock, createTextMessage('/cancel reminder xyz'), '/cancel reminder xyz', createContext());

    expect(result!.response).toContain('not found');
  });

  it('cancels reminder by partial ID', async () => {
    mockStorage.getRemindersForChat.mockResolvedValue([
      { id: 'rem_abc123', message: 'Test reminder' },
    ]);
    const sock = createMockSocket();
    const result = await handleCancelReminder(sock, createTextMessage('/cancel reminder rem_abc'), '/cancel reminder rem_abc', createContext());

    expect(result!.success).toBe(true);
    expect(result!.response).toContain('cancelled');
    expect(mockStorage.cancelReminder).toHaveBeenCalledWith('rem_abc123');
  });
});

describe('handleSnoozeReminder', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleSnoozeReminder(sock, createTextMessage('snooze'), 'snooze', createContext());
    expect(result).toBeNull();
  });

  it('returns null when text has no snooze keyword', async () => {
    const sock = createMockSocket();
    const result = await handleSnoozeReminder(sock, createTextMessage('hello'), 'hello', createContext());
    expect(result).toBeNull();
  });

  it('returns no-reminders message when none exist', async () => {
    const sock = createMockSocket();
    const result = await handleSnoozeReminder(sock, createTextMessage('snooze'), 'snooze', createContext());

    expect(result!.response).toContain('No active reminders');
  });

  it('snoozes most recent reminder', async () => {
    mockStorage.getRemindersForChat.mockResolvedValue([
      { id: 'rem_1', message: 'Test' },
    ]);
    const sock = createMockSocket();
    const result = await handleSnoozeReminder(
      sock,
      createTextMessage('snooze for 15 minutes'),
      'snooze for 15 minutes',
      createContext(),
    );

    expect(result!.success).toBe(true);
    expect(result!.response).toContain('Snoozed');
    expect(mockStorage.snoozeReminder).toHaveBeenCalled();
  });
});

describe('handleTestReminder', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleTestReminder(sock, createTextMessage('/test reminder'), '/test reminder', createContext());
    expect(result).toBeNull();
  });

  it('returns null when not a test command', async () => {
    const sock = createMockSocket();
    const result = await handleTestReminder(sock, createTextMessage('hello'), 'hello', createContext());
    expect(result).toBeNull();
  });

  it('creates test reminder', async () => {
    const sock = createMockSocket();
    const result = await handleTestReminder(sock, createTextMessage('/test reminder'), '/test reminder', createContext());

    expect(result!.success).toBe(true);
    expect(result!.response).toContain('Test reminder');
    expect(mockStorage.addReminder).toHaveBeenCalled();
  });
});

describe('handleReminderDone', () => {
  it('returns null when feature is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const sock = createMockSocket();
    const result = await handleReminderDone(sock, createTextMessage('done'), 'done', createContext());
    expect(result).toBeNull();
  });

  it('returns null when text has no done keyword', async () => {
    const sock = createMockSocket();
    const result = await handleReminderDone(sock, createTextMessage('hello'), 'hello', createContext());
    expect(result).toBeNull();
  });

  it('acknowledges done response', async () => {
    const sock = createMockSocket();
    const result = await handleReminderDone(sock, createTextMessage('done'), 'done', createContext());

    expect(result!.success).toBe(true);
    expect(result!.response).toContain('done');
  });

  it('recognises "completed" keyword', async () => {
    const sock = createMockSocket();
    const result = await handleReminderDone(sock, createTextMessage('completed'), 'completed', createContext());

    expect(result).not.toBeNull();
  });
});
