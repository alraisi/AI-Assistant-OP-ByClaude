/**
 * Enhanced Buddy Setup Wizard
 * 
 * Multi-step web wizard for first-time setup including:
 * - API key configuration
 * - Feature enablement toggles
 * - Persona settings
 * - QR code display in browser
 */

import http from 'http';
import { exec } from 'child_process';
import { type PersonaConfig, PersonaConfigSchema } from './persona-config.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { getConfig } from '../config/index.js';

const DEFAULT_PORT = 3456;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// Wizard state
interface WizardState {
  step: 'api-keys' | 'features' | 'persona' | 'qr-code' | 'complete';
  config: {
    apiKeys: {
      anthropicApiKey: string;
      openaiApiKey: string;
      geminiApiKey: string;
      serperApiKey: string;
    };
    features: Record<string, boolean>;
    persona: PersonaConfig;
  };
  qrCode?: string;
}

const state: WizardState = {
  step: 'api-keys',
  config: {
    apiKeys: {
      anthropicApiKey: '',
      openaiApiKey: '',
      geminiApiKey: '',
      serperApiKey: '',
    },
    features: {
      // Phase 1
      urlSummarization: true,
      stickerCreation: true,
      reminderSystem: true,
      messageChunking: true,
      // Phase 2
      intentClassification: true,
      pollCreator: true,
      semanticMemory: true,
      // Phase 3
      autoMemoryExtraction: true,
      conversationSummaries: true,
      multiImageAnalysis: true,
      // Phase 4
      videoAnalysis: true,
      codeExecution: true,
      calendarIntegration: true,
      groupAdminControls: true,
      groupKnowledgeBase: true,
    },
    persona: {
      botName: 'Buddy',
      botEmoji: '🤖',
      personalityStyle: 'friendly',
      language: 'English',
      responseVerbosity: 'balanced',
      customInstructions: '',
      allowedNumbers: 'all',
      setupCompleted: true,
    },
  },
};

