import { createClient } from "@supabase/supabase-js";
import type {
  Call,
  InsertCall,
  TranscriptMessage,
  InsertTranscriptMessage,
  Voice,
  InsertVoice,
} from "@shared/schema";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

function mapRowToCall(row: any): Call {
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    prompt: row.prompt,
    status: row.status,
    duration: row.duration,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
    voiceId: row.voice_id,
    voiceName: row.voice_name,
    pollyVoice: row.polly_voice,
    voiceProvider: row.voice_provider,
    deepgramVoice: row.deepgram_voice,
    twilioCallSid: row.twilio_call_sid,
    recordingUrl: row.recording_url,
    summary: row.summary,
    emailRecipient: row.email_recipient,
    listenUrl: row.listen_url,
    controlUrl: row.control_url,
    callType: row.call_type,
    callerName: row.caller_name,
  };
}

function mapCallToRow(call: Partial<Call>): Record<string, any> {
  const row: Record<string, any> = {};
  if (call.phoneNumber !== undefined) row.phone_number = call.phoneNumber;
  if (call.prompt !== undefined) row.prompt = call.prompt;
  if (call.status !== undefined) row.status = call.status;
  if (call.duration !== undefined) row.duration = call.duration;
  if (call.startedAt !== undefined) row.started_at = call.startedAt;
  if (call.endedAt !== undefined) row.ended_at = call.endedAt;
  if (call.voiceId !== undefined) row.voice_id = call.voiceId;
  if (call.voiceName !== undefined) row.voice_name = call.voiceName;
  if (call.pollyVoice !== undefined) row.polly_voice = call.pollyVoice;
  if (call.voiceProvider !== undefined) row.voice_provider = call.voiceProvider;
  if (call.deepgramVoice !== undefined) row.deepgram_voice = call.deepgramVoice;
  if (call.twilioCallSid !== undefined) row.twilio_call_sid = call.twilioCallSid;
  if (call.recordingUrl !== undefined) row.recording_url = call.recordingUrl;
  if (call.summary !== undefined) row.summary = call.summary;
  if (call.emailRecipient !== undefined) row.email_recipient = call.emailRecipient;
  if (call.listenUrl !== undefined) row.listen_url = call.listenUrl;
  if (call.controlUrl !== undefined) row.control_url = call.controlUrl;
  if (call.callType !== undefined) row.call_type = call.callType;
  if (call.callerName !== undefined) row.caller_name = call.callerName;
  return row;
}

function mapRowToTranscript(row: any): TranscriptMessage {
  return {
    id: row.id,
    callId: row.call_id,
    speaker: row.speaker,
    text: row.text,
    timestamp: new Date(row.timestamp),
  };
}

function mapRowToVoice(row: any): Voice {
  return {
    voiceId: row.voice_id,
    name: row.name,
    previewUrl: row.preview_url,
  };
}

