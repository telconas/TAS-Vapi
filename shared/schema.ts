import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Call records table
export const calls = pgTable("calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone_number").notNull(),
  prompt: text("prompt").notNull(), // AI instructions for the call
  status: text("status").notNull(), // 'idle' | 'ringing' | 'connected' | 'ended'
  duration: integer("duration"), // in seconds
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  voiceId: text("voice_id"), // ElevenLabs voice ID (deprecated, keeping for backwards compat)
  voiceName: text("voice_name"), // ElevenLabs voice name (deprecated)
  pollyVoice: text("polly_voice"), // Amazon Polly voice (e.g., "Polly.Joanna")
  voiceProvider: text("voice_provider"), // 'polly' | 'deepgram' | 'elevenlabs'
  deepgramVoice: text("deepgram_voice"), // Deepgram Aura-2 voice (e.g., aura-2-asteria-en)
  twilioCallSid: text("twilio_call_sid"), // Twilio call identifier
  recordingUrl: text("recording_url"), // URL to call recording
  summary: text("summary"), // OpenAI-generated call summary
  emailRecipient: text("email_recipient"), // Email address to send summary to (optional)
  listenUrl: text("listen_url"), // Vapi WebSocket URL for live audio streaming
  controlUrl: text("control_url"), // Vapi HTTP URL for live call control
});

export const insertCallSchema = createInsertSchema(calls).omit({
  id: true,
  startedAt: true,
  endedAt: true,
});

export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof calls.$inferSelect;

// Transcript messages table
export const transcriptMessages = pgTable("transcript_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callId: varchar("call_id").notNull().references(() => calls.id),
  speaker: text("speaker").notNull(), // 'ai' | 'caller'
  text: text("text").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertTranscriptMessageSchema = createInsertSchema(transcriptMessages).omit({
  id: true,
  timestamp: true,
});

export type InsertTranscriptMessage = z.infer<typeof insertTranscriptMessageSchema>;
export type TranscriptMessage = typeof transcriptMessages.$inferSelect;

// ElevenLabs voices table (cached from API)
export const voices = pgTable("voices", {
  voiceId: varchar("voice_id").primaryKey(),
  name: text("name").notNull(),
  previewUrl: text("preview_url"),
});

export const insertVoiceSchema = createInsertSchema(voices);

export type InsertVoice = z.infer<typeof insertVoiceSchema>;
export type Voice = typeof voices.$inferSelect;

// WebSocket message types
export interface WSMessage {
  type: 'call_status' | 'transcription' | 'audio_chunk' | 'error';
  data: any;
}

export interface CallStatusMessage {
  type: 'call_status';
  data: {
    callId: string;
    status: 'ringing' | 'connected' | 'ended';
    duration?: number;
  };
}

export interface TranscriptionMessage {
  type: 'transcription';
  data: {
    callId: string;
    speaker: 'ai' | 'caller';
    text: string;
    timestamp: number;
  };
}

export interface AudioChunkMessage {
  type: 'audio_chunk';
  data: {
    callId: string;
    audio: string; // base64 encoded audio
  };
}
