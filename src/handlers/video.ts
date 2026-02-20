/**
 * Video Analysis Handler
 * 
 * Extracts keyframes from videos and analyzes them using Gemini Vision (primary)
 * Falls back to Claude Vision if Gemini fails or isn't available.
 */

import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import type { MessageContext } from '../llm/types.js';
import { getChatProvider } from '../llm/index.js';
import { getGeminiProvider } from '../llm/gemini.js';
import { isEnabled } from '../config/index.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import pino from 'pino';

const logger = pino({ name: 'video-handler' });
const execFileAsync = promisify(execFile);

// Configuration
const MAX_VIDEO_SIZE_MB = 50;
const FRAME_COUNT = 5; // Number of keyframes to extract
const SUPPORTED_MIME_TYPES = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-matroska'];

interface VideoAnalysisResult {
  success: boolean;
  response: string;
  error?: string;
}

/**
 * Check if ffmpeg is available on the system
 */
async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract keyframes from a video file using ffmpeg
 */
async function extractKeyframes(
  videoPath: string, 
  outputDir: string, 
  frameCount: number
): Promise<string[]> {
  // Get video duration
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ]);
  
  const duration = parseFloat(stdout.trim());
  const interval = duration / (frameCount + 1);
  const framePaths: string[] = [];

  // Extract frames at even intervals
  for (let i = 1; i <= frameCount; i++) {
    const timestamp = interval * i;
    const framePath = join(outputDir, `frame_${i.toString().padStart(3, '0')}.jpg`);
    
    await execFileAsync('ffmpeg', [
      '-i', videoPath,
      '-ss', timestamp.toString(),
      '-vframes', '1',
      '-q:v', '2', // High quality
      '-y', // Overwrite
      framePath,
    ]);
    
    framePaths.push(framePath);
  }

  return framePaths;
}

/**
 * Read image file and convert to base64
 */
async function imageToBase64(imagePath: string): Promise<string> {
  const buffer = await fs.readFile(imagePath);
  return buffer.toString('base64');
}

/**
 * Analyze video frames using Gemini Vision (Primary)
 */
async function analyzeFramesWithGemini(
  framePaths: string[],
  caption?: string
): Promise<string> {
  const gemini = getGeminiProvider();
  
  // Build prompt
  let prompt = `I've extracted ${framePaths.length} keyframes from a video. Please analyze what you see in these frames and provide a comprehensive description of the video content.`;
  
  if (caption) {
    prompt += `\n\nUser's question: "${caption}"`;
  }
  
  prompt += `\n\nDescribe:
- What's happening in the video
- Key objects, people, or events visible
- Any text or dialogue shown
- Overall context and setting
- Notable actions or movements`;

  // Build parts with all frames as inline images
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];

  // Add each frame as an inline image
  for (const framePath of framePaths) {
    const base64Data = await imageToBase64(framePath);
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data,
      },
    });
  }

  const response = await gemini['ai'].models.generateContent({
    model: gemini['model'],
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: 'You are a video analysis assistant. You analyze keyframes extracted from videos and provide detailed, accurate descriptions of what the video contains. Be observant and specific.',
      maxOutputTokens: 1500,
    },
  });

  return response.text ?? 'No analysis available';
}

/**
 * Analyze video frames using Claude Vision (Fallback)
 */
async function analyzeFramesWithClaude(
  framePaths: string[],
  caption?: string
): Promise<string> {
  const chatProvider = getChatProvider();
  
  // Convert frames to base64
  const frameData = await Promise.all(
    framePaths.map(async (path, index) => ({
      index: index + 1,
      base64: await imageToBase64(path),
    }))
  );

  // Build prompt with all frames
  let prompt = `I've extracted ${framePaths.length} keyframes from a video. Please analyze what you see in these frames and provide a comprehensive description of the video content.`;
  
  if (caption) {
    prompt += `\n\nUser's question: "${caption}"`;
  }
  
  prompt += `\n\nDescribe:
- What's happening in the video
- Key objects, people, or events visible
- Any text or dialogue shown
- Overall context and setting
- Notable actions or movements`;

  // Build message content with images
  const content: Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> = [
    { type: 'text', text: prompt },
  ];

  // Add each frame as an image
  for (const frame of frameData) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: frame.base64,
      },
    });
  }

  const response = await chatProvider.chat({
    systemPrompt: 'You are a video analysis assistant. You analyze keyframes extracted from videos and provide detailed, accurate descriptions of what the video contains. Be observant and specific.',
    messages: [
      {
        role: 'user',
        content: content as any,
      },
    ],
    maxTokens: 1500,
  });

  return response.content;
}

/**
 * Analyze frames with Gemini (primary) or Claude (fallback)
 */
