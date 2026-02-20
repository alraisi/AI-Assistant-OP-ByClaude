# Buddy - WhatsApp AI Assistant v4.0

An intelligent WhatsApp assistant powered by Claude AI with **15 advanced features** including voice, vision, video analysis, code execution, calendar integration, group management, URL summarization, stickers, polls, reminders, semantic memory search, auto memory extraction, conversation summaries, and multi-image analysis.

---

## ✨ What's New in v4.0

Buddy now includes **14 powerful new features** (plus the original AI chat):

### Phase 1: Safe Foundations
- 🔗 **URL Summarization** - Summarize any web link instantly
- 🎨 **Sticker Creation** - Convert images to WhatsApp stickers
- ⏰ **Reminder System** - Schedule reminders with natural language
- 📝 **Message Chunking** - Auto-split long responses

### Phase 2: Core Enhancements  
- 🧠 **Semantic Memory Search** - Find memories by meaning, not just keywords
- 📊 **Poll Creator** - Create interactive polls with voting
- 🎯 **Intent Classification** - AI automatically understands what you want

### Phase 3: Memory & Intelligence
- 🧠 **Auto Memory Extraction** - AI extracts important facts automatically
- 📝 **Conversation Summaries** - Summarize long conversations automatically
- 🖼️ **Multi-Image Analysis** - Analyze multiple images at once

### Phase 4: Advanced Features 🆕
- 🎥 **Video Analysis** - Extract frames and analyze videos with AI
- 💻 **Code Execution** - Run Python and JavaScript code safely
- 📅 **Calendar Integration** - Schedule events and get reminders
- 👮 **Group Admin Controls** - Auto-moderation, welcome messages, spam detection
- 📚 **Group Knowledge Base** - Per-group FAQs, rules, and information

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/alraisi/AI-Assistant-OP.git
cd AI-Assistant-OP
npm install
```

### 2. First-Time Setup (Web Wizard)

Buddy now includes an **interactive web wizard** for easy first-time setup:

```bash
npm run build
npm start
```

This will automatically:
1. 🌐 Open a setup wizard in your browser
2. 🔑 Ask for your API keys (Anthropic, OpenAI, optional Gemini/Serper)
3. 🎯 Let you choose which features to enable (15 features available)
4. 🎭 Customize your bot's personality (name, emoji, style)
5. 📱 Display QR code in browser to connect WhatsApp

The wizard saves all configuration to `.env` automatically!

### 3. Manual Configuration (Alternative)

If you prefer manual setup, copy `.env.example` to `.env` and edit:

```bash
cp .env.example .env
```

```env
# Required API Keys
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
OPENAI_API_KEY=sk-your-key-here

# Optional but recommended
GEMINI_API_KEY=AIzaSy...      # Enables document & video analysis
SERPER_API_KEY=...            # Enables web search

# Enable All 15 Features (set to 'true' to enable)
FF_URL_SUMMARIZATION=true
FF_STICKER_CREATION=true
FF_REMINDER_SYSTEM=true
FF_MESSAGE_CHUNKING=true
FF_SEMANTIC_MEMORY=true
FF_POLL_CREATOR=true
FF_INTENT_CLASSIFICATION=true
FF_AUTO_MEMORY_EXTRACTION=true
FF_CONVERSATION_SUMMARIES=true
FF_MULTI_IMAGE_ANALYSIS=true
FF_VIDEO_ANALYSIS=true
FF_CODE_EXECUTION=true
FF_CALENDAR_INTEGRATION=true
FF_GROUP_ADMIN_CONTROLS=true
FF_GROUP_KNOWLEDGE_BASE=true
```

### 4. Run Buddy

```bash
npm start
```

**First run:** Opens web wizard for configuration  
**Subsequent runs:** Starts directly with saved settings

**To reconfigure:**
```bash
npm start -- --setup
# or
npm run setup
```

### 5. Additional Dependencies (Optional)

```bash
# For sticker creation
npm install sharp

# For reminders (usually already installed)
npm install node-cron

