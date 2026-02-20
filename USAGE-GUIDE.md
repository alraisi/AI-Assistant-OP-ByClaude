# WhatsApp-Agent Usage Guide

Complete guide to using all features

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [URL Summarization](#-url-summarization)
3. [Sticker Creation](#-sticker-creation)
4. [Poll Creator](#-poll-creator)
5. [Reminder System](#-reminder-system)
6. [Semantic Memory Search](#-semantic-memory-search)
7. [Message Chunking](#-message-chunking)
8. [Intent Classification](#-intent-classification)
9. [Auto Memory Extraction](#-auto-memory-extraction)
10. [Conversation Summaries](#-conversation-summaries)
11. [Multi-Image Analysis](#-multi-image-analysis)
12. [Troubleshooting](#troubleshooting)

---

## Quick Start

### First-Time Setup

If this is your first time running Buddy, the web wizard will open automatically:

```bash
npm run build
npm start
```

The wizard will open in your browser and guide you through:
1. **API Keys** - Enter your Anthropic and OpenAI keys
2. **Features** - Choose which features to enable
3. **Persona** - Customize your bot's personality
4. **QR Code** - Scan to connect WhatsApp

### Reconfigure Later

To change settings later:
```bash
npm run setup
```

### Manual Configuration

You can also edit `.env` directly:
```env
FF_URL_SUMMARIZATION=true
FF_STICKER_CREATION=true
FF_POLL_CREATOR=true
FF_REMINDER_SYSTEM=true
FF_SEMANTIC_MEMORY=true
```

### Restart Bot
```bash
npm run build
npm start
```

---

## 🔗 URL Summarization

**What it does:** Sends you a summary of any web link

### Usage

```
Summarize this: https://example.com/article
```

Or just send a URL:
```
https://en.wikipedia.org/wiki/Artificial_intelligence
```

### Example Response
```
📄 *The Future of AI*

• AI is transforming industries
• Key challenges remain in ethics
• 2025 will see major breakthroughs

🔗 https://example.com/article
```

---

## 🎨 Sticker Creation

**What it does:** Converts images to WhatsApp stickers

### Prerequisites
```bash
npm install sharp
```

### Usage

**Method 1: Send image with caption**
1. Send an image
2. Add caption: `sticker`

**Method 2: Reply to image**
1. Send an image
2. Reply to it with text: `sticker`

### Requirements
- Image size: Any (auto-resized to 512x512)
- Format: JPG, PNG → converted to WebP
- Max file size: 100KB

### Example
```
[You send image with caption "sticker"]
→ Bot replies with sticker
```

---

## 🧠 Semantic Memory Search

**What it does:** Search your memories by MEANING, not just keywords

### How It Works

Uses AI embeddings to find memories related to your query, even if they use different words.

**Example:**
- Search: "job"
- Finds: "I got promoted to senior developer"

### Search Memories

```
Search memories: what did John say about work?
```

```
Do you remember when we talked about the project?
```

```
What did I say about my vacation?
```

### Check Stats

```
/semantic stats
```

Shows how many memories are indexed.

### Index Memories

```
/semantic index
```

Re-indexes all your existing memories (run this once after enabling).

### Example Results

```
🔍 *Memories about "work"*

1. 🟢 John mentioned he got promoted to senior developer last week
   _Source: long-term · Match: 85%_

2. 🟡 We discussed the new website project timeline
   _Source: daily · Match: 72%_

3. 🟡 Sarah said she's looking for a new job
   _Source: daily · Match: 68%_

_Searched 245 memories_
```

### How It Works Internally

1. Your message → AI converts to vector (1536 numbers)
2. Compares with all memory vectors
3. Returns most similar memories
4. Works even with different words!

---

## 📊 Poll Creator

**What it does:** Create interactive polls in WhatsApp

### Create a Poll

```
Create a poll: Who's the best?
Options: Hadi, Abdulla, Ahmad
```

Or shorter:
```
Who's better at IT? Hadi, Abdulla, Ahmad
```

### Vote

Reply with the number:
```
/1   (votes for option 1)
/2   (votes for option 2)
/3   (votes for option 3)
```

### Check Results

```
/poll status
```

### End Poll

```
/end poll
```

### Example Full Flow
```
You: Create a poll: Best programming language?
Options: Python, JavaScript, Rust

Bot: ✅ Poll created!
    📊 *Best programming language?*
    1. Python
       ░░░░░░░░░░ 0 votes (0%)
    2. JavaScript
       ░░░░░░░░░░ 0 votes (0%)
    3. Rust
       ░░░░░░░░░░ 0 votes (0%)
    To vote, reply with: /1, /2, /3

You: /1

Bot: ✅ Vote recorded!
    📊 *Best programming language?*
    1. Python
       ██████████ 1 vote (100%)
    ...
```

---

## ⏰ Reminder System

**What it does:** Schedule reminders that the bot sends later

### Create Reminder

```
Remind me to call mom in 30 minutes
```

```
Remind me to take medicine at 8pm
```

```
Remind me tomorrow at 9am to go to the gym
```

```
Remind me every day at 10am to drink water
```

### Supported Time Formats

| Format | Example |
|--------|---------|
| Minutes from now | `in 30 minutes` |
| Hours from now | `in 2 hours` |
| Specific time | `at 5pm`, `at 14:30` |
| Today | `today at 8pm` |
| Tomorrow | `tomorrow at 9am` |
| Day of week | `on Monday`, `next Tuesday` |
| Recurring daily | `every day at 8am` |
| Recurring weekly | `every week on Friday` |

### List Reminders

```
/myreminders
```

### Cancel Reminder

```
/cancel reminder <ID>
```

### Snooze Reminder

When you get a reminder, reply:
```
snooze 10 minutes
```

### Mark Done

When you get a reminder, reply:
```
done
```

### Test Reminder (Immediate)

```
/testreminder
```

Creates a test reminder that fires in 10 seconds.

### Where You Receive Reminders

**Same chat where you created them:**
- Private chat → You get DM
- Group chat → Posted in group

### Example Full Flow
```
You: Remind me to drink tea in 2 minutes

Bot: ✅ *Reminder Set*
    📋 drink tea
    ⏰ in 2 minutes
    ID: `rem_12345`
    To cancel: /cancel reminder rem_12345

[2 minutes later...]

Bot: ⏰ *Reminder*
    drink tea
    _Set for: in 2 minutes_
    
    Reply with:
    • "done" to dismiss
    • "snooze 10 minutes" to snooze
    • "cancel reminder" to stop

You: done

Bot: ✅ Great! I've marked that as done.
```

---

## 📝 Message Chunking

**What it does:** Automatically splits long responses

This happens automatically when:
- Response is > 1500 characters
- Long code blocks
- Long lists

You'll see:
```
[Part 1 of 3] ...
[Part 2 of 3] ...
[Part 3 of 3] ...
```

No commands needed - fully automatic!

---

## 🎯 Intent Classification

**What it does:** Automatically detects what you want to do

The AI analyzes your messages to understand intent. This happens automatically behind the scenes.

### Supported Intents

| Intent | Example Query |
|--------|---------------|
| Question | "What's the weather?" |
| URL Summary | "Summarize this link" |
| Reminder | "Remind me to call mom" |
| Image Generation | "Create an image of a cat" |
| Search | "Search the web for AI news" |
| Code Help | "Write a Python script" |
| Greeting | "Hello!" |
| Poll | "Create a poll" |

### How It Works

1. Your message → Pattern matching (fast)
2. If unclear → AI classification (accurate)
3. Routed to appropriate handler
4. Logs for analytics

**This happens automatically - no commands needed!**

---

## 🧠 Auto Memory Extraction

**AI automatically extracts important facts from conversations**

### How It Works
After each conversation, AI analyzes for important facts and stores them in long-term memory:
- Facts about you, your preferences
- Relationships, events, projects
- Max 3 memories per conversation
- Rate-limited: once per minute per chat

### Example
```
You: I'm going to Japan next month for vacation
Bot: That sounds exciting! Where in Japan?

[Behind the scenes]
→ Extracted: "User planning trip to Japan next month"
→ Stored in long-term memory
```

Later, without you mentioning it:
```
You: What should I pack?
Bot: Since you're going to Japan next month, pack...
```

**Enable:** `FF_AUTO_MEMORY_EXTRACTION=true`

---

## 📝 Conversation Summaries

**Automatically summarize long conversations**

### How It Works
- When conversation exceeds 10 messages, creates summary
- Stores in `buddy-memory/summaries/`
- Used for context in future conversations
- Max once per day per chat

### Commands
```
/summary status    # Check if summary exists
/summary index     # Force create summary
```

### Summary Includes
- 2-3 sentence overview
- Key topics discussed
- Important decisions made

**Enable:** `FF_CONVERSATION_SUMMARIES=true`

---

## 🖼️ Multi-Image Analysis

**Analyze multiple images at once**

### Usage
Send multiple images as an album (select multiple before sending):
```
You: [Sends 3-4 images at once]

Bot: Looking at all these images together...
```

### Example Use Cases
**Comparing apartments:**
```
You: [3 photos of different apartments]

Bot: Comparing these apartments:
    1. First has largest living room
    2. Second has best natural lighting  
    3. Third appears most affordable
```

**Document pages:**
```
You: [4 pages of a contract]

Bot: Reading through all 4 pages, the key points are...
```

**Photo series:**
```
You: [Progress photos of renovation]

Bot: Looking at the transformation, I can see significant
    progress between photo 1 and 3, especially in...
```

**Enable:** `FF_MULTI_IMAGE_ANALYSIS=true`

---

## Troubleshooting

### Feature Not Working

**Check feature flags:**
```bash
grep "^FF_" .env
```

Should show `=true` for enabled features.

### Reminder Not Firing

1. Check scheduler is running (look for "Reminder scheduler started" in logs)
2. Use `/testreminder` to test immediately
3. Check time zone is correct

### Sticker Not Creating

1. Check sharp is installed: `npm ls sharp`
2. Image must not be corrupted
3. File size limit: 100KB after conversion

### Poll Not Working

Must use trigger words:
- "Create a poll:"
- "Who's better?"
- "Which is best?"

### URL Summary Not Working

Some sites block bots. Try:
- Different URL
- Paste article text directly

---

## Feature Flags Reference

| Phase | Feature | Flag | Status |
|-------|---------|------|--------|
| 1 | URL Summarization | `FF_URL_SUMMARIZATION` | ✅ |
| 1 | Message Chunking | `FF_MESSAGE_CHUNKING` | ✅ |
| 1 | Sticker Creation | `FF_STICKER_CREATION` | ✅ |
| 1 | Reminder System | `FF_REMINDER_SYSTEM` | ✅ |
| 2 | Intent Classification | `FF_INTENT_CLASSIFICATION` | ✅ |
| 2 | Poll Creator | `FF_POLL_CREATOR` | ✅ |
| 2 | Semantic Memory | `FF_SEMANTIC_MEMORY` | ✅ |
| 3 | Auto Memory Extraction | `FF_AUTO_MEMORY_EXTRACTION` | ✅ |
| 3 | Conversation Summaries | `FF_CONVERSATION_SUMMARIES` | ✅ |
| 3 | Multi-Image Analysis | `FF_MULTI_IMAGE_ANALYSIS` | ✅ |

---

*Last updated: 2026-02-18*
