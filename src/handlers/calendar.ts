/**
 * Calendar Integration Handler
 * 
 * Schedule events, check availability, and manage reminders.
 * Simple JSON-based storage for events.
 */

import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import type { MessageContext } from '../llm/types.js';
import type { RouteResult } from '../core/message-router.js';
import { getStorage, MemoryStorage } from '../memory/storage.js';
import { isEnabled } from '../config/index.js';
import { getChatProvider } from '../llm/index.js';
import pino from 'pino';

const logger = pino({ name: 'calendar-handler' });

const CALENDAR_FILE = 'calendar.json';
const CALENDAR_DIR = 'calendar';

// Command patterns
const SCHEDULE_PATTERN = /^(?:schedule|add to calendar|create event)\s*:?\s*(.+)/i;
const LIST_EVENTS_PATTERN = /^\/(?:calendar|events|schedule)(?:\s+(today|tomorrow|week|all))?$/i;
const DELETE_EVENT_PATTERN = /^\/(?:delete|cancel|remove)\s+(?:event\s+)?(\d+|[a-f0-9-]+)/i;

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO string
  endTime?: string;
  location?: string;
  createdBy: string;
  createdAt: string;
  reminderSent: boolean;
}

interface CalendarData {
  events: CalendarEvent[];
}

/**
 * Parse natural language date/time
 */
function parseDateTime(input: string): Date | null {
  const now = new Date();
  const lower = input.toLowerCase();
  
  // Handle relative times
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Try to extract time
    const timeMatch = input.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || '0');
      const ampm = timeMatch[3]?.toLowerCase();
      
      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      tomorrow.setHours(hours, minutes, 0, 0);
    } else {
      tomorrow.setHours(9, 0, 0, 0);
    }
    return tomorrow;
  }
  
  if (lower.includes('today')) {
    const today = new Date(now);
    const timeMatch = input.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || '0');
      const ampm = timeMatch[3]?.toLowerCase();
      
      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      today.setHours(hours, minutes, 0, 0);
      return today;
    }
  }
  
  if (lower.includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);
    return nextWeek;
  }
  
  // Try to parse explicit dates
  const dateMatch = input.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]) - 1;
    const day = parseInt(dateMatch[2]);
    let year = dateMatch[3] ? parseInt(dateMatch[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    
    const date = new Date(year, month, day);
    
    // Try to get time
    const timeMatch = input.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || '0');
      const ampm = timeMatch[3]?.toLowerCase();
      
      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      date.setHours(hours, minutes, 0, 0);
    } else {
      date.setHours(9, 0, 0, 0);
    }
    
    return date;
  }
  
  // Try ISO date
  const isoDate = new Date(input);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }
  
  return null;
}

/**
 * Extract event details from natural language
 */
