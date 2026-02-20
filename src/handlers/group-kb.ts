/**
 * Group Knowledge Base Handler
 * 
 * Store and retrieve group-specific FAQs, rules, and information.
 */

import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import type { MessageContext } from '../llm/types.js';
import type { RouteResult } from '../core/message-router.js';
import { getStorage, MemoryStorage } from '../memory/storage.js';
import { isEnabled } from '../config/index.js';
import { getChatProvider } from '../llm/index.js';
import pino from 'pino';

const logger = pino({ name: 'group-kb' });

const KB_DIR = 'group-kb';
const KB_FILE = 'knowledge-base.json';
const FAQ_FILE = 'faqs.json';
const RULES_FILE = 'rules.json';

// Command patterns
const KB_ADD_PATTERN = /^\/(?:kb|knowledge)\s+add\s+"([^"]+)"\s*:\s*(.+)/is;
const KB_ASK_PATTERN = /^(?:what|how|where|when|who|why|is|can|does|do)\s+.+\?$/i;
const KB_SEARCH_PATTERN = /^\/(?:kb|faq)\s+(?:search|find)\s+(.+)/i;
const FAQ_ADD_PATTERN = /^\/(?:faq|question)\s+add\s+Q:\s*(.+?)\s*A:\s*(.+)/is;
const FAQ_LIST_PATTERN = /^\/(?:faq|question)s?\s*(?:list|all)?$/i;
const SET_RULES_PATTERN = /^\/(?:set|add)\s+rules?\s+(.+)/is;
const SHOW_RULES_PATTERN = /^\/(?:show|view)\s+rules?$/i;
const SET_TOPIC_PATTERN = /^\/(?:set|add)\s+topic\s+(.+)/is;
const SHOW_TOPIC_PATTERN = /^\/(?:show|view)\s+topic$/i;

interface KnowledgeEntry {
  id: string;
  key: string;
  value: string;
  addedBy: string;
  addedAt: string;
  tags: string[];
}

interface FAQEntry {
  id: string;
  question: string;
  answer: string;
  askedCount: number;
  addedBy: string;
  addedAt: string;
}

interface GroupKB {
  entries: KnowledgeEntry[];
  faqs: FAQEntry[];
  rules?: string;
  topic?: string;
}

/**
 * Get knowledge base for group
 */
async function getGroupKB(storage: MemoryStorage, chatJid: string): Promise<GroupKB> {
  try {
    await storage.ensureDir(KB_DIR);
    const fileName = `${KB_DIR}/${chatJid.replace(/[^a-zA-Z0-9]/g, '_')}_${KB_FILE}`;
    const data = await storage.readJson<GroupKB>(fileName);
    return data || { entries: [], faqs: [] };
  } catch {
    return { entries: [], faqs: [] };
  }
}

/**
 * Save knowledge base
 */
async function saveGroupKB(storage: MemoryStorage, chatJid: string, kb: GroupKB): Promise<void> {
  await storage.ensureDir(KB_DIR);
  const fileName = `${KB_DIR}/${chatJid.replace(/[^a-zA-Z0-9]/g, '_')}_${KB_FILE}`;
  await storage.writeJson(fileName, kb);
}

/**
 * Generate unique ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
}

/**
 * Search knowledge base
 */
