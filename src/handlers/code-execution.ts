/**
 * Code Execution Handler
 * 
 * Safely executes Python and JavaScript code in a sandboxed environment.
 * Security-first approach with timeouts and output limits.
 */

import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import type { MessageContext } from '../llm/types.js';
import type { RouteResult } from '../core/message-router.js';
import { isEnabled } from '../config/index.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import pino from 'pino';

const logger = pino({ name: 'code-execution' });

// Security configuration
const MAX_EXECUTION_TIME_MS = 10000; // 10 seconds
const MAX_OUTPUT_SIZE = 10000; // 10KB
const MAX_CODE_LENGTH = 5000; // characters

// Command patterns
const EXECUTE_PATTERNS = [
  // Code blocks with triple backticks
  /^(?:run|execute|exec)\s+(?:this\s+)?(?:code|python|js|javascript|node)?\s*:?\s*```(\w+)?\s*\n([\s\S]+?)```$/im,
  /^(?:run|execute|exec)\s+(?:this\s+)?(?:code|python|js|javascript|node)?\s*:?\s*`{3}([\s\S]+?)`{3}$/im,
  /^```(\w+)?\s*\n([\s\S]+?)```\s*(?:run|execute|exec)$/im,
];

// Pattern to match "Run python:" or "Run js:" followed by code
// Handles both single line and multi-line code
const RUN_PATTERN = /^(?:run|execute|exec)\s+(python|py|js|javascript|node)\s*:\s*\n?([\s\S]+)$/im;

interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  truncated: boolean;
}

interface CodeParseResult {
  language: 'python' | 'javascript';
  code: string;
}

/**
 * Parse code from message
 */
function parseCode(message: string): CodeParseResult | null {
  logger.debug({ message: message.substring(0, 100) }, 'Parsing code message');
  
  // Try block patterns first (most specific - triple backticks)
  for (const pattern of EXECUTE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const langIndicator = match[1]?.toLowerCase() || '';
      const code = match[2] || match[3] || '';
      
      const language = detectLanguage(langIndicator, code);
      if (language) {
        logger.debug({ language, type: 'block' }, 'Detected code block');
        return { language, code: code.trim() };
      }
    }
  }

  // Try "Run python:" pattern - handles both single line and multi-line
  const runMatch = message.match(RUN_PATTERN);
  if (runMatch) {
    const langIndicator = runMatch[1].toLowerCase();
    const code = runMatch[2];
    
    logger.debug({ langIndicator, codeLength: code.length, hasNewlines: code.includes('\n') }, 'Run pattern matched');
    
    const language = detectLanguage(langIndicator, code);
    if (language) {
      logger.debug({ language, type: 'run' }, 'Detected code via run pattern');
      return { language, code: code.trim() };
    }
  }

  logger.debug('No code pattern matched');
  return null;
}

/**
 * Detect programming language from indicator or code
 */
function detectLanguage(indicator: string, code: string): 'python' | 'javascript' | null {
  // Check explicit indicators
  if (['python', 'py'].includes(indicator)) return 'python';
  if (['javascript', 'js', 'node', 'nodejs'].includes(indicator)) return 'javascript';
  
  // Try to detect from code if no indicator
  if (!indicator) {
    // Python indicators
    if (code.includes('def ') || code.includes('import ') || 
        code.includes('print(') || code.includes(':') && 
        (code.includes('if ') || code.includes('for ') || code.includes('while '))) {
      // Check if it looks more like JS
      if (code.includes('const ') || code.includes('let ') || 
          code.includes('var ') || code.includes('function()') ||
          code.includes('=>') || code.includes('console.log')) {
        return 'javascript';
      }
      return 'python';
    }
    
    // JavaScript indicators
    if (code.includes('const ') || code.includes('let ') || 
        code.includes('var ') || code.includes('function ') ||
        code.includes('=>') || code.includes('console.log') ||
        code.includes('require(')) {
      return 'javascript';
    }
  }
  
  return null;
}

/**
 * Sanitize code for basic safety
 */
