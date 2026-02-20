# Quick Start Guide: Safe Implementation

This guide will help you implement all features safely without breaking existing functionality.

---

## Step 1: Initial Setup (One-time)

```bash
# Run the setup script
cd WhatsApp-Agent
bash scripts/setup-development.sh

# Or manually:
git checkout -b develop
git checkout main
```

---

## Step 2: Implement Features in Order

### Week 1-2: Phase 1 (Safe Foundations)

| Order | Feature | Branch Name | Risk |
|-------|---------|-------------|------|
| 1 | URL Summarization | `feature/url-summarization` | 🟢 Low |
| 2 | Translation Mode | `feature/translation-mode` | 🟢 Low |
| 3 | Message Chunking | `feature/message-chunking` | 🟢 Low |
| 4 | Sticker Creation | `feature/sticker-creation` | 🟢 Low |

### Week 3-4: Phase 2 (Core Enhancements)

| Order | Feature | Branch Name | Risk |
|-------|---------|-------------|------|
| 5 | Reminder System | `feature/reminder-system` | 🟡 Medium |
| 6 | Poll Creator | `feature/poll-creator` | 🟡 Medium |
| 7 | Intent Classification | `feature/intent-classifier` | 🟡 Medium |

---

## Step 3: Workflow for Each Feature

### 3.1 Start Feature

```bash
# Create new feature branch
./scripts/start-feature.sh url-summarization

# This will:
# - Checkout develop
# - Pull latest changes
# - Create feature/url-summarization branch
```

### 3.2 Implement Feature

**Pattern to follow:**

```typescript
// 1. Create new file(s) for your feature
// src/handlers/url-summarizer.ts

// 2. Add feature flag check
import { isEnabled } from '../config/index.js';

export async function handleUrlSummarization(...) {
  if (!isEnabled('urlSummarization')) {
    return null; // Feature disabled, skip
  }
  
  // Your implementation
}

// 3. Integrate in router (minimal change)
// src/core/message-router.ts
import { handleUrlSummarization } from '../handlers/url-summarizer.js';

// Add one line to routeMessage:
const urlResult = await handleUrlSummarization(sock, text, context);
if (urlResult) return urlResult;
```

### 3.3 Test Feature

```bash
# Test with feature OFF (should work exactly as before)
FF_URL_SUMMARIZATION=false npm run dev

# Test with feature ON
FF_URL_SUMMARIZATION=true npm run dev

# Run build
npm run build
```

### 3.4 Finish Feature

```bash
# Commit and push
./scripts/finish-feature.sh url-summarization

# This will:
# - Build project
# - Commit changes
# - Push to origin
# - Ready for PR
```

### 3.5 Create Pull Request

1. Go to GitHub/GitLab
2. Create PR from `feature/url-summarization` to `develop`
3. Add description of changes
4. Request review (if team)
5. Merge when ready

---

## Step 4: Enable Features Gradually

After a feature is merged to `develop` and tested:

```bash
# In your production .env
FF_URL_SUMMARIZATION=true
FF_TRANSLATION_MODE=true
# ... enable one by one
```

---

## Feature Implementation Templates

### Template 1: Simple Handler (URL Summarization)

```typescript
// src/handlers/url-summarizer.ts
import type { WASocket } from '@whiskeysockets/baileys';
import type { MessageContext, RouteResult } from '../llm/types.js';
import { isEnabled } from '../config/index.js';
import pino from 'pino';

const logger = pino({ name: 'url-summarizer' });

export async function handleUrlSummarization(
  sock: WASocket,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check feature flag
  if (!isEnabled('urlSummarization')) {
    return null;
  }
  
  // Check if message contains URL
  const url = extractUrl(text);
  if (!url) {
    return null;
  }
  
  try {
    logger.info({ url }, 'Summarizing URL');
    
    // Your implementation
    const summary = await summarizeUrl(url);
    
    return {
      response: summary,
      success: true,
      contentType: 'text',
    };
  } catch (error) {
    logger.error({ error }, 'Failed to summarize URL');
    return null; // Fall through to normal handling
  }
}

function extractUrl(text: string): string | null {
  const urlRegex = /(https?:\/\/[^\s]+)/i;
  const match = text.match(urlRegex);
  return match ? match[1] : null;
}

async function summarizeUrl(url: string): Promise<string> {
  // Implementation here
  return `Summary of ${url}`;
}
```

### Template 2: New Tool/Provider

```typescript
// src/tools/url-fetcher.ts
import { withRetry } from '../utils/retry.js';

export interface UrlContent {
  title: string;
  content: string;
  url: string;
}

export async function fetchUrlContent(url: string): Promise<UrlContent> {
  return withRetry(
    async () => {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Buddy-Bot/1.0',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const html = await response.text();
      
      // Extract content (simplified)
      const title = extractTitle(html);
      const content = extractContent(html);
      
      return { title, content, url };
    },
    { maxRetries: 2, label: 'url-fetch' }
  );
}
```

---

## Safety Checklist

Before merging any feature:

- [ ] Feature works when flag is ON
- [ ] Existing functionality works when flag is OFF
- [ ] Build passes (`npm run build`)
- [ ] No TypeScript errors
- [ ] Error handling implemented
- [ ] Logging added
- [ ] Feature is documented

---

## Emergency Rollback

If something goes wrong:

```bash
# Option 1: Disable feature immediately
# Edit .env
FF_PROBLEMATIC_FEATURE=false

# Restart
npm restart

# Option 2: Revert commit
git revert HEAD
npm run build
npm restart

# Option 3: Restore from backup
./scripts/backup.sh  # First create backup of current state
cp -r backups/YYYYMMDD_HHMMSS/buddy-memory .
cp backups/YYYYMMDD_HHMMSS/.env .
```

---

## Questions?

Refer to:
- `IMPLEMENTATION-STRATEGY.md` - Detailed strategy
- `Kimi-Enhancement-ideas.md` - Feature specifications

Ready to start? Run:

```bash
./scripts/start-feature.sh url-summarization
```

Happy coding! 🚀