async function searchKB(kb: GroupKB, query: string): Promise<Array<{ type: 'entry' | 'faq'; item: KnowledgeEntry | FAQEntry; score: number }>> {
  const results: Array<{ type: 'entry' | 'faq'; item: KnowledgeEntry | FAQEntry; score: number }> = [];
  const lowerQuery = query.toLowerCase();
  
  // Search entries
  for (const entry of kb.entries) {
    let score = 0;
    if (entry.key.toLowerCase().includes(lowerQuery)) score += 3;
    if (entry.value.toLowerCase().includes(lowerQuery)) score += 2;
    if (entry.tags.some(t => t.toLowerCase().includes(lowerQuery))) score += 1;
    
    if (score > 0) {
      results.push({ type: 'entry', item: entry, score });
    }
  }
  
  // Search FAQs
  for (const faq of kb.faqs) {
    let score = 0;
    if (faq.question.toLowerCase().includes(lowerQuery)) score += 3;
    if (faq.answer.toLowerCase().includes(lowerQuery)) score += 2;
    
    if (score > 0) {
      results.push({ type: 'faq', item: faq, score });
    }
  }
  
  // Sort by score
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Find answer using LLM
 */
async function findAnswerWithLLM(kb: GroupKB, question: string): Promise<string | null> {
  if (kb.entries.length === 0 && kb.faqs.length === 0) {
    return null;
  }

  const chatProvider = getChatProvider();
  
  // Build context from KB
  let context = 'Group Knowledge Base:\n\n';
  
  if (kb.rules) {
    context += `Rules:\n${kb.rules}\n\n`;
  }
  
  if (kb.topic) {
    context += `Current Topic: ${kb.topic}\n\n`;
  }
  
  if (kb.faqs.length > 0) {
    context += 'FAQs:\n';
    kb.faqs.slice(0, 10).forEach((faq, i) => {
      context += `${i + 1}. Q: ${faq.question}\n   A: ${faq.answer}\n`;
    });
    context += '\n';
  }
  
  if (kb.entries.length > 0) {
    context += 'Knowledge Entries:\n';
    kb.entries.slice(0, 10).forEach((entry) => {
      context += `- ${entry.key}: ${entry.value}\n`;
    });
  }

  const prompt = `Based on the following group knowledge base, answer this question:

${context}

Question: "${question}"

If the answer is not found in the knowledge base, respond with "NOT_FOUND".
Otherwise, provide a helpful, concise answer.`;

  try {
    const response = await chatProvider.chat({
      systemPrompt: 'You are a helpful assistant that answers questions based on a group knowledge base. Only use the provided information.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
    });

    if (response.content.includes('NOT_FOUND')) {
      return null;
    }

    return response.content.trim();
  } catch (error) {
    logger.error({ error }, 'LLM answer failed');
    return null;
  }
}

/**
 * Handle adding knowledge entry
 */
async function handleAddKnowledge(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext,
  storage: MemoryStorage
): Promise<RouteResult | null> {
  const match = text.match(KB_ADD_PATTERN);
  if (!match) return null;

  const key = match[1].trim();
  const value = match[2].trim();

  try {
    const kb = await getGroupKB(storage, context.chatJid);
    
    // Check if key already exists
    const existingIndex = kb.entries.findIndex(e => e.key.toLowerCase() === key.toLowerCase());
    
    if (existingIndex !== -1) {
      // Update existing
      kb.entries[existingIndex].value = value;
      kb.entries[existingIndex].addedBy = context.senderJid;
      kb.entries[existingIndex].addedAt = new Date().toISOString();
    } else {
      // Add new
      kb.entries.push({
        id: generateId('kb'),
        key,
        value,
        addedBy: context.senderJid,
        addedAt: new Date().toISOString(),
        tags: [],
      });
    }

    await saveGroupKB(storage, context.chatJid, kb);

    const response = `✅ Knowledge added!\n\n*${key}*\n${value}`;
    await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });

    return { response: '', success: true, contentType: 'text' };
  } catch (error) {
    logger.error({ error }, 'Failed to add knowledge');
    return { response: 'Failed to add knowledge entry.', success: false, contentType: 'text' };
  }
}

/**
 * Handle adding FAQ
 */
async function handleAddFAQ(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext,
  storage: MemoryStorage
): Promise<RouteResult | null> {
  const match = text.match(FAQ_ADD_PATTERN);
  if (!match) return null;

  const question = match[1].trim();
  const answer = match[2].trim();

  try {
    const kb = await getGroupKB(storage, context.chatJid);
    
    kb.faqs.push({
      id: generateId('faq'),
      question,
      answer,
      askedCount: 0,
      addedBy: context.senderJid,
      addedAt: new Date().toISOString(),
    });

    await saveGroupKB(storage, context.chatJid, kb);

    const response = `✅ FAQ added!\n\nQ: ${question}\nA: ${answer}`;
    await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });

    return { response: '', success: true, contentType: 'text' };
  } catch (error) {
    logger.error({ error }, 'Failed to add FAQ');
    return { response: 'Failed to add FAQ.', success: false, contentType: 'text' };
  }
}