# Install ffmpeg for video analysis
# Windows: winget install Gyan.FFmpeg
# Mac: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
```

---

## 📋 Feature Usage Guide

### Phase 4 Features (New!)

#### 🎥 Video Analysis
Extract keyframes from videos and analyze with Claude Vision.

```
[Send any video]
Bot: 🎥 *Video Analysis* (15s)
     
     The video shows a cat playing with a ball...
```

**Requirements:** ffmpeg installed  
**Enable:** `FF_VIDEO_ANALYSIS=true`

---

#### 💻 Code Execution
Safely execute Python and JavaScript code.

```
Run python:
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n-1)

print(f"5! = {factorial(5)}")
```

**Security:** 10s timeout, blocks dangerous operations  
**Enable:** `FF_CODE_EXECUTION=true`

---

#### 📅 Calendar Integration
Schedule events and manage your calendar.

```
You: Schedule: Team meeting tomorrow at 3pm
Bot: ✅ Event Scheduled!
     
     *Team meeting*
     📅 Tomorrow at 3:00 PM

Commands:
/calendar              # Show upcoming events
/calendar today        # Today's events
/calendar week         # This week's events
/delete event 1        # Delete event by number
```

**Enable:** `FF_CALENDAR_INTEGRATION=true`

---

#### 👮 Group Admin Controls
Auto-moderation and group management.

**Features:**
- Spam detection (auto-warn spammers)
- Link blocking (for non-admins)
- Forward blocking
- Welcome messages for new members
- Configurable response rate

```
/admin help              # Show admin commands
/set welcome [message]   # Set welcome message
/enable spam            # Enable spam detection
/response rate 50       # Set response to 50%
/group info             # Show group stats
```

**Enable:** `FF_GROUP_ADMIN_CONTROLS=true`

---

#### 📚 Group Knowledge Base
Per-group FAQs, rules, and information.

```
/faq add Q: How to join? A: Message admin
/faqs                    # List all FAQs
/kb add "Meeting Time": Tuesdays 3pm
/set rules Be respectful, no spam
/what are the rules?
```

**Enable:** `FF_GROUP_KNOWLEDGE_BASE=true`

---

### Phase 1-3 Features

#### 🔗 URL Summarization
Summarize any web article instantly.

```
You: Summarize this: https://example.com/article
Bot: 📄 *Article Title*
     • Key point 1
     • Key point 2
     • Key point 3
```

**Enable:** `FF_URL_SUMMARIZATION=true`

---

#### 🎨 Sticker Creation
Convert images to WhatsApp stickers.

```
You: [Send image with caption "sticker"]
Bot: [Sends sticker]
```

Or reply to an image with "sticker".

**Enable:** `FF_STICKER_CREATION=true`  
**Requires:** `npm install sharp`

---

#### ⏰ Reminder System
Schedule reminders with natural language.

```
You: Remind me to call mom in 30 minutes
Bot: ✅ Reminder set for 2:30 PM

You: Remind me every day at 8am to drink water
Bot: ✅ Daily reminder set

Commands:
/myreminders              # List all reminders
/cancel reminder <id>     # Cancel a reminder
/testreminder             # Test (fires in 10 sec)
```

When reminder fires:
```
Bot: ⏰ Reminder: call mom
     Reply "done" or "snooze 10 minutes"
```

**Enable:** `FF_REMINDER_SYSTEM=true`  
**Requires:** `npm install node-cron`

---

#### 🧠 Semantic Memory Search
Search your memories by meaning, not just keywords.

```
You: Search memories: what did John say about work?
Bot: 🔍 *Memories about "work"*

1. 🟢 John mentioned he got promoted
   Match: 85%

2. 🟡 We discussed the project timeline
   Match: 72%

Commands:
/semantic stats    # Show indexed memory count
/semantic index    # Re-index all memories
```

**Enable:** `FF_SEMANTIC_MEMORY=true`

---

#### 📝 Conversation Summaries
Summarize long conversations automatically.

```
/summary          # Get latest summary for this chat
/summary all      # List all summaries
```

Created automatically when conversation exceeds 50 messages.

**Enable:** `FF_CONVERSATION_SUMMARIES=true`

---

#### 🖼️ Multi-Image Analysis
Analyze multiple images at once.

```
[Send 3-4 images as album]
You: Compare these apartments
Bot: Comparing these three apartments:
    1. First has largest living room
    2. Second has best lighting
    3. Third is most affordable
