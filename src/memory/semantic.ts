/**
 * Semantic Memory System
 * Uses vector embeddings for meaning-based memory search
 */

import { openai } from '../llm/openai.js';
import { getConfig } from '../config/index.js';
import { isEnabled } from '../config/index.js';
import { getLongTermMemory } from './long-term.js';
import { getDailyNotes } from './daily-notes.js';
import { randomUUID } from 'crypto';
import pino from 'pino';

const logger = pino({ name: 'semantic-memory' });

// Simple in-memory vector store (will persist to JSON)
interface VectorEntry {
  id: string;
  text: string;
  embedding: number[];
  source: 'long-term' | 'daily' | 'user';
  metadata: {
    chatJid?: string;
    senderJid?: string;
    timestamp: Date;
    category?: string;
  };
}

interface VectorStore {
  entries: VectorEntry[];
  version: number;
  lastUpdated: Date;
}

const VECTOR_STORE_VERSION = 1;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 1536;
const SIMILARITY_THRESHOLD = 0.7; // Minimum cosine similarity
const MAX_ENTRIES = 10000; // Evict oldest entries beyond this limit

class SemanticMemory {
  private store: VectorStore = {
    entries: [],
    version: VECTOR_STORE_VERSION,
    lastUpdated: new Date(),
  };
  private initialized = false;