/**
 * Handle listing FAQs
 */
async function handleListFAQs(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext,
  storage: MemoryStorage
): Promise<RouteResult | null> {
  if (!text.match(FAQ_LIST_PATTERN)) return null;

  try {
    const kb = await getGroupKB(storage, context.chatJid);

    if (kb.faqs.length === 0) {
      return {
        response: '📚 No FAQs yet.\n\nAdd one with:\n`/faq add Q: Question? A: Answer`',
        success: true,
        contentType: 'text',
      };
    }

    let response = `📚 *Group FAQs* (${kb.faqs.length})\n\n`;
    kb.faqs.forEach((faq, i) => {
      response += `${i + 1}. *${faq.question}*\n`;
      response += `   ${faq.answer.substring(0, 100)}${faq.answer.length > 100 ? '...' : ''}\n\n`;
    });

    await sock.sendMessage(context.chatJid, { text: response.trim() }, { quoted: message });

    return { response: '', success: true, contentType: 'text' };
  } catch (error) {
    logger.error({ error }, 'Failed to list FAQs');
    return { response: 'Failed to list FAQs.', success: false, contentType: 'text' };
  }
}

/**
 * Handle setting rules
 */
async function handleSetRules(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext,
  storage: MemoryStorage
): Promise<RouteResult | null> {
  const match = text.match(SET_RULES_PATTERN);
  if (!match) return null;

  const rules = match[1].trim();

  try {
    const kb = await getGroupKB(storage, context.chatJid);
    kb.rules = rules;
    await saveGroupKB(storage, context.chatJid, kb);

    const response = `✅ Group rules updated!\n\n${rules}`;
    await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });

    return { response: '', success: true, contentType: 'text' };
  } catch (error) {
    logger.error({ error }, 'Failed to set rules');
    return { response: 'Failed to set rules.', success: false, contentType: 'text' };
  }
}

/**
 * Handle showing rules
 */
async function handleShowRules(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext,
  storage: MemoryStorage
): Promise<RouteResult | null> {
  if (!text.match(SHOW_RULES_PATTERN)) return null;

  try {
    const kb = await getGroupKB(storage, context.chatJid);

    if (!kb.rules) {
      return {
        response: '📋 No rules set.\n\nSet rules with:\n`/set rules No spam, be respectful!`',
        success: true,
        contentType: 'text',
      };
    }

    const response = `📋 *Group Rules*\n\n${kb.rules}`;
    await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });

    return { response: '', success: true, contentType: 'text' };
  } catch (error) {
    logger.error({ error }, 'Failed to show rules');
    return { response: 'Failed to show rules.', success: false, contentType: 'text' };
  }
}

/**
 * Handle setting topic
 */
async function handleSetTopic(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext,
  storage: MemoryStorage
): Promise<RouteResult | null> {
  const match = text.match(SET_TOPIC_PATTERN);
  if (!match) return null;

  const topic = match[1].trim();

  try {
    const kb = await getGroupKB(storage, context.chatJid);
    kb.topic = topic;
    await saveGroupKB(storage, context.chatJid, kb);

    const response = `✅ Group topic set!\n\n📌 ${topic}`;
    await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });

    return { response: '', success: true, contentType: 'text' };
  } catch (error) {
    logger.error({ error }, 'Failed to set topic');
    return { response: 'Failed to set topic.', success: false, contentType: 'text' };
  }
}

/**
 * Handle showing topic
 */
async function handleShowTopic(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext,
  storage: MemoryStorage
): Promise<RouteResult | null> {
  if (!text.match(SHOW_TOPIC_PATTERN)) return null;

  try {
    const kb = await getGroupKB(storage, context.chatJid);

    if (!kb.topic) {
      return {
        response: '📌 No topic set.\n\nSet topic with:\n`/set topic Programming Discussion`',
        success: true,
        contentType: 'text',
      };
    }

    const response = `📌 *Current Topic*\n\n${kb.topic}`;
    await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });

    return { response: '', success: true, contentType: 'text' };
  } catch (error) {
    logger.error({ error }, 'Failed to show topic');
    return { response: 'Failed to show topic.', success: false, contentType: 'text' };
  }
}

