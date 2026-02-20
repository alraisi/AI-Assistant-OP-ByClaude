import { describe, it, expect, vi } from 'vitest';
import { isCodeExecutionRequest } from './code-execution.js';

// Mock dependencies to prevent side-effect imports
vi.mock('../config/index.js', () => ({
  isEnabled: vi.fn(() => true),
}));

describe('isCodeExecutionRequest', () => {
  it('should detect code block with language hint', () => {
    const msg = 'run this code:\n```python\nprint("hello")\n```';
    expect(isCodeExecutionRequest(msg)).toBe(true);
  });

  it('should detect javascript code block', () => {
    const msg = 'run code:\n```javascript\nconsole.log("hello");\n```';
    expect(isCodeExecutionRequest(msg)).toBe(true);
  });

  it('should detect "run python:" pattern', () => {
    const msg = 'run python:\nprint("hello world")';
    expect(isCodeExecutionRequest(msg)).toBe(true);
  });

  it('should detect "execute js:" pattern', () => {
    const msg = 'execute js:\nconsole.log("hi")';
    expect(isCodeExecutionRequest(msg)).toBe(true);
  });

  it('should detect "exec node:" pattern', () => {
    const msg = 'exec node:\nconsole.log("test")';
    expect(isCodeExecutionRequest(msg)).toBe(true);
  });

  it('should detect code block at end with run command', () => {
    const msg = '```python\nprint("hello")\n``` run';
    expect(isCodeExecutionRequest(msg)).toBe(true);
  });

  it('should return false for regular text', () => {
    expect(isCodeExecutionRequest('Hello, how are you?')).toBe(false);
  });

  it('should return false for text without code patterns', () => {
    expect(isCodeExecutionRequest('Let me write some notes about programming')).toBe(false);
  });
});
