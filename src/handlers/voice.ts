import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getTranscriptionProvider, type MessageContext } from '../llm/index.js';
import { handleTextMessage, type TextHandlerResult } from './text.js';
import pino from 'pino';

const logger = pino({ name: 'voice-handler' });

export interface VoiceHandlerResult extends TextHandlerResult {
  transcription?: string;
  duration?: number;
}

export async function handleVoiceMessage(
  sock: WASocket,
  message: WAMessage,
  context: MessageContext
): Promise<VoiceHandlerResult> {
  const transcriptionProvider = getTranscriptionProvider();

  try {
    // Show recording indicator while processing
    await sock.sendPresenceUpdate('recording', context.chatJid);

    // Download the audio message
    const audioBuffer = await downloadMediaMessage(
      message,
      'buffer',
      {}
    ) as Buffer;

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Failed to download voice message');
    }

    logger.info({
      size: audioBuffer.length,
      chat: context.chatJid,
    }, 'Downloaded voice message');

    // Determine mime type (WhatsApp voice notes are usually opus/ogg)
    const audioMessage = message.message?.audioMessage;
    const mimeType = audioMessage?.mimetype || 'audio/ogg';

    // Transcribe the audio
    const transcription = await transcriptionProvider.transcribe({
      audioBuffer,
      mimeType,
    });

    logger.info({
      text: transcription.text.slice(0, 100),
      duration: transcription.duration,
    }, 'Transcribed voice message');

    // Handle the transcribed text as a regular message, respond with voice
    const voiceContext = { ...context, respondWithVoice: true };
    const textResult = await handleTextMessage(
      sock,
      message,
      transcription.text,
      voiceContext
    );

    return {
      ...textResult,
      transcription: transcription.text,
      duration: transcription.duration,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to handle voice message');

    // Stop presence update
    await sock.sendPresenceUpdate('paused', context.chatJid).catch(() => {});

    return {
      response: "Sorry, I couldn't process that voice note. Could you type your message instead?",
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
