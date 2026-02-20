/**
 * Time Parser
 * Parses natural language time expressions into Date objects
 */

import pino from 'pino';

const logger = pino({ name: 'time-parser' });

export interface ParsedTime {
  date: Date;
  isRecurring: boolean;
  recurrencePattern?: string;
  confidence: number;
}

interface TimePattern {
  pattern: RegExp;
  parser: (match: RegExpMatchArray, now: Date) => ParsedTime | null;
}

// Time patterns for natural language parsing
const TIME_PATTERNS: TimePattern[] = [
  // "in X minutes/hours/days"
  {
    pattern: /\bin\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)\b/i,
    parser: (match, now) => {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      const date = new Date(now);
      
      if (unit.startsWith('minute') || unit.startsWith('min')) {
        date.setMinutes(date.getMinutes() + amount);
      } else if (unit.startsWith('hour') || unit.startsWith('hr')) {
        date.setHours(date.getHours() + amount);
      } else if (unit.startsWith('day')) {
        date.setDate(date.getDate() + amount);
      }
      
      return { date, isRecurring: false, confidence: 0.95 };
    },
  },
  
  // "at X:XX" (time today or tomorrow)
  {
    pattern: /\bat\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?\b/i,
    parser: (match, now) => {
      let hours = parseInt(match[1]);
      const minutes = match[2] ? parseInt(match[2]) : 0;
      const ampm = match[3]?.toLowerCase();
      
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      const date = new Date(now);
      date.setHours(hours, minutes, 0, 0);
      
      // If time already passed today, set for tomorrow
      if (date <= now) {
        date.setDate(date.getDate() + 1);
      }
      
      return { date, isRecurring: false, confidence: 0.9 };
    },
  },
  
  // "tomorrow at X:XX"
  {
    pattern: /\btomorrow\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\b/i,
    parser: (match, now) => {
      let hours = parseInt(match[1]);
      const minutes = match[2] ? parseInt(match[2]) : 0;
      const ampm = match[3]?.toLowerCase();
      
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      const date = new Date(now);
      date.setDate(date.getDate() + 1);
      date.setHours(hours, minutes, 0, 0);
      
      return { date, isRecurring: false, confidence: 0.95 };
    },
  },
  
  // "today at X:XX"
  {
    pattern: /\btoday\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\b/i,
    parser: (match, now) => {
      let hours = parseInt(match[1]);
      const minutes = match[2] ? parseInt(match[2]) : 0;
      const ampm = match[3]?.toLowerCase();
      
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      const date = new Date(now);
      date.setHours(hours, minutes, 0, 0);
      
      // If time already passed, set for tomorrow
      if (date <= now) {
        date.setDate(date.getDate() + 1);
      }
      
      return { date, isRecurring: false, confidence: 0.95 };
    },
  },
  
  // Specific days "on Monday", "next Tuesday"
  {
    pattern: /\b(?:on\s+|next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\b/i,
    parser: (match, now) => {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = dayNames.indexOf(match[1].toLowerCase());
      let hours = match[2] ? parseInt(match[2]) : 9; // Default to 9 AM
      const minutes = match[3] ? parseInt(match[3]) : 0;
      const ampm = match[4]?.toLowerCase();
      
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      const date = new Date(now);
      const currentDay = date.getDay();
      let daysUntil = targetDay - currentDay;
      
      if (daysUntil <= 0) {
        daysUntil += 7; // Next week
      }
      
      date.setDate(date.getDate() + daysUntil);
      date.setHours(hours, minutes, 0, 0);
      
      return { date, isRecurring: false, confidence: 0.9 };
    },
  },
  
  // "every day at X:XX"
  {
    pattern: /\bevery\s+day\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\b/i,
    parser: (match, now) => {
      let hours = parseInt(match[1]);
      const minutes = match[2] ? parseInt(match[2]) : 0;
      const ampm = match[3]?.toLowerCase();
      
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      const date = new Date(now);
      date.setHours(hours, minutes, 0, 0);
      
      if (date <= now) {
        date.setDate(date.getDate() + 1);
      }
      
      return { 
        date, 
        isRecurring: true, 
        recurrencePattern: 'daily',
        confidence: 0.9 
      };
    },
  },
  
  // "every week on X at X:XX"
  {
    pattern: /\bevery\s+week\s+(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?)?\b/i,
    parser: (match, now) => {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = dayNames.indexOf(match[1].toLowerCase());
      let hours = match[2] ? parseInt(match[2]) : 9;
      const minutes = match[3] ? parseInt(match[3]) : 0;
      const ampm = match[4]?.toLowerCase();
      
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      const date = new Date(now);
      const currentDay = date.getDay();
      let daysUntil = targetDay - currentDay;
      
      if (daysUntil < 0) {
        daysUntil += 7;
      }
      
      date.setDate(date.getDate() + daysUntil);
      date.setHours(hours, minutes, 0, 0);
      
      return { 
        date, 
        isRecurring: true, 
        recurrencePattern: 'weekly',
        confidence: 0.9 
      };
    },
  },
  
  // "every X minutes/hours"
  {
    pattern: /\bevery\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs)\b/i,
    parser: (match, now) => {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      const date = new Date(now);
      
      if (unit.startsWith('minute') || unit.startsWith('min')) {
        date.setMinutes(date.getMinutes() + amount);
      } else if (unit.startsWith('hour') || unit.startsWith('hr')) {
        date.setHours(date.getHours() + amount);
      }
      
      return { 
        date, 
        isRecurring: true, 
        recurrencePattern: `*/${amount} ${unit.startsWith('hour') ? 'hours' : 'minutes'}`,
        confidence: 0.85 
      };
    },
  },
  
  // Morning, afternoon, evening, night
  {
    pattern: /\b(morning|afternoon|evening|night|midnight|noon)\b/i,
    parser: (match, now) => {
      const timeOfDay = match[1].toLowerCase();
      const date = new Date(now);
      
      const timeMap: Record<string, number> = {
        morning: 9,
        afternoon: 14,
        evening: 18,
        night: 20,
        midnight: 0,
        noon: 12,
      };
      
      const hours = timeMap[timeOfDay] ?? 9;
      date.setHours(hours, 0, 0, 0);
      
      // If time already passed, move to next day
      if (date <= now) {
        date.setDate(date.getDate() + 1);
      }
      
      return { date, isRecurring: false, confidence: 0.75 };
    },
  },
];