async function analyzeFrames(
  framePaths: string[],
  caption?: string
): Promise<{ analysis: string; provider: string }> {
  // Try Gemini first (primary)
  try {
    const gemini = getGeminiProvider();
    const analysis = await analyzeFramesWithGemini(framePaths, caption);
    logger.info('Video analyzed using Gemini (primary)');
    return { analysis, provider: 'Gemini' };
  } catch (geminiError) {
    logger.warn({ error: geminiError }, 'Gemini analysis failed, falling back to Claude');
    
    // Fallback to Claude
    try {
      const analysis = await analyzeFramesWithClaude(framePaths, caption);
      logger.info('Video analyzed using Claude (fallback)');
      return { analysis, provider: 'Claude' };
    } catch (claudeError) {
      logger.error({ error: claudeError }, 'Both Gemini and Claude failed');
      throw new Error('Failed to analyze video with both providers');
    }
  }
}

/**
 * Clean up temporary files
 */
async function cleanup(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    logger.warn({ error, tempDir }, 'Failed to cleanup temp files');
  }
}

/**
 * Handle video message analysis
 */
export async function handleVideoMessage(
  sock: WASocket,
  message: WAMessage,
  context: MessageContext
): Promise<VideoAnalysisResult> {
  // Check if feature is enabled
  if (!isEnabled('videoAnalysis')) {
    return {
      success: true,
      response: "🎥 Video analysis is disabled. Enable it with FF_VIDEO_ANALYSIS=true in your .env file.",
    };
  }

  // Check if ffmpeg is available
  const hasFfmpeg = await isFfmpegAvailable();
  if (!hasFfmpeg) {
    return {
      success: true,
      response: "🎥 To analyze videos, please install ffmpeg:\n\n**Windows:**\n```\nwinget install Gyan.FFmpeg\n```\n\n**Mac:**\n```\nbrew install ffmpeg\n```\n\n**Ubuntu/Debian:**\n```\nsudo apt install ffmpeg\n```",
    };
  }

  let tempDir: string | null = null;

  try {
    // Show typing indicator
    await sock.sendPresenceUpdate('composing', context.chatJid);

    // Get video info
    const videoMessage = message.message?.videoMessage;
    if (!videoMessage) {
      return {
        success: false,
        response: "I couldn't find the video in your message.",
      };
    }

    // Check file size (rough estimate)
    const fileLength = videoMessage.fileLength;
    if (fileLength && Number(fileLength) > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      return {
        success: false,
        response: `🎥 The video is too large. Please send a video under ${MAX_VIDEO_SIZE_MB}MB.`,
      };
    }

    logger.info({
      chat: context.chatJid,
      seconds: videoMessage.seconds,
      caption: videoMessage.caption,
    }, 'Processing video');

    // Create temp directory
    tempDir = await fs.mkdtemp(join(tmpdir(), 'buddy-video-'));
    const videoPath = join(tempDir, 'input.mp4');

    // Download video
    const videoBuffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      {
        logger: logger as any,
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    if (!Buffer.isBuffer(videoBuffer)) {
      return {
        success: false,
        response: "I couldn't download the video. Please try sending it again.",
      };
    }

    // Save video to temp file
    await fs.writeFile(videoPath, videoBuffer);

    // Extract keyframes
    logger.info({ tempDir }, 'Extracting keyframes...');
    const framePaths = await extractKeyframes(videoPath, tempDir, FRAME_COUNT);

    logger.info({ frameCount: framePaths.length }, 'Analyzing frames...');
    
    // Analyze frames (Gemini primary, Claude fallback)
    const { analysis, provider } = await analyzeFrames(framePaths, videoMessage.caption || undefined);

    // Build response
    const duration = videoMessage.seconds ? `${videoMessage.seconds}s` : 'unknown';
    let response = `🎥 *Video Analysis* (${duration})\n`;
    response += `_Analyzed with ${provider}_\n\n`;
    response += analysis;
    response += `\n\n_Analyzed ${FRAME_COUNT} keyframes from your video._`;

    await sock.sendPresenceUpdate('paused', context.chatJid);

    // Send response
    await sock.sendMessage(context.chatJid, { text: response }, { quoted: message });

    logger.info({ chat: context.chatJid, provider }, 'Video analysis complete');

    return {
      success: true,
      response: '', // Already sent
    };

  } catch (error) {
    logger.error({ error }, 'Video analysis failed');
    
    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});

    return {
      success: false,
      response: "Sorry, I had trouble analyzing that video. It might be in an unsupported format or corrupted.",
      error: error instanceof Error ? error.message : 'Unknown error',
    };

  } finally {
    // Cleanup
    if (tempDir) {
      await cleanup(tempDir);
    }
  }
}

/**
 * Check if video analysis is available (ffmpeg installed)
 */
export async function isVideoAnalysisAvailable(): Promise<boolean> {
  return await isFfmpegAvailable();
}