/**
 * Handle KB search
 */
async function handleKBSearch(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext,
  storage: MemoryStorage
): Promise<RouteResult | null> {
  const match = text.match(KB_SEARCH_PATTERN);
  if (!match) return null;

  const query = match[1].trim();

  try {
    const kb = await getGroupKB(storage, context.chatJid);
    const results = await searchKB(kb, query);

    if (results.length === 0) {
      return {
        response: `🔍 No results found for "${query}".`,
        success: true,
        contentType: 'text',
      };
    }

    let response = `🔍 *Search Results* for "${query}"\n\n`;
    results.slice(0, 5).forEach((result, i) => {
      if (result.type === 'faq') {
        const faq = result.item as FAQEntry;
        response += `${i + 1}. *Q: ${faq.question}*\n   A: ${faq.answer.substring(0, 100)}${faq.answer.length > 100 ? '...' : ''}\n\n`;
      } else {
        const entry = result.item as KnowledgeEntry;
        response += `${i + 1}. *${entry.key}*\n   ${entry.value.substring(0, 100)}${entry.value.length > 100 ? '...' : ''}\n\n`;
      }
    });

    await sock.sendMessage(context.chatJid, { text: response.trim() }, { quoted: message });

    return { response: '', success: true, contentType: 'text' };
  } catch (error) {
    logger.error({ error }, 'Failed to search KB');
    return { response: 'Failed to search knowledge base.', success: false, contentType: 'text' };
  }
}

/**
 * Handle natural language question
 */
async function handleQuestion(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext,
  storage: MemoryStorage
): Promise<RouteResult | null> {
  // Check if this looks like a question
  if (!text.match(KB_ASK_PATTERN)) return null;

  try {
    const kb = await getGroupKB(storage, context.chatJid);

    // First try exact search
    const searchResults = await searchKB(kb, text);
    if (searchResults.length > 0 && searchResults[0].score >= 3) {
      const best = searchResults[0];
      let response = '';
      
      if (best.type === 'faq') {
        const faq = best.item as FAQEntry;
        response = `📚 *${faq.question}*\n\n${faq.answer}`;
        
        // Increment asked count
        faq.askedCount++;
        await saveGroupKB(storage, context.chatJid, kb);
      } else {
        const entry = best.item as KnowledgeEntry;
        response = `📚 *${entry.key}*\n\n${entry.value}`;
      }

      await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });
      return { response: '', success: true, contentType: 'text' };
    }

    // Try LLM-based answer
    const answer = await findAnswerWithLLM(kb, text);
    if (answer) {
      const response = `📚 *Answer*\n\n${answer}\n\n_Answered from group knowledge base_`;
      await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });
      return { response: '', success: true, contentType: 'text' };
    }

    return null;
  } catch (error) {
    logger.error({ error }, 'Failed to answer question');
    return null;
  }
}

/**
 * Main handler
 */
export async function handleGroupKB(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  if (!isEnabled('groupKnowledgeBase')) return null;
  if (!context.isGroup) return null;

  const storage = getStorage();

  // Try specific commands first
  const addKBResult = await handleAddKnowledge(sock, message, text, context, storage);
  if (addKBResult) return addKBResult;

  const addFAQResult = await handleAddFAQ(sock, message, text, context, storage);
  if (addFAQResult) return addFAQResult;

  const listFAQResult = await handleListFAQs(sock, message, text, context, storage);
  if (listFAQResult) return listFAQResult;

  const setRulesResult = await handleSetRules(sock, message, text, context, storage);
  if (setRulesResult) return setRulesResult;

  const showRulesResult = await handleShowRules(sock, message, text, context, storage);
  if (showRulesResult) return showRulesResult;

  const setTopicResult = await handleSetTopic(sock, message, text, context, storage);
  if (setTopicResult) return setTopicResult;

  const showTopicResult = await handleShowTopic(sock, message, text, context, storage);
  if (showTopicResult) return showTopicResult;

  const searchResult = await handleKBSearch(sock, message, text, context, storage);
  if (searchResult) return searchResult;

  // Try natural language question
  const questionResult = await handleQuestion(sock, message, text, context, storage);
  if (questionResult) return questionResult;

  return null;
}
