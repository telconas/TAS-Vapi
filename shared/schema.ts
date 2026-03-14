import { z } from "zod";

export interface Call {
  id: string;
  phoneNumber: string;
  prompt: string;
  status: string;
  duration: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  voiceId: string | null;
  voiceName: string | null;
  pollyVoice: string | null;
  voiceProvider: string | null;
  deepgramVoice: string | null;
  twilioCallSid: string | null;
  recordingUrl: string | null;
  summary: string | null;
  emailRecipient: string | null;
  listenUrl: string | null;
  controlUrl: string | null;
  callType: string | null;
  callerName: string | null;
}

export interface InsertCall {
  phoneNumber: string;
  prompt: string;
  status?: string;
  duration?: number;
  voiceId?: string;
  voiceName?: string;
  pollyVoice?: string;
  voiceProvider?: string;
  deepgramVoice?: string;
  twilioCallSid?: string;
  recordingUrl?: string;
  summary?: string;
  emailRecipient?: string | null;
  listenUrl?: string;
  controlUrl?: string;
  callType?: string;
  callerName?: string | null;
}

export interface TranscriptMessage {
  id: string;
  callId: string;
  speaker: string;
  text: string;
  timestamp: Date;
}

export interface InsertTranscriptMessage {
  callId: string;
  speaker: string;
  text: string;
}

export interface Voice {
  voiceId: string;
  name: string;
  previewUrl: string | null;
}

export interface InsertVoice {
  voiceId: string;
  name: string;
  previewUrl?: string | null;
}

export interface WSMessage {
  type: "call_status" | "transcription" | "audio_chunk" | "error";
  data: any;
}

export interface CallStatusMessage {
  type: "call_status";
  data: {
    callId: string;
    status: "ringing" | "connected" | "ended";
    duration?: number;
  };
}

export interface TranscriptionMessage {
  type: "transcription";
  data: {
    callId: string;
    speaker: "ai" | "caller";
    text: string;
    timestamp: number;
  };
}

export interface AudioChunkMessage {
  type: "audio_chunk";
  data: {
    callId: string;
    audio: string;
  };
}