```

**Enable:** `FF_MULTI_IMAGE_ANALYSIS=true`

---

#### 📊 Poll Creator
Create interactive polls.

```
You: Create a poll: Best programming language?
     Options: Python, JavaScript, Rust

Bot: 📊 Best programming language?
     1. Python       ░░░░░░░░░░ 0 votes
     2. JavaScript   ░░░░░░░░░░ 0 votes
     3. Rust         ░░░░░░░░░░ 0 votes
     
     Vote with: /1, /2, /3

You: /1
Bot: ✅ Vote recorded!

Commands:
/poll status    # Check current results
/end poll       # End the poll
```

**Enable:** `FF_POLL_CREATOR=true`

---

## 📚 All Features

| Phase | Feature | Description | Feature Flag |
|-------|---------|-------------|--------------|
| **Core** | Chat | Conversational AI | Core |
| | Voice Notes | Send voice, receive voice | Core |
| | Image Analysis | Analyze images | Core |
| | Image Generation | DALL-E 3 | Core |
| | Document Analysis | PDF, Word, Excel, PowerPoint | Core |
| | Document Creation | Generate documents | Core |
| | Web Search | Search the web | Core |
| **P1** | URL Summarization | Summarize web links | `FF_URL_SUMMARIZATION` |
| | Sticker Creation | Images → Stickers | `FF_STICKER_CREATION` |
| | Reminder System | Schedule reminders | `FF_REMINDER_SYSTEM` |
| | Message Chunking | Split long messages | `FF_MESSAGE_CHUNKING` |
| **P2** | Intent Classification | Auto-detect intent | `FF_INTENT_CLASSIFICATION` |
| | Poll Creator | Interactive polls | `FF_POLL_CREATOR` |
| | Semantic Memory | Search by meaning | `FF_SEMANTIC_MEMORY` |
| **P3** | Auto Memory Extraction | Auto extract facts | `FF_AUTO_MEMORY_EXTRACTION` |
| | Conversation Summaries | Summarize chats | `FF_CONVERSATION_SUMMARIES` |
| | Multi-Image Analysis | Multiple images | `FF_MULTI_IMAGE_ANALYSIS` |
| **P4** | Video Analysis | Analyze videos | `FF_VIDEO_ANALYSIS` |
| | Code Execution | Run Python/JS | `FF_CODE_EXECUTION` |
| | Calendar Integration | Schedule events | `FF_CALENDAR_INTEGRATION` |
| | Group Admin Controls | Auto-moderation | `FF_GROUP_ADMIN_CONTROLS` |
| | Group Knowledge Base | Group FAQs | `FF_GROUP_KNOWLEDGE_BASE` |

---

## 🔒 Privacy & Security

### User Memory Isolation
- **Each user** has completely isolated memory
- User A cannot see User B's memories
- Daily notes stored per chat
- Long-term memory stored per user
- Semantic search filtered by user

### Group Isolation
- **Each group** has isolated memory
- Group A cannot access Group B's memories
- Per-group knowledge base (FAQs, rules)
- Per-group admin settings
- Per-group conversation summaries

### Code Execution Security
- 10 second timeout
- Blocks dangerous operations (file deletion, system calls)
- Sandboxed execution
- Max 5000 characters per code block

---

## 🛠️ Commands

```bash
npm run build       # Compile TypeScript
npm run check       # Check which features are enabled
npm start           # Run Buddy (runs check + start)
npm run dev         # Build and run once
npm run watch       # Build in watch mode
```

---

## ⚙️ Configuration

### Feature Flags

All features are behind feature flags for safe deployment:

```env
# Phase 1: Safe Foundations (Low Risk)
FF_URL_SUMMARIZATION=true
FF_MESSAGE_CHUNKING=true
FF_REMINDER_SYSTEM=true
FF_STICKER_CREATION=true

# Phase 2: Core Enhancements (Medium Risk)
FF_INTENT_CLASSIFICATION=true
FF_POLL_CREATOR=true
FF_SEMANTIC_MEMORY=true