export interface IStorage {
  createCall(call: InsertCall): Promise<Call>;
  getCall(id: string): Promise<Call | undefined>;
  getCallByVapiId(vapiCallId: string): Promise<Call | undefined>;
  updateCallStatus(id: string, status: string, duration?: number, endedAt?: Date): Promise<void>;
  updateCall(id: string, updates: Partial<Call>): Promise<void>;
  updateCallTwilioSid(id: string, twilioSid: string): Promise<void>;
  updateCallRecording(id: string, recordingUrl: string): Promise<void>;
  updateCallSummary(id: string, summary: string): Promise<void>;
  addTranscriptMessage(message: InsertTranscriptMessage): Promise<TranscriptMessage>;
  getTranscriptByCallId(callId: string): Promise<TranscriptMessage[]>;
  upsertVoice(voice: InsertVoice): Promise<Voice>;
  getAllVoices(): Promise<Voice[]>;
  getVoice(voiceId: string): Promise<Voice | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createCall(insertCall: InsertCall): Promise<Call> {
    const row: Record<string, any> = {
      phone_number: insertCall.phoneNumber,
      prompt: insertCall.prompt,
      status: insertCall.status || "idle",
      duration: insertCall.duration || 0,
    };
    if (insertCall.voiceId) row.voice_id = insertCall.voiceId;
    if (insertCall.voiceName) row.voice_name = insertCall.voiceName;
    if (insertCall.pollyVoice) row.polly_voice = insertCall.pollyVoice;
    if (insertCall.voiceProvider) row.voice_provider = insertCall.voiceProvider;
    if (insertCall.deepgramVoice) row.deepgram_voice = insertCall.deepgramVoice;
    if (insertCall.emailRecipient !== undefined) row.email_recipient = insertCall.emailRecipient;
    if (insertCall.callType) row.call_type = insertCall.callType;
    if (insertCall.callerName !== undefined) row.caller_name = insertCall.callerName;

    const { data, error } = await supabase
      .from("calls")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Failed to create call: ${error.message}`);
    return mapRowToCall(data);
  }

  async getCall(id: string): Promise<Call | undefined> {
    const { data, error } = await supabase
      .from("calls")
      .select()
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Failed to get call: ${error.message}`);
    return data ? mapRowToCall(data) : undefined;
  }

  async getCallByVapiId(vapiCallId: string): Promise<Call | undefined> {
    const { data, error } = await supabase
      .from("calls")
      .select()
      .eq("twilio_call_sid", vapiCallId)
      .maybeSingle();

    if (error) throw new Error(`Failed to get call by Vapi ID: ${error.message}`);
    return data ? mapRowToCall(data) : undefined;
  }

  async updateCallStatus(
    id: string,
    status: string,
    duration?: number,
    endedAt?: Date,
  ): Promise<void> {
    const updates: Record<string, any> = { status };
    if (duration !== undefined) updates.duration = duration;
    if (endedAt) updates.ended_at = endedAt.toISOString();

    const { error } = await supabase
      .from("calls")
      .update(updates)
      .eq("id", id);

    if (error) throw new Error(`Failed to update call status: ${error.message}`);
  }

  async updateCall(id: string, updates: Partial<Call>): Promise<void> {
    const row = mapCallToRow(updates);
    if (Object.keys(row).length === 0) return;

    const { error } = await supabase
      .from("calls")
      .update(row)
      .eq("id", id);

    if (error) throw new Error(`Failed to update call: ${error.message}`);
  }

  async updateCallTwilioSid(id: string, twilioSid: string): Promise<void> {
    const { error } = await supabase
      .from("calls")
      .update({ twilio_call_sid: twilioSid })
      .eq("id", id);

    if (error) throw new Error(`Failed to update Twilio SID: ${error.message}`);
  }

  async updateCallRecording(id: string, recordingUrl: string): Promise<void> {
    const { error } = await supabase
      .from("calls")
      .update({ recording_url: recordingUrl })
      .eq("id", id);

    if (error) throw new Error(`Failed to update recording: ${error.message}`);
  }

  async updateCallSummary(id: string, summary: string): Promise<void> {
    const { error } = await supabase
      .from("calls")
      .update({ summary })
      .eq("id", id);

    if (error) throw new Error(`Failed to update summary: ${error.message}`);
  }

  async addTranscriptMessage(
    message: InsertTranscriptMessage,
  ): Promise<TranscriptMessage> {
    const { data, error } = await supabase
      .from("transcript_messages")
      .insert({
        call_id: message.callId,
        speaker: message.speaker,
        text: message.text,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add transcript: ${error.message}`);
    return mapRowToTranscript(data);
  }

  async getTranscriptByCallId(callId: string): Promise<TranscriptMessage[]> {
    const { data, error } = await supabase
      .from("transcript_messages")
      .select()
      .eq("call_id", callId)
      .order("timestamp", { ascending: true });

    if (error) throw new Error(`Failed to get transcript: ${error.message}`);
    return (data || []).map(mapRowToTranscript);
  }

  async upsertVoice(voice: InsertVoice): Promise<Voice> {
    const { data, error } = await supabase
      .from("voices")
      .upsert(
        {
          voice_id: voice.voiceId,
          name: voice.name,
          preview_url: voice.previewUrl || null,
        },
        { onConflict: "voice_id" },
      )
      .select()
      .single();

    if (error) throw new Error(`Failed to upsert voice: ${error.message}`);
    return mapRowToVoice(data);
  }

  async getAllVoices(): Promise<Voice[]> {
    const { data, error } = await supabase.from("voices").select();

    if (error) throw new Error(`Failed to get voices: ${error.message}`);
    return (data || []).map(mapRowToVoice);
  }

  async getVoice(voiceId: string): Promise<Voice | undefined> {
    const { data, error } = await supabase
      .from("voices")
      .select()
      .eq("voice_id", voiceId)
      .maybeSingle();

    if (error) throw new Error(`Failed to get voice: ${error.message}`);
    return data ? mapRowToVoice(data) : undefined;
  }
}

export const storage = new DatabaseStorage();