  /**
   * Initialize semantic memory - load existing vectors
   */
  async initialize(): Promise<void> {
    if (!isEnabled('semanticMemory')) {
      logger.info('Semantic memory disabled, skipping initialization');
      return;
    }

    if (this.initialized) return;

    try {
      await this.loadVectors();
      this.initialized = true;
      logger.info(
        { entries: this.store.entries.length },
        'Semantic memory initialized'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to initialize semantic memory');
    }
  }

  /**
   * Generate embedding for text using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const client = openai;
    
    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000), // OpenAI limit
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error({ error, textLength: text.length }, 'Failed to generate embedding');
      throw error;
    }
  }

  /**
   * Add a memory with its embedding
   */
  async addMemory(
    text: string,
    source: 'long-term' | 'daily' | 'user',
    metadata: VectorEntry['metadata']
  ): Promise<void> {
    if (!isEnabled('semanticMemory')) return;
    if (!text || text.length < 10) return; // Skip very short texts

    try {
      // Check if similar entry already exists
      const existing = await this.findSimilar(text, 1);
      if (existing.length > 0 && existing[0].score > 0.95) {
        logger.debug('Very similar entry already exists, skipping');
        return;
      }

      const embedding = await this.generateEmbedding(text);
      const entry: VectorEntry = {
        id: `vec_${randomUUID().slice(0, 12)}`,
        text,
        embedding,
        source,
        metadata: {
          ...metadata,
          timestamp: new Date(),
        },
      };

      this.store.entries.push(entry);
      this.store.lastUpdated = new Date();

      // Evict oldest entries if over limit
      if (this.store.entries.length > MAX_ENTRIES) {
        this.store.entries.sort(
          (a, b) => new Date(b.metadata.timestamp).getTime() - new Date(a.metadata.timestamp).getTime()
        );
        this.store.entries = this.store.entries.slice(0, MAX_ENTRIES);
        logger.info({ evicted: this.store.entries.length - MAX_ENTRIES }, 'Evicted old semantic memory entries');
      }

      // Persist to disk
      await this.saveVectors();

      logger.debug({ entryId: entry.id, source }, 'Added semantic memory');
    } catch (error) {
      logger.warn({ error }, 'Failed to add semantic memory');
    }
  }

  /**
   * Search for memories by semantic similarity
   */
  async search(
    query: string,
    options: {
      topK?: number;
      threshold?: number;
      source?: 'long-term' | 'daily' | 'user';
      senderJid?: string; // For privacy: only search this user's memories
    } = {}
  ): Promise<Array<{ text: string; score: number; source: string; metadata: VectorEntry['metadata'] }>> {
    if (!isEnabled('semanticMemory')) {
      return [];
    }

    const { topK = 5, threshold = SIMILARITY_THRESHOLD, source, senderJid } = options;

    try {
      const queryEmbedding = await this.generateEmbedding(query);

      // Calculate cosine similarity with all entries
      // IMPORTANT: Filter by senderJid for privacy isolation between users
      const scored = this.store.entries
        .filter(entry => !source || entry.source === source)
        .filter(entry => !senderJid || entry.metadata.senderJid === senderJid) // Privacy filter
        .map(entry => ({
          entry,
          score: this.cosineSimilarity(queryEmbedding, entry.embedding),
        }))
        .filter(({ score }) => score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      logger.debug(
        { query: query.slice(0, 50), results: scored.length },
        'Semantic search completed'
      );

      return scored.map(({ entry, score }) => ({
        text: entry.text,
        score: Math.round(score * 100) / 100,
        source: entry.source,
        metadata: entry.metadata,
      }));
    } catch (error) {
      logger.warn({ error, query: query.slice(0, 50) }, 'Semantic search failed');
      return [];
    }
  }

  /**
   * Find similar memories to a given text
   */
  async findSimilar(
    text: string,
    topK: number = 3
  ): Promise<Array<{ text: string; score: number }>> {
    const results = await this.search(text, { topK, threshold: 0.6 });
    return results.map(r => ({ text: r.text, score: r.score }));
  }

  /**
   * Index existing memories from storage
   */
  async indexExistingMemories(): Promise<void> {
    if (!isEnabled('semanticMemory')) return;

    logger.info('Indexing existing memories...');

    try {
      // Index long-term memories
      const longTerm = getLongTermMemory();
      const allMemories = await longTerm.getAllMemories();
      
      if (allMemories) {
        // Parse memory sections and index them
        const sections = this.parseMemorySections(allMemories);
        for (const section of sections) {
          await this.addMemory(section.content, 'long-term', {
            timestamp: new Date(),
            category: section.category,
          });
        }
      }

      // Index recent daily notes (last 7 days)
      // Note: With per-chat isolation, we index without chat filter during background indexing
      const dailyNotes = getDailyNotes();
      const recentDays = await dailyNotes.getRecentDays(undefined, 7);
      
      for (const [dateStr, notes] of recentDays) {
        const conversations = this.parseDailyNotes(notes);
        for (const conv of conversations) {
          await this.addMemory(conv.content, 'daily', {
            timestamp: new Date(dateStr),
            chatJid: conv.chatJid,
          });
        }
      }

      logger.info(
        { totalEntries: this.store.entries.length },
        'Finished indexing memories'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to index existing memories');
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Parse memory markdown into sections
   */
  private parseMemorySections(memories: string): Array<{ content: string; category?: string }> {
    const sections: Array<{ content: string; category?: string }> = [];
    
    // Split by ### (memory entries)
    const entries = memories.split('###').filter(e => e.trim());
    
    for (const entry of entries) {
      const lines = entry.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        const title = lines[0].trim();
        const content = lines.join(' ').slice(0, 500); // Limit length
        
        // Extract category if present
        const categoryMatch = entry.match(/\*\*Category\*\*:\s*(\w+)/);
        const category = categoryMatch ? categoryMatch[1] : undefined;
        
        sections.push({ content: `${title}: ${content}`, category });
      }
    }
    
    return sections;
  }

  /**
   * Parse daily notes into conversations
   */
  private parseDailyNotes(notes: string): Array<{ content: string; chatJid?: string }> {
    const conversations: Array<{ content: string; chatJid?: string }> = [];
    
    // Split by ## (conversation entries)
    const entries = notes.split('##').filter(e => e.trim());
    
    for (const entry of entries) {
      // Extract chat JID from HTML comment
      const jidMatch = entry.match(/chat:([^\s]+)/);
      const chatJid = jidMatch ? jidMatch[1] : undefined;
      
      // Get content lines
      const lines = entry.split('\n').filter(l => l.trim() && !l.includes('<!--'));
      if (lines.length > 0) {
        const content = lines.join(' ').slice(0, 500);
        conversations.push({ content, chatJid });
      }
    }
    
    return conversations;
  }

  /**
   * Load vectors from disk
   */
  private async loadVectors(): Promise<void> {
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    const config = getConfig();
    
    const filePath = join(config.memoryStoragePath, 'semantic-vectors.json');
    
    try {
      const data = await readFile(filePath, 'utf-8');
      const loaded: VectorStore = JSON.parse(data);
      
      // Validate version
      if (loaded.version === VECTOR_STORE_VERSION) {
        this.store = {
          ...loaded,
          entries: loaded.entries
            .map(e => {
              const ts = new Date(e.metadata.timestamp);
              return {
                ...e,
                metadata: {
                  ...e.metadata,
                  timestamp: isNaN(ts.getTime()) ? new Date() : ts,
                },
              };
            }),
        };
      } else {
        logger.warn({ version: loaded.version }, 'Vector store version mismatch, starting fresh');
      }
    } catch (error) {
      // File doesn't exist yet, start with empty store
      logger.info('No existing vector store found, starting fresh');
    }
  }

  /**
   * Save vectors to disk
   */
  private async saveVectors(): Promise<void> {
    const { writeFile, mkdir } = await import('fs/promises');
    const { join } = await import('path');
    const config = getConfig();
    
    const filePath = join(config.memoryStoragePath, 'semantic-vectors.json');
    
    try {
      await mkdir(config.memoryStoragePath, { recursive: true });
      await writeFile(filePath, JSON.stringify(this.store, null, 2), 'utf-8');
    } catch (error) {
      logger.error({ error }, 'Failed to save vectors');
    }
  }

  /**
   * Get stats about the semantic memory
   */
  getStats(): { totalEntries: number; lastUpdated: Date } {
    return {
      totalEntries: this.store.entries.length,
      lastUpdated: this.store.lastUpdated,
    };
  }
}

// Singleton instance
let instance: SemanticMemory | null = null;

export function getSemanticMemory(): SemanticMemory {
  if (!instance) {
    instance = new SemanticMemory();
  }
  return instance;
}

// Export types
export type { VectorEntry };