# Phase 3: Memory & Intelligence
FF_AUTO_MEMORY_EXTRACTION=true
FF_CONVERSATION_SUMMARIES=true
FF_MULTI_IMAGE_ANALYSIS=true

# Phase 4: Advanced Features
FF_VIDEO_ANALYSIS=true
FF_CODE_EXECUTION=true
FF_CALENDAR_INTEGRATION=true
FF_GROUP_ADMIN_CONTROLS=true
FF_GROUP_KNOWLEDGE_BASE=true
```

### Check Features

Run before starting to verify features:

```bash
npm run check
```

Output:
```
========================================
     BUDDY v4.0 Feature Check
========================================

📦 Phase 1: Safe Foundations
----------------------------------------
  ✅ ON  - URL Summarization
  ✅ ON  - Message Chunking
  ✅ ON  - Sticker Creation
  ✅ ON  - Reminder System
  (4/4 enabled)

🧠 Phase 2: Core Enhancements
----------------------------------------
  ✅ ON  - Intent Classification
  ✅ ON  - Poll Creator
  ✅ ON  - Semantic Memory Search
  (3/3 enabled)

🚀 Phase 3: Memory & Intelligence
----------------------------------------
  ✅ ON  - Auto Memory Extraction
  ✅ ON  - Conversation Summaries
  ✅ ON  - Multi-Image Analysis
  (3/3 enabled)

🔥 Phase 4: Advanced Features
----------------------------------------
  ✅ ON  - Video Analysis
  ✅ ON  - Code Execution
  ✅ ON  - Calendar Integration
  ✅ ON  - Group Admin Controls
  ✅ ON  - Group Knowledge Base
  (5/5 enabled)

========================================
   15/15 Features Enabled
========================================
```

---

## 🎭 Customization

Edit files in `persona/` folder:
- `SOUL.md` - Personality and values
- `IDENTITY.md` - Name and style
- `AGENTS.md` - Behavioral rules

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Full technical documentation |
| [USAGE-GUIDE.md](./USAGE-GUIDE.md) | Detailed usage examples |
| [FEATURES-PROGRESS.md](./FEATURES-PROGRESS.md) | Implementation status |
| [IMPLEMENTATION-STRATEGY.md](./IMPLEMENTATION-STRATEGY.md) | Development strategy |

---

## 🐛 Troubleshooting

### Feature Not Working

1. Check feature flag is enabled:
   ```bash
   npm run check
   ```

2. Verify the feature flag in `.env`:
   ```bash
   grep "^FF_" .env
   ```

### Video Analysis Not Working

Install ffmpeg:
```bash
# Windows
winget install Gyan.FFmpeg

# Mac
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

### Reminder Not Sending

- Check scheduler initialized in logs ("Reminder scheduler started")
- Use `/testreminder` to test immediately
- Verify `node-cron` is installed

### Sticker Not Creating

```bash
npm install sharp
```

### Session Expired

```bash
rm -rf auth/baileys_auth_info
npm start
```

---

## 🏗️ Tech Stack

- **Baileys** - WhatsApp Web API
- **Claude API** - Anthropic's LLM (chat, vision, reasoning)
- **OpenAI API** - Whisper (STT), TTS, DALL-E 3, Embeddings
- **Gemini API** - Google Gemini (document analysis)
- **Serper API** - Web search
- **Sharp** - Image processing (stickers)
- **Node-Cron** - Background scheduling (reminders)
- **ffmpeg** - Video processing (video analysis)

---

## 📄 License

MIT License - feel free to use and modify!

---

Built with ❤️ using Baileys, Claude API, and OpenAI API.

## Version History

| Version | Features | Date |
|---------|----------|------|
| v1.0 | Core AI (chat, voice, images, docs) | Original |
| v2.0 | + URL Summaries, Stickers, Polls, Reminders, Semantic Search | Feb 2026 |
| v3.0 | + Auto Memory, Conversation Summaries, Multi-Image Analysis | Feb 2026 |
| **v4.0** | **+ Video Analysis, Code Execution, Calendar, Group Admin, Group KB** | **Feb 2026** |

---

*Version 4.0 - February 2026*