function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Buddy Setup Wizard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #e2e8f0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }
  .card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 1rem;
    padding: 2.5rem;
    max-width: 640px;
    width: 100%;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
  }
  h1 { font-size: 1.75rem; text-align: center; margin-bottom: 0.5rem; }
  .subtitle { text-align: center; color: #94a3b8; margin-bottom: 2rem; font-size: 0.95rem; }
  
  /* Progress Steps */
  .progress-steps {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 2rem;
  }
  .step {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #334155;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.3s;
  }
  .step.active { background: #3b82f6; color: white; }
  .step.completed { background: #22c55e; color: white; }
  .step-divider {
    width: 40px;
    height: 2px;
    background: #334155;
    margin-top: 15px;
  }
  .step-divider.completed { background: #22c55e; }
  
  /* Form Elements */
  .field { margin-bottom: 1.5rem; }
  label { display: block; font-weight: 600; margin-bottom: 0.5rem; font-size: 0.9rem; color: #cbd5e1; }
  label .required { color: #f87171; }
  label .optional { color: #64748b; font-weight: 400; font-size: 0.8rem; }
  
  input[type="text"], input[type="password"], select, textarea {
    width: 100%;
    padding: 0.75rem 1rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 0.5rem;
    color: #e2e8f0;
    font-size: 0.95rem;
    transition: border-color 0.2s;
  }
  input:focus, select:focus, textarea:focus { outline: none; border-color: #3b82f6; }
  input::placeholder { color: #64748b; }
  
  .api-key-row {
    display: flex;
    gap: 0.5rem;
  }
  .api-key-row input { flex: 1; }
  .toggle-password {
    padding: 0.75rem 1rem;
    background: #334155;
    border: 1px solid #475569;
    border-radius: 0.5rem;
    color: #e2e8f0;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .toggle-password:hover { background: #475569; }
  
  .api-key-help {
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: #64748b;
  }
  .api-key-help a { color: #60a5fa; text-decoration: none; }
  .api-key-help a:hover { text-decoration: underline; }
  
  /* Feature Toggles */
  .feature-section {
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: #0f172a;
    border-radius: 0.5rem;
    border: 1px solid #334155;
  }
  .feature-section h3 {
    color: #60a5fa;
    font-size: 0.9rem;
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .feature-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }
  .feature-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: background 0.2s;
  }
  .feature-toggle:hover { background: #1e293b; }
  .feature-toggle input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #3b82f6;
  }
  .feature-toggle label {
    margin: 0;
    font-weight: 400;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .feature-desc {
    font-size: 0.75rem;
    color: #64748b;
    margin-left: 1.75rem;
  }
  
  /* Select All */
  .select-all-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: #1e3a5f;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }
  .select-all-row span { font-weight: 600; color: #60a5fa; }
  .btn-small {
    padding: 0.4rem 0.75rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .btn-small:hover { background: #2563eb; }
  .btn-small.secondary { background: #475569; }
  .btn-small.secondary:hover { background: #64748b; }
  
  /* Persona Styles */
  .radio-group { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .radio-group label {
    display: flex; align-items: center; gap: 0.4rem;
    background: #0f172a; border: 1px solid #334155; border-radius: 0.5rem;
    padding: 0.5rem 0.85rem; cursor: pointer; font-weight: 400; font-size: 0.85rem;
    transition: border-color 0.2s, background 0.2s;
  }
  .radio-group label:hover { border-color: #3b82f6; }
  .radio-group input:checked + span { color: #60a5fa; }
  .radio-group label:has(input:checked) { border-color: #3b82f6; background: #1e3a5f; }
  .radio-group input { accent-color: #3b82f6; }
  
  .range-row { display: flex; align-items: center; gap: 1rem; }
  .range-row input[type="range"] { flex: 1; accent-color: #3b82f6; }
  .range-label { min-width: 70px; text-align: center; font-size: 0.85rem; color: #94a3b8; }
  
  .field-desc {
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: #64748b;
    font-style: italic;
  }
  
  /* QR Code Section */
  .qr-section {
    text-align: center;
    padding: 2rem;
    background: #0f172a;
    border-radius: 0.5rem;
    border: 1px solid #334155;
  }
  .qr-code {
    font-family: monospace;
    font-size: 0.6rem;
    line-height: 1.1;
    white-space: pre;
    background: white;
    color: black;
    padding: 1rem;
    border-radius: 0.5rem;
    display: inline-block;
    margin: 1rem 0;
  }
  .qr-instructions {
    color: #94a3b8;
    font-size: 0.9rem;
    margin-top: 1rem;
  }
  .qr-instructions ol {
    text-align: left;
    display: inline-block;
    margin-top: 0.5rem;
  }
  .qr-instructions li { margin: 0.5rem 0; }
  
  /* Status */
  .status {
    text-align: center;
    margin-top: 1rem;
    font-size: 0.9rem;
    color: #94a3b8;
  }
  .status.success { color: #4ade80; }
  .status.error { color: #f87171; }
  
  /* Buttons */
  .btn-row {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }
  .btn {
    flex: 1;
    padding: 0.85rem;
    background: #3b82f6;
    color: #fff;
    font-size: 1rem;
    font-weight: 600;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background 0.2s;
  }
  .btn:hover { background: #2563eb; }
  .btn:disabled { background: #475569; cursor: not-allowed; }
  .btn.secondary {
    background: transparent;
    border: 1px solid #475569;
    color: #94a3b8;
  }
  .btn.secondary:hover {
    background: #334155;
    color: #e2e8f0;
  }
  
  /* Navigation */
  .nav-buttons {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }
  .nav-buttons .btn { flex: 1; }
  
  /* Loading */
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
  }
  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid #334155;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  
  /* Success Page */
  .success-icon {
    font-size: 4rem;
    text-align: center;
    margin-bottom: 1rem;
  }
  .success-text {
    text-align: center;
    font-size: 1.1rem;
    color: #4ade80;
  }
  
  /* Responsive */
  @media (max-width: 600px) {
    .feature-grid { grid-template-columns: 1fr; }
    .card { padding: 1.5rem; }
  }
</style>
</head>
<body>
<div class="card" id="wizardCard">
  <h1>🤖 Buddy Setup Wizard</h1>
  <p class="subtitle" id="subtitle">Configure your WhatsApp AI Assistant</p>
  
  <!-- Progress Steps -->
  <div class="progress-steps" id="progressSteps">
    <div class="step active" data-step="1">1</div>
    <div class="step-divider"></div>
    <div class="step" data-step="2">2</div>
    <div class="step-divider"></div>
    <div class="step" data-step="3">3</div>
    <div class="step-divider"></div>
    <div class="step" data-step="4">4</div>
  </div>
  
  <!-- Content Container -->
  <div id="content">
    <!-- Step 1: API Keys -->
    <div id="step-api-keys">
      <div class="field">
        <label for="anthropicApiKey">Anthropic API Key <span class="required">*</span></label>
        <div class="api-key-row">
          <input type="password" id="anthropicApiKey" placeholder="sk-ant-api03-...">
          <button type="button" class="toggle-password" onclick="togglePassword('anthropicApiKey')">Show</button>
        </div>
        <div class="api-key-help">
          Get your key at <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>
        </div>
      </div>
      
      <div class="field">
        <label for="openaiApiKey">OpenAI API Key <span class="required">*</span></label>
        <div class="api-key-row">
          <input type="password" id="openaiApiKey" placeholder="sk-...">
          <button type="button" class="toggle-password" onclick="togglePassword('openaiApiKey')">Show</button>
        </div>
        <div class="api-key-help">
          Get your key at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>
        </div>
      </div>
      
      <div class="field">
        <label for="geminiApiKey">Gemini API Key <span class="optional">(optional but recommended)</span></label>
        <div class="api-key-row">
          <input type="password" id="geminiApiKey" placeholder="AIzaSy...">
          <button type="button" class="toggle-password" onclick="togglePassword('geminiApiKey')">Show</button>
        </div>
        <div class="api-key-help">
          Get your key at <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com</a> — enables document & video analysis
        </div>
      </div>
      
      <div class="field">
        <label for="serperApiKey">Serper API Key <span class="optional">(optional)</span></label>
        <div class="api-key-row">
          <input type="password" id="serperApiKey" placeholder="...">
          <button type="button" class="toggle-password" onclick="togglePassword('serperApiKey')">Show</button>
        </div>
        <div class="api-key-help">
          Get your key at <a href="https://serper.dev" target="_blank">serper.dev</a> — enables web search
        </div>
      </div>
      
      <div class="nav-buttons">
        <button class="btn" onclick="goToStep('features')">Next: Features →</button>
      </div>
    </div>
    
    <!-- Step 2: Features -->
    <div id="step-features" style="display:none;">
      <div class="select-all-row">
        <span>🎯 Enable All Features</span>
        <div>
          <button class="btn-small" onclick="toggleAllFeatures(true)">Enable All</button>
          <button class="btn-small secondary" onclick="toggleAllFeatures(false)">Disable All</button>
        </div>
      </div>
      
      <div class="feature-section">
        <h3>📦 Phase 1: Safe Foundations</h3>
        <div class="feature-grid">
          <div class="feature-toggle">
            <input type="checkbox" id="ff_urlSummarization" checked>
            <label for="ff_urlSummarization">URL Summarization</label>
          </div>
          <div class="feature-toggle">
            <input type="checkbox" id="ff_stickerCreation" checked>
            <label for="ff_stickerCreation">Sticker Creation</label>
          </div>
          <div class="feature-toggle">
            <input type="checkbox" id="ff_reminderSystem" checked>
            <label for="ff_reminderSystem">Reminder System</label>
          </div>
          <div class="feature-toggle">
            <input type="checkbox" id="ff_messageChunking" checked>
            <label for="ff_messageChunking">Message Chunking</label>
          </div>
        </div>
      </div>
      
      <div class="feature-section">
        <h3>🧠 Phase 2: Core Enhancements</h3>
        <div class="feature-grid">
          <div class="feature-toggle">
            <input type="checkbox" id="ff_intentClassification" checked>
            <label for="ff_intentClassification">Intent Classification</label>
          </div>
          <div class="feature-toggle">
            <input type="checkbox" id="ff_pollCreator" checked>
            <label for="ff_pollCreator">Poll Creator</label>
          </div>
          <div class="feature-toggle">
            <input type="checkbox" id="ff_semanticMemory" checked>
            <label for="ff_semanticMemory">Semantic Memory</label>
          </div>
        </div>
      </div>
      
      <div class="feature-section">
        <h3>🚀 Phase 3: Memory & Intelligence</h3>
        <div class="feature-grid">
          <div class="feature-toggle">
            <input type="checkbox" id="ff_autoMemoryExtraction" checked>
            <label for="ff_autoMemoryExtraction">Auto Memory Extraction</label>
          </div>
          <div class="feature-toggle">
            <input type="checkbox" id="ff_conversationSummaries" checked>
            <label for="ff_conversationSummaries">Conversation Summaries</label>
          </div>
          <div class="feature-toggle">
            <input type="checkbox" id="ff_multiImageAnalysis" checked>
            <label for="ff_multiImageAnalysis">Multi-Image Analysis</label>
          </div>
        </div>
      </div>
      
      <div class="feature-section">
        <h3>🔥 Phase 4: Advanced Features</h3>
        <div class="feature-grid">
          <div class="feature-toggle">
            <input type="checkbox" id="ff_videoAnalysis" checked>
            <label for="ff_videoAnalysis">Video Analysis</label>
          </div>
          <div class="feature-toggle">
            <input type="checkbox" id="ff_codeExecution" checked>
            <label for="ff_codeExecution">Code Execution</label>
          </div>
          <div class="feature-toggle">
            <input type="checkbox" id="ff_calendarIntegration" checked>
            <label for="ff_calendarIntegration">Calendar Integration</label>
          </div>
          <div class="feature-toggle">
            <input type="checkbox" id="ff_groupAdminControls" checked>
            <label for="ff_groupAdminControls">Group Admin Controls</label>
          </div>
          <div class="feature-toggle">
            <input type="checkbox" id="ff_groupKnowledgeBase" checked>
            <label for="ff_groupKnowledgeBase">Group Knowledge Base</label>
          </div>
        </div>
      </div>
      
      <div class="nav-buttons">
        <button class="btn secondary" onclick="goToStep('api-keys')">← Back</button>
        <button class="btn" onclick="goToStep('persona')">Next: Persona →</button>
      </div>
    </div>
    
    <!-- Step 3: Persona -->
    <div id="step-persona" style="display:none;">
      <div class="field">
        <label for="botName">Bot Name</label>
        <input type="text" id="botName" value="Buddy" placeholder="Buddy">
      </div>
      
      <div class="field">
        <label for="botEmoji">Signature Emoji</label>
        <input type="text" id="botEmoji" value="🤖" placeholder="🤖">
      </div>
      
      <div class="field">
        <label>Personality Style</label>
        <div class="radio-group">
          <label title="Formal, polished, and business-appropriate"><input type="radio" name="personalityStyle" value="professional"><span>Professional</span></label>
          <label title="Relaxed and laid-back, uses informal language"><input type="radio" name="personalityStyle" value="casual"><span>Casual</span></label>
          <label title="Warm, approachable, like talking to a good friend" checked><input type="radio" name="personalityStyle" value="friendly"><span>Friendly</span></label>
          <label title="Clever and humorous, enjoys wordplay"><input type="radio" name="personalityStyle" value="witty"><span>Witty</span></label>
          <label title="Caring and understanding, focuses on emotional support"><input type="radio" name="personalityStyle" value="empathetic"><span>Empathetic</span></label>
          <label title="Brief and to the point, minimal fluff"><input type="radio" name="personalityStyle" value="concise"><span>Concise</span></label>
        </div>
        <div id="personalityDesc" class="field-desc">Warm, approachable, like talking to a good friend</div>
      </div>
      
      <div class="field">
        <label for="language">Primary Language</label>
        <select id="language">
          <option value="English" selected>English</option>
          <option value="Spanish">Spanish</option>
          <option value="French">French</option>
          <option value="German">German</option>
          <option value="Portuguese">Portuguese</option>
          <option value="Arabic">Arabic</option>
          <option value="Hindi">Hindi</option>
          <option value="Chinese">Chinese</option>
          <option value="Japanese">Japanese</option>
          <option value="Korean">Korean</option>
          <option value="Turkish">Turkish</option>
          <option value="Russian">Russian</option>
          <option value="Italian">Italian</option>
          <option value="Dutch">Dutch</option>
        </select>
      </div>
      
      <div class="field">
        <label>Response Verbosity</label>
        <div class="range-row">
          <span class="range-label">Concise</span>
          <input type="range" id="verbosity" min="0" max="2" value="1" step="1">
          <span class="range-label">Verbose</span>
        </div>
        <div id="verbosityDesc" class="field-desc">Medium-length responses — enough detail without being overwhelming</div>
      </div>
      
      <div class="field">
        <label for="customInstructions">Custom Instructions <span class="optional">(optional)</span></label>
        <textarea id="customInstructions" placeholder="Any special instructions for your bot..."></textarea>
      </div>
      
      <div class="nav-buttons">
        <button class="btn secondary" onclick="goToStep('features')">← Back</button>
        <button class="btn" onclick="saveAndConnect()">Connect WhatsApp →</button>
      </div>
    </div>
    
    <!-- Step 4: QR Code -->
    <div id="step-qr-code" style="display:none;">
      <div class="qr-section">
        <h3>📱 Scan to Connect</h3>
        <div id="qrContainer">
          <div class="loading">
            <div class="spinner"></div>
            <span>Generating QR code...</span>
          </div>
        </div>
        <div class="qr-instructions">
          <strong>How to connect:</strong>
          <ol>
            <li>Open WhatsApp on your phone</li>
            <li>Tap Menu (⋮) → Linked Devices</li>
            <li>Tap "Link a Device"</li>
            <li>Point camera at the QR code above</li>
          </ol>
        </div>
      </div>
    </div>
    
    <!-- Step 5: Complete -->
    <div id="step-complete" style="display:none;">
      <div class="success-icon">✅</div>
      <div class="success-text">
        <h2>Setup Complete!</h2>
        <p style="margin-top: 1rem; color: #94a3b8;">
          Buddy is now connected and ready to help.<br>
          You can close this window.
        </p>
      </div>
    </div>
  </div>
  
  <div class="status" id="status"></div>
</div>

<script>
  const verbosityMap = ['concise', 'balanced', 'verbose'];
  const personalityDescs = {
    professional: 'Formal, polished, and business-appropriate. Clear and structured responses.',
    casual: 'Relaxed and laid-back. Uses informal language and slang naturally.',
    friendly: 'Warm, approachable, like talking to a good friend.',
    witty: 'Clever and humorous. Enjoys wordplay and light sarcasm.',
    empathetic: 'Caring and understanding. Focuses on emotional support and active listening.',
    concise: 'Brief and to the point. Minimal fluff, maximum information.'
  };
  const verbosityDescs = [
    'Short and direct responses — gets to the point quickly',
    'Medium-length responses — enough detail without being overwhelming',
    'Detailed and thorough responses — explains things comprehensively'
  ];
  
  // Personality style descriptions
  document.querySelectorAll('input[name="personalityStyle"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      document.getElementById('personalityDesc').textContent = personalityDescs[this.value] || '';
    });
  });
  
  // Verbosity descriptions
  document.getElementById('verbosity').addEventListener('input', function() {
    document.getElementById('verbosityDesc').textContent = verbosityDescs[this.value] || '';
  });
  
  // Toggle password visibility
  function togglePassword(id) {
    const input = document.getElementById(id);
    const btn = input.nextElementSibling;
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = 'Hide';
    } else {
      input.type = 'password';
      btn.textContent = 'Show';
    }
  }
  
  // Toggle all features
  function toggleAllFeatures(enable) {
    document.querySelectorAll('input[id^="ff_"]').forEach(cb => {
      cb.checked = enable;
    });
  }
  
  // Navigation
  const steps = ['api-keys', 'features', 'persona', 'qr-code', 'complete'];
  let currentStep = 0;
  
  function goToStep(stepName) {
    // Validate current step before moving forward
    if (steps.indexOf(stepName) > currentStep) {
      if (!validateStep(steps[currentStep])) return;
    }
    
    // Hide all steps
    steps.forEach(s => {
      const el = document.getElementById('step-' + s);
      if (el) el.style.display = 'none';
    });
    
    // Show target step
    document.getElementById('step-' + stepName).style.display = 'block';
    
    // Update progress
    currentStep = steps.indexOf(stepName);
    updateProgress();
    
    // Update subtitle
    const subtitles = {
      'api-keys': 'Enter your API keys',
      'features': 'Choose which features to enable',
      'persona': 'Customize your bot personality',
      'qr-code': 'Connect to WhatsApp',
      'complete': 'Setup complete!'
    };
    document.getElementById('subtitle').textContent = subtitles[stepName];
  }
  
  function updateProgress() {
    document.querySelectorAll('.step').forEach((step, idx) => {
      step.classList.remove('active', 'completed');
      if (idx < currentStep) step.classList.add('completed');
      if (idx === currentStep) step.classList.add('active');
    });
    document.querySelectorAll('.step-divider').forEach((div, idx) => {
      div.classList.remove('completed');
      if (idx < currentStep) div.classList.add('completed');
    });
  }
  
  function validateStep(step) {
    if (step === 'api-keys') {
      const anthropic = document.getElementById('anthropicApiKey').value.trim();
      const openai = document.getElementById('openaiApiKey').value.trim();
      if (!anthropic || !openai) {
        showStatus('Please enter both Anthropic and OpenAI API keys', 'error');
        return false;
      }
    }
    return true;
  }
  
  function showStatus(msg, type) {
    const status = document.getElementById('status');
    status.textContent = msg;
    status.className = 'status ' + type;
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 5000);
  }
  
  // Save and connect
  async function saveAndConnect() {
    // Collect all config
    const config = {
      apiKeys: {
        anthropicApiKey: document.getElementById('anthropicApiKey').value.trim(),
        openaiApiKey: document.getElementById('openaiApiKey').value.trim(),
        geminiApiKey: document.getElementById('geminiApiKey').value.trim(),
        serperApiKey: document.getElementById('serperApiKey').value.trim(),
      },
      features: {
        urlSummarization: document.getElementById('ff_urlSummarization').checked,
        stickerCreation: document.getElementById('ff_stickerCreation').checked,
        reminderSystem: document.getElementById('ff_reminderSystem').checked,
        messageChunking: document.getElementById('ff_messageChunking').checked,
        intentClassification: document.getElementById('ff_intentClassification').checked,
        pollCreator: document.getElementById('ff_pollCreator').checked,
        semanticMemory: document.getElementById('ff_semanticMemory').checked,
        autoMemoryExtraction: document.getElementById('ff_autoMemoryExtraction').checked,
        conversationSummaries: document.getElementById('ff_conversationSummaries').checked,
        multiImageAnalysis: document.getElementById('ff_multiImageAnalysis').checked,
        videoAnalysis: document.getElementById('ff_videoAnalysis').checked,
        codeExecution: document.getElementById('ff_codeExecution').checked,
        calendarIntegration: document.getElementById('ff_calendarIntegration').checked,
        groupAdminControls: document.getElementById('ff_groupAdminControls').checked,
        groupKnowledgeBase: document.getElementById('ff_groupKnowledgeBase').checked,
      },
      persona: {
        botName: document.getElementById('botName').value.trim() || 'Buddy',
        botEmoji: document.getElementById('botEmoji').value.trim() || '🤖',
        personalityStyle: document.querySelector('input[name="personalityStyle"]:checked').value,
        language: document.getElementById('language').value,
        responseVerbosity: verbosityMap[document.getElementById('verbosity').value],
        customInstructions: document.getElementById('customInstructions').value.trim(),
        allowedNumbers: 'all',
        setupCompleted: true,
      }
    };
    
    try {
      // Save configuration
      const res = await fetch('/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      // Move to QR code step
      goToStep('qr-code');
      
      // Start polling for QR code
      pollForQR();
      
    } catch (err) {
      showStatus('Error: ' + err.message, 'error');
    }
  }
  
  // Poll for QR code
  async function pollForQR() {
    const container = document.getElementById('qrContainer');
    
    const checkQR = async () => {
      try {
        const res = await fetch('/qr-code');
        if (res.ok) {
          const data = await res.json();
          if (data.qrCode) {
            container.innerHTML = '<div class="qr-code">' + data.qrCode + '</div>';
          }
          if (data.connected) {
            goToStep('complete');
            return;
          }
        }
        setTimeout(checkQR, 2000);
      } catch {
        setTimeout(checkQR, 2000);
      }
    };
    
    checkQR();
  }
</script>
</body>
</html>`;
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === 'win32' ? `start ${url}` :
    platform === 'darwin' ? `open ${url}` :
    `xdg-open ${url}`;
  exec(cmd, (err) => {
    if (err) {
      console.log(`  Could not auto-open browser. Please visit: ${url}`);
    }
  });
}

// Generate QR code endpoint
let qrCodeData: string | null = null;
let isConnected = false;

export function setQRCode(qr: string): void {
  qrCodeData = qr;
}

export function setConnected(connected: boolean): void {
  isConnected = connected;
}

export function runWebWizard(): Promise<{ persona: PersonaConfig; apiKeys: Record<string, string>; features: Record<string, boolean> }> {
  return new Promise((resolve, reject) => {
    // Declare these at the top so they're accessible in all handlers
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let configSaved = false;
    
    const server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      // Serve main page
      if (req.method === 'GET' && (req.url === '/' || req.url === '')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getHTML());
        return;
      }
      
      // QR code endpoint
      if (req.method === 'GET' && req.url === '/qr-code') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          qrCode: qrCodeData,
          connected: isConnected,
        }));
        return;
      }

      // Save configuration
      if (req.method === 'POST' && req.url === '/save') {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            
            // Validate persona config
            const personaResult = PersonaConfigSchema.safeParse(parsed.persona);
            if (!personaResult.success) {
              res.writeHead(400, { 'Content-Type': 'text/plain' });
              res.end('Invalid persona configuration: ' + personaResult.error.message);
              return;
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));

            console.log('\n  ✅ Configuration saved from wizard!');
            console.log('  🔑 API Keys configured');
            console.log('  🎯 Features enabled:', Object.entries(parsed.features).filter(([_, v]) => v).length, '/ 15');
            console.log('  📱 Starting WhatsApp connection...\n');
            
            // Store config and mark as saved
            (global as any).__wizardConfig = {
              persona: personaResult.data,
              apiKeys: parsed.apiKeys,
              features: parsed.features,
            };
            configSaved = true;
            
            // RESOLVE IMMEDIATELY so main thread can start WhatsApp connection
            // The server stays running for QR code polling
            if (timeout) clearTimeout(timeout);
            resolve((global as any).__wizardConfig);
          } catch {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid JSON');
          }
        });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    timeout = setTimeout(() => {
      server.close();
      reject(new Error('Setup wizard timed out after 10 minutes'));
    }, TIMEOUT_MS);

    server.listen(DEFAULT_PORT, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : DEFAULT_PORT;
      const url = `http://localhost:${port}`;
      console.log(`\n  🧙 Setup wizard running at: ${url}`);
      console.log('  🌐 Opening browser...\n');
      openBrowser(url);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        server.listen(0, () => {
          const addr = server.address();
          const port = typeof addr === 'object' && addr ? addr.port : 0;
          const url = `http://localhost:${port}`;
          console.log(`\n  Port ${DEFAULT_PORT} in use, using: ${url}`);
          console.log('  Opening browser...\n');
          openBrowser(url);
        });
      } else {
        if (timeout) clearTimeout(timeout);
        reject(err);
      }
    });
    
    // Keep server running for QR code polling
    // Close it when WhatsApp connects
    checkInterval = setInterval(() => {
      if (isConnected && configSaved) {
        if (checkInterval) clearInterval(checkInterval);
        if (timeout) clearTimeout(timeout);
        console.log('\n  ✅ WhatsApp connected! Closing wizard server...\n');
        server.close();
      }
    }, 1000);
  });
}
