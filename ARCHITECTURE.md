# Buddy - WhatsApp AI Assistant

## Architecture Documentation

*Updated: 2026-02-19 | Version: 4.0 | Features: 15 Implemented*

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Project Structure](#project-structure)
4. [Core Components](#core-components)
5. [Feature System](#feature-system)
6. [Data Flow](#data-flow)
7. [Memory System](#memory-system)
8. [Privacy & Isolation](#privacy--isolation)
9. [Features](#features)
10. [API Integrations](#api-integrations)
11. [Configuration Guide](#configuration-guide)
12. [Troubleshooting](#troubleshooting)

---

## Overview

Buddy is an AI-powered WhatsApp assistant with **15 advanced features**, built using:

- **Baileys** - WhatsApp Web API library (unofficial)
- **Claude API** - Anthropic's LLM for chat, reasoning, and vision
- **Gemini API** - Google's Gemini 2.0 Flash for document analysis
- **OpenAI API** - Whisper (STT), TTS, DALL-E 3, Embeddings
- **Serper API** - Web search for research-enriched responses
- **ffmpeg** - Video frame extraction

### Key Capabilities (v4.0)

| Phase | Features |
|-------|----------|
| **Core** | Text Chat, Voice Notes, Image Analysis/Generation, Document Analysis/Generation |
| **Phase 1** | URL Summarization, Sticker Creation, Reminders, Message Chunking |
| **Phase 2** | Intent Classification, Polls, Semantic Memory Search |
| **Phase 3** | Auto Memory Extraction, Conversation Summaries, Multi-Image Analysis |
| **Phase 4** | Video Analysis, Code Execution, Calendar Integration, Group Admin, Group Knowledge Base |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         WhatsApp Network                             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Baileys WebSocket Client                        │
│                    (src/core/whatsapp.ts)                           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Event Handler                                 │
│                   (src/core/event-handler.ts)                       │
│  • Filter messages (skip self, status broadcasts)                   │
│  • Rate limiting                                                     │
│  • Group moderation (spam, links, forwards)                         │
│  • Group etiquette evaluation                                        │
│  • Message chunking for long responses                               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Message Router                                 │
│                  (src/core/message-router.ts)                       │
│  • Intent Classification (15 intent types)                          │
│  • Route to appropriate handler                                      │
│  • Feature flag checking                                             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐       ┌───────────────────┐       ┌───────────────┐
│ Core Handlers │       │  Media Handlers   │       │ Advanced      │
├───────────────┤       ├───────────────────┤       ├───────────────┤
│ • text.ts     │       │ • voice.ts        │       │ • video.ts    │
│ • search.ts   │       │ • image.ts        │       │ • code-exec   │
│ • generate.ts │       │ • document.ts     │       │ • calendar.ts │
│ • multi-image │       │                   │       │ • group-admin │
│ • summary.ts  │       │                   │       │ • group-kb.ts │
└───────────────┘       └───────────────────┘       └───────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         LLM Layer                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Claude    │  │   OpenAI    │  │   Gemini    │                 │
│  │ Chat/Vision │  │Whisper/TTS  │  │ Doc Analysis│                 │
│  │ Reasoning   │  │ DALL-E 3    │  │ Doc Content │                 │
│  │             │  │ Embeddings  │  │             │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Memory System                                  │
│  • Daily Notes (buddy-memory/daily/) - PER-CHAT ISOLATED            │
│  • Long-term Memory (buddy-memory/users/) - PER-USER ISOLATED       │
│  • Semantic Vectors (buddy-memory/semantic-vectors.json)            │
│  • Reminders (buddy-memory/reminders.json)                          │
│  • Group Configs (buddy-memory/group-admin/)                        │
│  • Group KB (buddy-memory/group-kb/)                                │
│  • Calendar (buddy-memory/calendar/)                                │
│  • Summaries (buddy-memory/summaries/)                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
buddy/
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── .env                      # API keys and configuration
├── .env.example              # Template for environment variables
├── check-features.js         # Feature flag verification script
├── USAGE-GUIDE.md            # User-facing feature documentation
├── FEATURES-PROGRESS.md      # Implementation status tracking
├── IMPLEMENTATION-STRATEGY.md # Development strategy
├── Kimi-Enhancement-ideas.md  # Future feature ideas
│
├── persona/                  # Personality configuration
│   ├── SOUL.md              # Core personality
│   ├── IDENTITY.md          # Name, style
│   ├── AGENTS.md            # Behavioral rules
│   └── loader.ts            # Persona loader
│
├── src/
│   ├── index.ts             # Application entry
│   ├── buddy.ts             # Main orchestrator
│   │
│   ├── config/
│   │   ├── schema.ts        # Zod validation schemas
│   │   └── index.ts         # Config loader + feature flags
│   │
│   ├── core/
│   │   ├── whatsapp.ts      # Baileys socket wrapper
│   │   ├── event-handler.ts # Message processor
│   │   ├── message-router.ts# Message routing
│   │   └── intent-classifier.ts # AI intent detection
│   │
│   ├── llm/
│   │   ├── types.ts         # TypeScript interfaces
│   │   ├── claude.ts        # Anthropic Claude
│   │   ├── gemini.ts        # Google Gemini
│   │   ├── openai.ts        # OpenAI (Whisper, TTS, DALL-E, Embeddings)
│   │   └── index.ts         # Provider factory
│   │
│   ├── memory/
│   │   ├── storage.ts       # File persistence
│   │   ├── daily-notes.ts   # Conversation logs (PER-CHAT ISOLATED)
│   │   ├── long-term.ts     # Curated memories (PER-USER ISOLATED)
│   │   ├── context-builder.ts# LLM context builder
│   │   ├── semantic.ts      # Vector embeddings search
│   │   ├── auto-extract.ts  # Auto memory extraction
│   │   ├── conversation-summarizer.ts # Chat summaries
│   │   └── index.ts         # Memory orchestrator
│   │
│   ├── handlers/
│   │   ├── text.ts          # Text messages
│   │   ├── voice.ts         # Voice notes
│   │   ├── image.ts         # Image analysis
│   │   ├── multi-image.ts   # Multi-image analysis
│   │   ├── document.ts      # Document analysis
│   │   ├── video.ts         # Video analysis
│   │   ├── generate.ts      # Image/doc generation
│   │   ├── search.ts        # Web search
│   │   ├── url-summarizer.ts# URL content summary
│   │   ├── sticker.ts       # Sticker creation
│   │   ├── poll.ts          # Poll creation/voting
│   │   ├── reminder.ts      # Reminder management
│   │   ├── calendar.ts      # Calendar integration
│   │   ├── code-execution.ts# Python/JS code execution
│   │   ├── semantic-search.ts # Memory search commands
│   │   ├── summary.ts       # Conversation summary commands
│   │   ├── group-admin.ts   # Group admin controls
│   │   └── group-kb.ts      # Group knowledge base
│   │
│   ├── reminders/
│   │   ├── storage.ts       # Reminder persistence
│   │   ├── time-parser.ts   # Natural language time
│   │   └── scheduler.ts     # Background scheduler (node-cron)
│   │
│   ├── tools/
│   │   ├── url-fetcher.ts   # URL content extraction
│   │   └── web-search.ts    # Serper.dev search
│   │
│   ├── group/
│   │   ├── etiquette.ts     # Group response logic
│   │   └── mention-parser.ts# @mention extraction
│   │
│   ├── utils/
│   │   ├── retry.ts         # Exponential backoff
│   │   ├── document-extract.ts # Text extraction
│   │   └── message-chunker.ts # Message splitting
│   │
│   └── safety/
│       ├── privacy.ts       # PII sanitization
│       ├── rate-limiter.ts  # Rate limiting
│       └── whitelist.ts     # Contact whitelist
│
├── buddy-memory/            # Runtime storage
│   ├── daily/              # Daily conversation logs (per-chat)
│   ├── users/              # Per-user memories
│   ├── group-admin/        # Group admin configs
│   ├── group-kb/           # Group knowledge bases
│   ├── calendar/           # Calendar events
│   ├── summaries/          # Conversation summaries
│   ├── reminders.json      # Active reminders
│   ├── semantic-vectors.json # Vector embeddings
│   └── MEMORY.md           # Long-term memories (legacy)
│
├── auth/                    # WhatsApp auth
│   └── baileys_auth_info/  # Session credentials
│
└── dist/                    # Compiled JavaScript
```

---

## Core Components

### 1. WhatsApp Client (`src/core/whatsapp.ts`)

**Responsibilities:**
- QR code display for authentication
- Connection management with auto-reconnection
- Session persistence and recovery
- Presence updates (typing, recording)
- Group participant events (for welcome messages)

**Key Features:**
- Auto-reconnect on disconnect
- Clear auth and show QR on logout (401)
- Exponential backoff with jitter

### 2. Event Handler (`src/core/event-handler.ts`)

**Responsibilities:**
- Filter self-messages and broadcasts
- Rate limiting per sender
- Group moderation (spam, links, forwards)
- Group etiquette evaluation
- Message chunking for long responses
- Response delivery

**NEW:** Group participant updates for welcome messages

### 3. Intent Classifier (`src/core/intent-classifier.ts`)

Detects user intent from 15 categories:
- `question`, `task_request`, `image_generation`
- `document_creation`, `url_summary`, `reminder`
- `search`, `code_help`, `greeting`, etc.

Uses pattern matching (fast) with AI fallback (accurate).

### 4. Message Router (`src/core/message-router.ts`)

Enhanced routing with feature flag checks:

```
Message → Intent Classification → Feature Flag Check → Handler
              │                           │
              ▼                           ▼
        Pattern Match              Enabled? → Route
        AI Classification          Disabled → Skip
```

**Handlers:**
| Handler | Feature | Description |
|---------|---------|-------------|
| `url-summarizer.ts` | URL Summarization | Fetch and summarize web links |
| `sticker.ts` | Sticker Creation | Convert images to WhatsApp stickers |
| `poll.ts` | Poll Creator | Interactive polls with voting |
| `reminder.ts` | Reminder System | Schedule and send reminders |
| `semantic-search.ts` | Semantic Memory | Search memories by meaning |
| `video.ts` | Video Analysis | Extract frames, analyze with Claude |
| `code-execution.ts` | Code Execution | Run Python/JavaScript safely |
| `calendar.ts` | Calendar Integration | Schedule events, reminders |
| `group-admin.ts` | Group Admin | Auto-moderation, welcome messages |
| `group-kb.ts` | Group Knowledge Base | FAQs, rules, per-group info |
| `summary.ts` | Conversation Summaries | `/summary` command |

---

## Feature System

### Feature Flags Architecture

All features are behind feature flags for safe deployment:

```typescript
// src/config/schema.ts
export const FeatureFlagsSchema = z.object({
  // Phase 1: Safe Foundations
  urlSummarization: z.boolean().default(false),
  messageChunking: z.boolean().default(false),
  stickerCreation: z.boolean().default(false),
  reminderSystem: z.boolean().default(false),
  
  // Phase 2: Core Enhancements
  intentClassification: z.boolean().default(false),
  pollCreator: z.boolean().default(false),
  semanticMemory: z.boolean().default(false),
  
  // Phase 3: Memory & Intelligence
  autoMemoryExtraction: z.boolean().default(false),
  conversationSummaries: z.boolean().default(false),
  multiImageAnalysis: z.boolean().default(false),
  
  // Phase 4: Advanced Features
  videoAnalysis: z.boolean().default(false),
  codeExecution: z.boolean().default(false),
  calendarIntegration: z.boolean().default(false),
  groupAdminControls: z.boolean().default(false),
  groupKnowledgeBase: z.boolean().default(false),
});
```

### Using Feature Flags

```typescript
// In any handler
import { isEnabled } from '../config/index.js';

if (!isEnabled('urlSummarization')) {
  return null; // Feature disabled
}
```

---

## Memory System

### Privacy-First Memory Architecture

**CRITICAL:** Each user and each group has **completely isolated memory**. Memories from one user/group NEVER leak to another.

```
┌─────────────────────────────────────────┐
│         Memory Isolation                │
├─────────────────────────────────────────┤
│  Per-User Memories                      │
│  • Each phone number → isolated storage │
│  • User A cannot see User B's memories  │
│  • Files: users/{userJid}.md            │
├─────────────────────────────────────────┤
│  Per-Group Memories                     │
│  • Each group → isolated storage        │
│  • Daily notes per group                │
│  • Files: daily/{groupJid}_{date}.md    │
├─────────────────────────────────────────┤
│  Per-Group Knowledge Base               │
│  • FAQs, rules, topics per group        │
│  • Files: group-kb/{groupJid}.json      │
├─────────────────────────────────────────┤
│  Per-Group Admin Config                 │
│  • Moderation, welcome messages         │
│  • Response rate settings               │
│  • Files: group-admin/{groupJid}.json   │
└─────────────────────────────────────────┘
```

### Memory Layers

```
┌─────────────────────────────────────────┐
│           Memory Layers                 │
├─────────────────────────────────────────┤
│  Semantic Memory                        │
│  • Vector embeddings (OpenAI)           │
│  • Meaning-based search                 │
│  • Isolated per user                    │
│  • File: semantic-vectors.json          │
├─────────────────────────────────────────┤
│  Long-term Memory                       │
│  • Important facts (auto-extracted)     │
│  • User preferences                     │
│  • Files: users/{jid}.md                │
├─────────────────────────────────────────┤
│  Daily Notes                            │
│  • Conversation history                 │
│  • Recent context                       │
│  • Files: daily/{chatJid}_{date}.md     │
├─────────────────────────────────────────┤
│  Reminders                              │
│  • Scheduled tasks                      │
│  • Recurring events                     │
│  • File: reminders.json                 │
├─────────────────────────────────────────┤
│  Conversation Summaries                 │
│  • Auto-generated summaries             │
│  • Triggered at 50+ messages            │
│  • Files: summaries/{chatJid}_{date}.json│
├─────────────────────────────────────────┤
│  Calendar Events                        │
│  • Scheduled events                     │
│  • 15-min reminder notifications        │
│  • Files: calendar/calendar.json        │
└─────────────────────────────────────────┘
```

---

## Privacy & Isolation

### User Isolation

- **Daily Notes**: Stored per chat (`{chatJid}_{date}.md`)
- **Long-term Memory**: Stored per user (`{userJid}.md`)
- **Semantic Search**: Filtered by sender JID
- **Auto-extracted Memories**: Tagged with user JID

### Group Isolation

- **Group A** cannot access **Group B's** memories
- **Welcome messages** per group
- **Knowledge base** per group (FAQs, rules)
- **Admin settings** per group (moderation, response rate)
- **Conversation summaries** per group

### Response Rate Configuration

Group admins can control how chatty Buddy is:

```
/response rate 0    # Only respond when @mentioned
/response rate 30   # Default: 30% of messages
/response rate 50   # More chatty
/response rate 100  # Respond to everything
```

---

## Features

### Phase 1: Safe Foundations

#### 1. URL Summarization
**Files:** `src/handlers/url-summarizer.ts`, `src/tools/url-fetcher.ts`

Fetches webpage content and generates AI summary.

**Usage:**
```
"Summarize this: https://example.com/article"
```

#### 2. Sticker Creation
**Files:** `src/handlers/sticker.ts`

Converts images to WhatsApp sticker format (512x512 WebP).

**Dependencies:** `sharp`

**Usage:**
```
[Send image with caption "sticker"]
```

#### 3. Reminder System
**Files:** `src/handlers/reminder.ts`, `src/reminders/`

Schedules reminders with natural language time parsing.

**Usage:**
```
"Remind me to call mom in 30 minutes"
"Remind me every day at 8am to drink water"
```

**Dependencies:** `node-cron`

#### 4. Message Chunking
**Files:** `src/utils/message-chunker.ts`

Auto-splits long responses into multiple messages.

---

### Phase 2: Core Enhancements

#### 5. Intent Classification
**Files:** `src/core/intent-classifier.ts`

Auto-detects user intent for smarter routing.

#### 6. Poll Creator
**Files:** `src/handlers/poll.ts`

Creates interactive polls with vote tracking.

**Usage:**
```
"Create a poll: Best language? Options: Python, JavaScript, Rust"
Vote: /1, /2, /3
```

#### 7. Semantic Memory Search
**Files:** `src/memory/semantic.ts`, `src/handlers/semantic-search.ts`

Uses OpenAI embeddings for meaning-based memory search.

**Usage:**
```
"Search memories: what did John say about work?"
```

---

### Phase 3: Memory & Intelligence

#### 8. Auto Memory Extraction
**Files:** `src/memory/auto-extract.ts`

Automatically extracts important facts from conversations.

**Usage:** Automatic (no command needed)

#### 9. Conversation Summaries
**Files:** `src/memory/conversation-summarizer.ts`, `src/handlers/summary.ts`

Summarizes long conversations (50+ messages).

**Usage:**
```
/summary
/summary all
```

#### 10. Multi-Image Analysis
**Files:** `src/handlers/multi-image.ts`

Analyzes multiple images at once (albums).

**Usage:**
```
[Send 3-4 images as album]
"Compare these apartments"
```

---

### Phase 4: Advanced Features

#### 11. Video Analysis
**Files:** `src/handlers/video.ts`

Extracts keyframes from videos and analyzes with Claude Vision.

**Requirements:** ffmpeg installed

**Usage:**
```
[Send any video]
```

#### 12. Code Execution
**Files:** `src/handlers/code-execution.ts`

Safely executes Python and JavaScript code.

**Security:** 10s timeout, blocks dangerous operations

**Usage:**
```
Run python:
def factorial(n):
    return 1 if n <= 1 else n * factorial(n-1)
print(factorial(5))
```

#### 13. Calendar Integration
**Files:** `src/handlers/calendar.ts`

Schedules events with natural language parsing.

**Usage:**
```
"Schedule: Team meeting tomorrow at 3pm"
/calendar
/calendar today
```

#### 14. Group Admin Controls
**Files:** `src/handlers/group-admin.ts`

Auto-moderation and group management.

**Features:**
- Spam detection
- Link/forward blocking
- Welcome messages
- Configurable response rate

**Usage:**
```
/admin help
/set welcome Hello @user!
/response rate 50
```

#### 15. Group Knowledge Base
**Files:** `src/handlers/group-kb.ts`

Per-group FAQs, rules, and information.

**Usage:**
```
/faq add Q: How to join? A: Message admin
/set rules Be respectful, no spam
/what are the group rules?
```

---

## API Integrations

### OpenAI

| Feature | API | Model |
|---------|-----|-------|
| Speech-to-Text | Whisper | whisper-1 |
| Text-to-Speech | TTS | tts-1 |
| Image Generation | DALL-E | dall-e-3 |
| Embeddings | Embeddings | text-embedding-3-small |

### Claude (Anthropic)

| Feature | Model |
|---------|-------|
| Chat | claude-sonnet-4-20250514 |
| Vision | claude-sonnet-4-20250514 |
| Reasoning | claude-sonnet-4-20250514 |

### Gemini (Google)

| Feature | Model |
|---------|-------|
| Document Analysis | gemini-2.0-flash |
| Document Generation | gemini-2.0-flash |

### External Tools

| Package | Purpose | Feature |
|---------|---------|---------|
| `sharp` | Image processing | Sticker Creation |
| `node-cron` | Background jobs | Reminder System |
| `ffmpeg` | Video processing | Video Analysis |

---

## Configuration Guide

### First-Time Setup (Web Wizard)

Buddy includes an **interactive web wizard** for easy first-time configuration:

```bash
npm run build
npm start
```

This automatically opens a browser wizard that guides you through:
1. **API Key Configuration** - Enter Anthropic, OpenAI, Gemini, and Serper keys
2. **Feature Selection** - Toggle all 15 features on/off
3. **Persona Customization** - Set name, emoji, personality, language
4. **QR Code Connection** - Scan QR code directly in the browser

The wizard saves all configuration to `.env` automatically.

**To reconfigure later:**
```bash
npm run setup
# or
npm start -- --setup
```

### Manual Configuration

Alternatively, you can manually edit `.env`:

```env
# API Keys (Required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Optional API Keys
GEMINI_API_KEY=          # Document & video analysis
SERPER_API_KEY=          # Web search

# Feature Flags (Enable all 15 features)
FF_URL_SUMMARIZATION=true
FF_MESSAGE_CHUNKING=true
FF_STICKER_CREATION=true
FF_REMINDER_SYSTEM=true
FF_INTENT_CLASSIFICATION=true
FF_POLL_CREATOR=true
FF_SEMANTIC_MEMORY=true
FF_AUTO_MEMORY_EXTRACTION=true
FF_CONVERSATION_SUMMARIES=true
FF_MULTI_IMAGE_ANALYSIS=true
FF_VIDEO_ANALYSIS=true
FF_CODE_EXECUTION=true
FF_CALENDAR_INTEGRATION=true
FF_GROUP_ADMIN_CONTROLS=true
FF_GROUP_KNOWLEDGE_BASE=true
```

### Optional Environment Variables

```env
# Gemini (Document analysis)
GEMINI_API_KEY=

# Serper (Web search)
SERPER_API_KEY=

# Customization
BUDDY_NAME=Buddy
BUDDY_EMOJI=🤖

# Group settings
GROUP_RESPONSE_THRESHOLD=0.6
GROUP_MIN_MESSAGE_LENGTH=10

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_MESSAGES=20

# Memory
MEMORY_RETENTION_DAYS=30
```

---

## Troubleshooting

### Feature Not Working

1. Check feature flag is enabled:
   ```bash
   npm run check
   ```

2. Check logs for initialization:
   ```
   [reminder-scheduler]: Reminder scheduler started
   [semantic-memory]: Semantic memory initialized
   ```

### Video Analysis Fails

Install ffmpeg:
```bash
# Windows
winget install Gyan.FFmpeg

# Mac
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

### Sticker Creation Fails

```bash
npm install sharp
```

### Reminders Not Sending

- Check `FF_REMINDER_SYSTEM=true`
- Check logs for scheduler initialization
- Use `/testreminder` to test immediately

### Semantic Search Returns Nothing

Run indexing first:
```
/semantic index
```

### Code Execution Not Working

Ensure Python and Node.js are installed:
```bash
python --version
node --version
```

---

## Version History

| Version | Features | Date |
|---------|----------|------|
| v1.0 | Core AI (chat, voice, images, docs) | Original |
| v2.0 | + URL Summaries, Stickers, Polls, Reminders, Semantic Search | Feb 2026 |
| v3.0 | + Auto Memory, Conversation Summaries, Multi-Image Analysis | Feb 2026 |
| **v4.0** | **+ Video Analysis, Code Execution, Calendar, Group Admin, Group KB** | **Feb 2026** |

---

*Documentation updated for v4.0 release - 15 features implemented*
