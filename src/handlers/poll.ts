/**
 * Poll Handler
 * Creates and manages polls in WhatsApp chats
 */

import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import type { MessageContext } from '../llm/types.js';
import type { RouteResult } from '../core/message-router.js';
import { isEnabled } from '../config/index.js';
import { getMemoryOrchestrator } from '../memory/index.js';
import pino from 'pino';

const logger = pino({ name: 'poll-handler' });

// In-memory poll storage (will be replaced with persistent storage later)
const activePolls = new Map<string, Poll>();

export interface Poll {
  id: string;
  chatJid: string;
  creatorJid: string;
  question: string;
  options: string[];
  votes: Map<string, string>; // userJid -> optionIndex
  isAnonymous: boolean;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

export interface PollResult {
  option: string;
  votes: number;
  percentage: number;
  voters?: string[]; // Only populated if not anonymous
}

// Poll creation patterns
const POLL_CREATE_PATTERNS = [
  /\bcreate\s+(a\s+)?poll\b/i,
  /\bstart\s+(a\s+)?poll\b/i,
  /\bmake\s+(a\s+)?poll\b/i,
  /\bpoll\s*:\s*/i,
  /\bvote\s+on\s+this\b/i,
  /\bwho\s+(?:is|are|'s)\s+.+(\?|\n)\s*[•\-\*\d]/i, // Question followed by bullet options
  /\bwhich\s+(?:is|are)\s+better/i,
  /\bwhat\s+(?:do\s+you\s+think|should\s+we)/i,
];

// Poll command patterns
const POLL_VOTE_PATTERN = /^\/(\d+)$/; // /1, /2, etc.
const POLL_END_PATTERN = /^\/(end|close|finish)\s+poll$/i;
const POLL_STATUS_PATTERN = /^\/(poll\s+status|show\s+poll|poll\s+results)$/i;

/**
 * Check if text is a poll creation request
 */
function isPollCreationRequest(text: string): boolean {
  for (const pattern of POLL_CREATE_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Parse poll creation text
 * Expected formats:
 * - "Create a poll: What should we eat? Options: Pizza, Sushi, Burgers"
 * - "Poll: Best programming language? Options: Python, JavaScript, Rust, Go"
 */
function parsePollCreation(text: string): { question: string; options: string[] } | null {
  // Remove the command part
  const withoutCommand = text
    .replace(/\b(create|start|make)\s+(a\s+)?poll\s*:?\s*/i, '')
    .replace(/\bpoll\s*:?\s*/i, '')
    .trim();

  if (!withoutCommand) return null;

  // Look for "Options:" or similar separators
  const separators = [
    /options?\s*:?\s*/i,
    /choices?\s*:?\s*/i,
    /answers?\s*:?\s*/i,
    /\n/,
  ];

  let question = withoutCommand;
  let optionsText = '';

  for (const separator of separators) {
    const parts = withoutCommand.split(separator);
    if (parts.length >= 2) {
      question = parts[0].trim();
      optionsText = parts.slice(1).join(' ');
      break;
    }
  }

  // Parse options - handle bullets, numbers, commas
  const options = optionsText
    .split(/\n/)
    .map(line => line.replace(/^[•\-\*\d.)]+\s*/, '').trim()) // Remove bullets/numbers
    .filter(line => line.length > 0)
    .flatMap(line => line.split(/[,\/|]/).map(o => o.trim()).filter(o => o.length > 0));

  // If no explicit options found, try to parse from question format
  if (options.length === 0) {
    // Try format: "Question? Option1, Option2, Option3"
    const qMatch = withoutCommand.match(/^(.+\?)\s*(.+)/);
    if (qMatch) {
      question = qMatch[1].trim();
      const optsPart = qMatch[2];
      const parsedOpts = optsPart
        .split(/[,\/|]/)
        .map(o => o.trim())
        .filter(o => o.length > 0);
      if (parsedOpts.length >= 2) {
        return { question, options: parsedOpts };
      }
    }
    return null;
  }

  if (options.length < 2) {
    return null;
  }

  return { question, options: options.slice(0, 10) }; // Max 10 options
}

/**
 * Generate unique poll ID
 */
function generatePollId(): string {
  return `poll_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

/**
 * Format poll for display
 */
function formatPoll(poll: Poll): string {
  const lines: string[] = [];
  
  lines.push(`📊 *${poll.question}*`);
  lines.push('');
  
  // Calculate results
  const results = calculateResults(poll);
  
  results.forEach((result, index) => {
    const bar = '█'.repeat(Math.round(result.percentage / 10)) + '░'.repeat(10 - Math.round(result.percentage / 10));
    lines.push(`${index + 1}. ${result.option}`);
    lines.push(`   ${bar} ${result.votes} vote${result.votes !== 1 ? 's' : ''} (${result.percentage}%)`);
    lines.push('');
  });
  
  const totalVotes = poll.votes.size;
  lines.push(`Total votes: ${totalVotes}`);
  lines.push('');
  lines.push('To vote, reply with: /1, /2, /3, etc.');
  
  if (poll.isAnonymous) {
    lines.push('_This poll is anonymous_');
  }
  
  return lines.join('\n');
}

/**
 * Calculate poll results
 */
function calculateResults(poll: Poll): PollResult[] {
  const counts = new Map<string, number>();
  const voters = new Map<string, string[]>();
  
  // Initialize counts
  poll.options.forEach(opt => {
    counts.set(opt, 0);
    voters.set(opt, []);
  });
  
  // Count votes
  for (const [userJid, optionIndex] of poll.votes) {
    const option = poll.options[parseInt(optionIndex)];
    if (option) {
      counts.set(option, (counts.get(option) || 0) + 1);
      if (!poll.isAnonymous) {
        const voterList = voters.get(option) || [];
        voterList.push(userJid.split('@')[0]);
        voters.set(option, voterList);
      }
    }
  }
  
  const totalVotes = poll.votes.size;
  
  return poll.options.map(option => {
    const votes = counts.get(option) || 0;
    const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
    
    return {
      option,
      votes,
      percentage,
      voters: poll.isAnonymous ? undefined : voters.get(option),
    };
  });
}

/**
 * Handle poll creation
 */
export async function handlePollCreation(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('pollCreator')) {
    return null;
  }
  
  // Check if it's a poll creation request
  if (!isPollCreationRequest(text)) {
    return null;
  }
  
  try {
    logger.info({ chat: context.chatJid }, 'Processing poll creation');
    
    // Parse poll
    const parsed = parsePollCreation(text);
    
    if (!parsed) {
      return {
        response: `📊 To create a poll, use this format:

*Create a poll: Question?*
Options:
1. Option 1
2. Option 2
3. Option 3

Or:
*Poll: Best color?* Red, Blue, Green`,
        success: true,
        contentType: 'text',
      };
    }
    
    const { question, options } = parsed;
    
    // Create poll object
    const poll: Poll = {
      id: generatePollId(),
      chatJid: context.chatJid,
      creatorJid: context.senderJid,
      question,
      options,
      votes: new Map(),
      isAnonymous: true,
      createdAt: new Date(),
      isActive: true,
    };
    
    // Store poll
    activePolls.set(context.chatJid, poll);
    
    // Log to memory
    const memory = getMemoryOrchestrator();
    await memory.logConversation({
      timestamp: new Date(),
      chatJid: context.chatJid,
      chatName: context.groupName || context.senderName,
      senderJid: context.senderJid,
      senderName: context.senderName,
      userMessage: text,
      buddyResponse: `Poll created: ${question}`,
      isGroup: context.isGroup,
    });
    
    logger.info({ pollId: poll.id, question, options }, 'Poll created');
    
    return {
      response: `✅ Poll created!\n\n${formatPoll(poll)}`,
      success: true,
      contentType: 'text',
    };
    
  } catch (error) {
    logger.error({ error }, 'Failed to create poll');
    return {
      response: "Sorry, I couldn't create the poll. Please try again with a clearer question and options.",
      success: false,
      contentType: 'text',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle poll vote
 */
export async function handlePollVote(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('pollCreator')) {
    return null;
  }
  
  // Check if it's a vote command
  const voteMatch = text.match(POLL_VOTE_PATTERN);
  if (!voteMatch) {
    return null;
  }
  
  const optionIndex = parseInt(voteMatch[1]) - 1; // Convert to 0-based
  
  try {
    // Get active poll for this chat
    const poll = activePolls.get(context.chatJid);
    
    if (!poll || !poll.isActive) {
      return {
        response: "There's no active poll in this chat. Create one with 'Create a poll: Question?'",
        success: true,
        contentType: 'text',
      };
    }
    
    // Validate option index
    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      return {
        response: `Invalid option. Please vote with /1 to /${poll.options.length}`,
        success: true,
        contentType: 'text',
      };
    }
    
    // Record vote
    poll.votes.set(context.senderJid, optionIndex.toString());
    
    logger.info({ 
      pollId: poll.id, 
      voter: context.senderJid, 
      option: optionIndex 
    }, 'Vote recorded');
    
    // Send updated results
    return {
      response: `✅ Vote recorded!\n\n${formatPoll(poll)}`,
      success: true,
      contentType: 'text',
    };
    
  } catch (error) {
    logger.error({ error }, 'Failed to record vote');
    return {
      response: "Sorry, I couldn't record your vote. Please try again.",
      success: false,
      contentType: 'text',
    };
  }
}

/**
 * Handle poll status/results request
 */
export async function handlePollStatus(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('pollCreator')) {
    return null;
  }
  
  // Check if it's a status command
  if (!POLL_STATUS_PATTERN.test(text)) {
    return null;
  }
  
  try {
    const poll = activePolls.get(context.chatJid);
    
    if (!poll) {
      return {
        response: "There's no active poll in this chat. Create one with 'Create a poll: Question?'",
        success: true,
        contentType: 'text',
      };
    }
    
    return {
      response: formatPoll(poll),
      success: true,
      contentType: 'text',
    };
    
  } catch (error) {
    logger.error({ error }, 'Failed to get poll status');
    return null;
  }
}

/**
 * Handle poll end/close
 */
export async function handlePollEnd(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('pollCreator')) {
    return null;
  }
  
  // Check if it's an end command
  if (!POLL_END_PATTERN.test(text)) {
    return null;
  }
  
  try {
    const poll = activePolls.get(context.chatJid);
    
    if (!poll) {
      return {
        response: "There's no active poll to end.",
        success: true,
        contentType: 'text',
      };
    }
    
    // Only creator or admin can end poll (simplified - just check creator for now)
    if (poll.creatorJid !== context.senderJid) {
      return {
        response: "Only the poll creator can end the poll.",
        success: true,
        contentType: 'text',
      };
    }
    
    poll.isActive = false;
    
    // Final results
    const results = calculateResults(poll);
    const winner = results.reduce((prev, current) => 
      prev.votes > current.votes ? prev : current
    );
    
    const lines: string[] = [];
    lines.push(`🏁 *Poll Ended: ${poll.question}*`);
    lines.push('');
    lines.push('*Final Results:*');
    lines.push('');
    
    results.forEach((result, index) => {
      lines.push(`${index + 1}. ${result.option}: ${result.votes} votes (${result.percentage}%)`);
    });
    
    lines.push('');
    lines.push(`🏆 Winner: *${winner.option}* with ${winner.votes} votes!`);
    
    // Remove from active polls
    activePolls.delete(context.chatJid);
    
    logger.info({ pollId: poll.id, winner: winner.option }, 'Poll ended');
    
    return {
      response: lines.join('\n'),
      success: true,
      contentType: 'text',
    };
    
  } catch (error) {
    logger.error({ error }, 'Failed to end poll');
    return null;
  }
}