async function extractEventDetails(
  input: string,
  senderName: string
): Promise<{ title: string; dateTime: Date; description?: string } | null> {
  // First try to parse date from input
  const dateTime = parseDateTime(input);
  
  if (!dateTime) {
    return null;
  }
  
  // Use LLM to extract event title and details
  const chatProvider = getChatProvider();
  
  const prompt = `Extract the event details from this message:
"${input}"

The date/time detected is: ${dateTime.toLocaleString()}

Return ONLY a JSON object in this format:
{
  "title": "Short event title (required)",
  "description": "Optional longer description"
}

If no clear event title can be extracted, return {"title": "Event"}`;

  try {
    const response = await chatProvider.chat({
      systemPrompt: 'You extract event information from natural language. Respond with valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
    });

    const cleaned = response.content
      .replace(/^```json\s*/, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    
    return {
      title: parsed.title || 'Event',
      dateTime,
      description: parsed.description,
    };
  } catch (error) {
    // Fallback: use input as title
    const title = input
      .replace(/^(schedule|add to calendar|create event)\s*:?\s*/i, '')
      .split(/at|on|for/i)[0]
      .trim()
      .substring(0, 100);
    
    return {
      title: title || 'Event',
      dateTime,
    };
  }
}

/**
 * Get calendar storage
 */
async function getCalendarData(storage: MemoryStorage): Promise<CalendarData> {
  try {
    await storage.ensureDir(CALENDAR_DIR);
    const data = await storage.readJson<CalendarData>(`${CALENDAR_DIR}/${CALENDAR_FILE}`);
    return data || { events: [] };
  } catch {
    return { events: [] };
  }
}

/**
 * Save calendar data
 */
async function saveCalendarData(storage: MemoryStorage, data: CalendarData): Promise<void> {
  await storage.ensureDir(CALENDAR_DIR);
  await storage.writeJson(`${CALENDAR_DIR}/${CALENDAR_FILE}`, data);
}

/**
 * Generate unique event ID
 */
function generateEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
}

/**
 * Format event for display
 */
function formatEvent(event: CalendarEvent, index?: number): string {
  const date = new Date(event.startTime);
  const dateStr = date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
  
  let output = '';
  if (index !== undefined) {
    output += `${index}. `;
  }
  output += `*${event.title}*\n`;
  output += `   📅 ${dateStr} at ${timeStr}\n`;
  
  if (event.description) {
    output += `   📝 ${event.description}\n`;
  }
  if (event.location) {
    output += `   📍 ${event.location}\n`;
  }
  
  return output;
}

/**
 * Handle schedule event command
 */
async function handleScheduleEvent(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext,
  storage: MemoryStorage
): Promise<RouteResult | null> {
  const match = text.match(SCHEDULE_PATTERN);
  if (!match) {
    return null;
  }

  const eventText = match[1];
  
  try {
    await sock.sendPresenceUpdate('composing', context.chatJid);
    
    const details = await extractEventDetails(eventText, context.senderName);
    
    if (!details) {
      await sock.sendPresenceUpdate('paused', context.chatJid);
      return {
        response: "❓ I couldn't understand the date/time. Try:\n• 'Meeting tomorrow at 3pm'\n• 'Call mom on 12/25 at 10am'\n• 'Dentist appointment 2/15 2:30pm'",
        success: false,
        contentType: 'text',
      };
    }

    const calendar = await getCalendarData(storage);
    
    const newEvent: CalendarEvent = {
      id: generateEventId(),
      title: details.title,
      description: details.description,
      startTime: details.dateTime.toISOString(),
      createdBy: context.senderJid,
      createdAt: new Date().toISOString(),
      reminderSent: false,
    };

    calendar.events.push(newEvent);
    await saveCalendarData(storage, calendar);

    await sock.sendPresenceUpdate('paused', context.chatJid);

    const response = `✅ *Event Scheduled*\n\n${formatEvent(newEvent)}\n\n_To see all events, type: /calendar_`;
    
    await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });

    logger.info({
      eventId: newEvent.id,
      title: newEvent.title,
      chat: context.chatJid,
    }, 'Event scheduled');

    return {
      response: '',
      success: true,
      contentType: 'text',
    };

  } catch (error) {
    logger.error({ error }, 'Failed to schedule event');
    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});
    
    return {
      response: 'Sorry, I had trouble scheduling that event. Please try again.',
      success: false,
      contentType: 'text',
    };
  }
}

/**
 * Handle list events command
 */
async function handleListEvents(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext,
  storage: MemoryStorage
): Promise<RouteResult | null> {
  const match = text.match(LIST_EVENTS_PATTERN);
  if (!match && !text.match(/^\/(?:calendar|events|schedule)$/i)) {
    return null;
  }

  const filter = match?.[1]?.toLowerCase() || 'upcoming';

  try {
    const calendar = await getCalendarData(storage);
    const now = new Date();
    
    let events = calendar.events;
    let title = '📅 Your Calendar';
    
    switch (filter) {
      case 'today': {
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        events = events.filter(e => {
          const date = new Date(e.startTime);
          return date >= today && date < tomorrow;
        });
        title = '📅 Today\'s Events';
        break;
      }
      
      case 'tomorrow': {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const dayAfter = new Date(tomorrow);
        dayAfter.setDate(dayAfter.getDate() + 1);
        
        events = events.filter(e => {
          const date = new Date(e.startTime);
          return date >= tomorrow && date < dayAfter;
        });
        title = '📅 Tomorrow\'s Events';
        break;
      }
      
      case 'week': {
        const weekFromNow = new Date(now);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        
        events = events.filter(e => {
          const date = new Date(e.startTime);
          return date >= now && date <= weekFromNow;
        });
        title = '📅 This Week';
        break;
      }
      
      case 'all':
        // Show all events sorted by date
        events = events.sort((a, b) => 
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        title = '📅 All Events';
        break;
      
      case 'upcoming':
      default:
        // Show upcoming events (next 30 days)
        const monthFromNow = new Date(now);
        monthFromNow.setDate(monthFromNow.getDate() + 30);
        
        events = events.filter(e => {
          const date = new Date(e.startTime);
          return date >= now && date <= monthFromNow;
        });
        title = '📅 Upcoming Events';
        break;
    }

    // Sort by date
    events = events.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    if (events.length === 0) {
      const response = `${title}\n\n_No events found. Schedule one with:\n"Meeting tomorrow at 3pm"_`;
      await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });
      
      return {
        response: '',
        success: true,
        contentType: 'text',
      };
    }

    let response = `${title} (${events.length})\n\n`;
    events.forEach((event, i) => {
      response += formatEvent(event, i + 1) + '\n';
    });

    response += '\n_To delete: /delete event [number]_';

    await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });

    return {
      response: '',
      success: true,
      contentType: 'text',
    };

  } catch (error) {
    logger.error({ error }, 'Failed to list events');
    return {
      response: 'Sorry, I had trouble retrieving your calendar.',
      success: false,
      contentType: 'text',
    };
  }
}

/**
 * Handle delete event command
 */
async function handleDeleteEvent(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext,
  storage: MemoryStorage
): Promise<RouteResult | null> {
  const match = text.match(DELETE_EVENT_PATTERN);
  if (!match) {
    return null;
  }

  const identifier = match[1];

  try {
    const calendar = await getCalendarData(storage);
    const now = new Date();
    
    // Get upcoming events sorted
    const upcomingEvents = calendar.events
      .filter(e => new Date(e.startTime) >= now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    let eventToDelete: CalendarEvent | null = null;
    let eventIndex = -1;

    // Check if it's a number (list index)
    const index = parseInt(identifier);
    if (!isNaN(index) && index > 0 && index <= upcomingEvents.length) {
      eventToDelete = upcomingEvents[index - 1];
      eventIndex = calendar.events.findIndex(e => e.id === eventToDelete!.id);
    } else {
      // Try to find by ID
      eventIndex = calendar.events.findIndex(e => e.id === identifier);
      if (eventIndex !== -1) {
        eventToDelete = calendar.events[eventIndex];
      }
    }

    if (!eventToDelete || eventIndex === -1) {
      return {
        response: '❌ Event not found. Use `/calendar` to see your events and their numbers.',
        success: false,
        contentType: 'text',
      };
    }

    // Remove event
    calendar.events.splice(eventIndex, 1);
    await saveCalendarData(storage, calendar);

    const response = `✅ *Deleted:* "${eventToDelete.title}"\n\n📅 ${new Date(eventToDelete.startTime).toLocaleDateString()}`;
    
    await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });

    logger.info({ eventId: eventToDelete.id }, 'Event deleted');

    return {
      response: '',
      success: true,
      contentType: 'text',
    };

  } catch (error) {
    logger.error({ error }, 'Failed to delete event');
    return {
      response: 'Sorry, I had trouble deleting that event.',
      success: false,
      contentType: 'text',
    };
  }
}

/**
 * Main calendar handler
 */
export async function handleCalendarCommand(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  if (!isEnabled('calendarIntegration')) {
    return null;
  }

  const storage = getStorage();

  // Try schedule command first
  const scheduleResult = await handleScheduleEvent(sock, message, text, context, storage);
  if (scheduleResult) return scheduleResult;

  // Try delete command
  const deleteResult = await handleDeleteEvent(sock, message, text, context, storage);
  if (deleteResult) return deleteResult;

  // Try list command
  const listResult = await handleListEvents(sock, message, text, context, storage);
  if (listResult) return listResult;

  return null;
}

/**
 * Check for upcoming events and send reminders
 * Called periodically by reminder scheduler
 */
export async function checkUpcomingEvents(sock: WASocket): Promise<void> {
  if (!isEnabled('calendarIntegration')) {
    return;
  }

  try {
    const storage = getStorage();
    const calendar = await getCalendarData(storage);
    const now = new Date();
    
    // Look for events in next 15 minutes that haven't had reminders sent
    const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);
    
    for (const event of calendar.events) {
      if (event.reminderSent) continue;
      
      const eventTime = new Date(event.startTime);
      
      // If event is within next 15 minutes
      if (eventTime > now && eventTime <= fifteenMinutesFromNow) {
        // Send reminder
        const timeUntil = Math.ceil((eventTime.getTime() - now.getTime()) / 60000);
        
        const reminderText = `⏰ *Event Reminder*\n\n` +
          `"${event.title}" starts in ${timeUntil} minute${timeUntil !== 1 ? 's' : ''}!\n\n` +
          `📅 ${eventTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
        
        await sock.sendMessage(event.createdBy, { text: reminderText });
        
        event.reminderSent = true;
        
        logger.info({ eventId: event.id }, 'Sent event reminder');
      }
      
      // Clean up past events (older than 1 day)
      if (eventTime < new Date(now.getTime() - 24 * 60 * 60 * 1000)) {
        // Mark for deletion or archive
      }
    }
    
    await saveCalendarData(storage, calendar);
    
  } catch (error) {
    logger.error({ error }, 'Failed to check upcoming events');
  }
}