/**
 * Parse natural language time expression
 */
export function parseTime(text: string, referenceTime: Date = new Date()): ParsedTime | null {
  // Try each pattern
  for (const { pattern, parser } of TIME_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      try {
        const result = parser(match, referenceTime);
        if (result) {
          logger.debug({ text, result }, 'Time parsed successfully');
          return result;
        }
      } catch (error) {
        logger.warn({ error, text, pattern: pattern.source }, 'Time parsing failed');
      }
    }
  }
  
  logger.debug({ text }, 'No time pattern matched');
  return null;
}

/**
 * Format a date for display
 */
export function formatDateTime(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = new Date(now.setDate(now.getDate() + 1)).toDateString() === date.toDateString();
  
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
  
  if (isToday) return `Today at ${timeStr}`;
  if (isTomorrow) return `Tomorrow at ${timeStr}`;
  
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format relative time (e.g., "in 2 hours")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);
  
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `in ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
  if (diffHours < 24) return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
  return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
}

/**
 * Check if text contains a time expression
 */
export function containsTimeExpression(text: string): boolean {
  return TIME_PATTERNS.some(({ pattern }) => pattern.test(text));
}

/**
 * Extract reminder text (remove time expressions)
 */
export function extractReminderText(text: string): string {
  // Remove common time patterns to get the actual reminder message
  const patternsToRemove = [
    /\bremind\s+me\s+(?:to\s+)?/i,
    /\bset\s+(?:a\s+)?reminder\s+(?:to\s+)?/i,
    /\breminder\s+(?:to\s+)?/i,
    /\bin\s+\d+\s+(?:minute|minutes|min|mins|hour|hours|hr|hrs|day|days)\b/i,
    /\bat\s+\d{1,2}:?\d{2}?\s*(?:am|pm)?\b/i,
    /\btomorrow\b/i,
    /\btoday\b/i,
    /\bevery\s+(?:day|week)\b/i,
    /\bon\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\bevery\s+\d+\s+(?:minute|minutes|min|mins|hour|hours|hr|hrs)\b/i,
  ];
  
  let cleaned = text;
  for (const pattern of patternsToRemove) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  return cleaned.trim();
}