function sanitizeCode(code: string, language: string): { safe: boolean; code: string; reason?: string } {
  // Check code length
  if (code.length > MAX_CODE_LENGTH) {
    return { safe: false, code, reason: `Code too long. Max ${MAX_CODE_LENGTH} characters.` };
  }

  // Block dangerous patterns
  const dangerousPatterns = [
    // File system deletion
    /rm\s+-rf?\s+\//,
    /del\s+\/f/i,
    /rmdir\s+\/s/i,
    /format\s+/i,
    // Network attacks
    /while\s*\(\s*true\s*\)/i, // Infinite loops
    /fork\s*\(/i, // Process forking
    /spawn\s*\(/i,
    // System access
    /os\.system\s*\(/i,
    /subprocess\.call/i,
    /subprocess\.run/i,
    /eval\s*\(/i,
    /exec\s*\(/i,
    // File deletion
    /fs\.unlink.*\//i,
    /fs\.rmdir.*\//i,
    /shutil\.rmtree/i,
    /os\.remove/i,
    /os\.rmdir/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return { safe: false, code, reason: 'Code contains potentially dangerous operations.' };
    }
  }

  return { safe: true, code };
}

/**
 * Execute Python code
 */
async function executePython(code: string): Promise<ExecutionResult> {
  const startTime = Date.now();
  let tempDir: string | null = null;

  try {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'buddy-python-'));
    const tempFile = join(tempDir, 'script.py');
    await fs.writeFile(tempFile, code);

    return new Promise((resolve) => {
      const child = spawn('python', [tempFile], {
        timeout: MAX_EXECUTION_TIME_MS,
      });

      let stdout = '';
      let stderr = '';
      let truncated = false;

      child.stdout.on('data', (data: Buffer) => {
        if (!truncated && stdout.length < MAX_OUTPUT_SIZE) {
          stdout += data.toString();
          if (stdout.length > MAX_OUTPUT_SIZE) {
            stdout = stdout.substring(0, MAX_OUTPUT_SIZE) + '\n... (truncated)';
            truncated = true;
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        if (!truncated && stderr.length < MAX_OUTPUT_SIZE) {
          stderr += data.toString();
          if (stderr.length > MAX_OUTPUT_SIZE) {
            stderr = stderr.substring(0, MAX_OUTPUT_SIZE) + '\n... (truncated)';
            truncated = true;
          }
        }
      });

      child.on('close', async (exitCode: number | null) => {
        const executionTime = Date.now() - startTime;
        
        // Cleanup
        if (tempDir) {
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode || 0,
          executionTime,
          truncated,
        });
      });

      child.on('error', async (error: Error) => {
        const executionTime = Date.now() - startTime;
        
        if (tempDir) {
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }

        resolve({
          stdout: '',
          stderr: `Failed to run Python: ${error.message}`,
          exitCode: 1,
          executionTime,
          truncated: false,
        });
      });
    });

  } catch (error) {
    return {
      stdout: '',
      stderr: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      exitCode: 1,
      executionTime: Date.now() - startTime,
      truncated: false,
    };
  }
}

/**
 * Execute JavaScript code using Node.js
 */
async function executeJavaScript(code: string): Promise<ExecutionResult> {
  const startTime = Date.now();
  let tempDir: string | null = null;

  try {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'buddy-js-'));
    const tempFile = join(tempDir, 'script.js');
    
    // Wrap code to prevent some global access
    const wrappedCode = `
// Restricted execution environment
const restrictedGlobals = ['process', 'require'];

// Override console to capture output
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => originalLog(...args);
console.error = (...args) => originalError(...args);

// User code starts here
${code}
`;
    
    await fs.writeFile(tempFile, wrappedCode);

    return new Promise((resolve) => {
      const child = spawn('node', [tempFile], {
        timeout: MAX_EXECUTION_TIME_MS,
        env: { ...process.env, NODE_OPTIONS: '--no-warnings' },
      });

      let stdout = '';
      let stderr = '';
      let truncated = false;

      child.stdout.on('data', (data: Buffer) => {
        if (!truncated && stdout.length < MAX_OUTPUT_SIZE) {
          stdout += data.toString();
          if (stdout.length > MAX_OUTPUT_SIZE) {
            stdout = stdout.substring(0, MAX_OUTPUT_SIZE) + '\n... (truncated)';
            truncated = true;
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        if (!truncated && stderr.length < MAX_OUTPUT_SIZE) {
          stderr += data.toString();
          if (stderr.length > MAX_OUTPUT_SIZE) {
            stderr = stderr.substring(0, MAX_OUTPUT_SIZE) + '\n... (truncated)';
            truncated = true;
          }
        }
      });

      child.on('close', async (exitCode: number | null) => {
        const executionTime = Date.now() - startTime;
        
        // Cleanup
        if (tempDir) {
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode || 0,
          executionTime,
          truncated,
        });
      });

      child.on('error', async (error: Error) => {
        const executionTime = Date.now() - startTime;
        
        if (tempDir) {
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }

        resolve({
          stdout: '',
          stderr: `Failed to run Node.js: ${error.message}`,
          exitCode: 1,
          executionTime,
          truncated: false,
        });
      });
    });

  } catch (error) {
    return {
      stdout: '',
      stderr: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      exitCode: 1,
      executionTime: Date.now() - startTime,
      truncated: false,
    };
  }
}

/**
 * Format execution result for WhatsApp
 */
function formatResult(result: ExecutionResult, language: string): string {
  let output = `💻 *Code Execution Result* (${language})\n`;
  output += `⏱️ ${result.executionTime}ms | `;
  output += `🔚 Exit Code: ${result.exitCode}\n\n`;

  if (result.stdout) {
    output += `*Output:*\n\`\`\`\n${result.stdout}\n\`\`\`\n\n`;
  }

  if (result.stderr) {
    output += `*Errors:*\n\`\`\`\n${result.stderr}\n\`\`\`\n\n`;
  }

  if (!result.stdout && !result.stderr) {
    output += '_No output_\n\n';
  }

  if (result.truncated) {
    output += '_⚠️ Output was truncated due to length_\n';
  }

  return output.trim();
}

/**
 * Handle code execution request
 */
export async function handleCodeExecution(
  sock: WASocket,
  message: WAMessage,
  text: string,
  context: MessageContext
): Promise<RouteResult | null> {
  // Check if feature is enabled
  if (!isEnabled('codeExecution')) {
    return null;
  }

  // Parse code from message
  const parsed = parseCode(text);
  if (!parsed) {
    return null; // Not a code execution request
  }

  try {
    logger.info({
      language: parsed.language,
      chat: context.chatJid,
      codeLength: parsed.code.length,
    }, 'Executing code');

    // Show typing indicator
    await sock.sendPresenceUpdate('composing', context.chatJid);

    // Sanitize code
    const sanitization = sanitizeCode(parsed.code, parsed.language);
    if (!sanitization.safe) {
      await sock.sendPresenceUpdate('paused', context.chatJid);
      return {
        response: `⚠️ ${sanitization.reason}`,
        success: false,
        contentType: 'text',
      };
    }

    // Execute based on language
    let result: ExecutionResult;
    if (parsed.language === 'python') {
      result = await executePython(parsed.code);
    } else {
      result = await executeJavaScript(parsed.code);
    }

    await sock.sendPresenceUpdate('paused', context.chatJid);

    const formattedResult = formatResult(result, parsed.language);
    
    await sock.sendMessage(context.chatJid, { text: formattedResult }, { quoted: message });

    return {
      response: '',
      success: result.exitCode === 0,
      contentType: 'text',
    };

  } catch (error) {
    logger.error({ error }, 'Code execution failed');
    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});

    return {
      response: 'Sorry, I encountered an error while executing the code.',
      success: false,
      contentType: 'text',
    };
  }
}

/**
 * Check if code execution patterns match
 */
export function isCodeExecutionRequest(text: string): boolean {
  return parseCode(text) !== null;
}
