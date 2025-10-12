import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import {
  type Call,
  type InsertCall,
  type TranscriptMessage,
  type InsertTranscriptMessage,
  type Voice,
  type InsertVoice,
  calls,
  transcriptMessages,
  voices,
} from "@shared/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

export interface IStorage {
  // Call methods
  createCall(call: InsertCall): Promise<Call>;
  getCall(id: string): Promise<Call | undefined>;
  updateCallStatus(id: string, status: string, duration?: number, endedAt?: Date): Promise<void>;
  updateCall(id: string, updates: Partial<Call>): Promise<void>;
  
  // Transcript methods
  addTranscriptMessage(message: InsertTranscriptMessage): Promise<TranscriptMessage>;
  getTranscriptByCallId(callId: string): Promise<TranscriptMessage[]>;
  
  // Voice methods
  upsertVoice(voice: InsertVoice): Promise<Voice>;
  getAllVoices(): Promise<Voice[]>;
  getVoice(voiceId: string): Promise<Voice | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Call methods
  async createCall(insertCall: InsertCall): Promise<Call> {
    const [call] = await db.insert(calls).values(insertCall).returning();
    return call;
  }

  async getCall(id: string): Promise<Call | undefined> {
    const [call] = await db.select().from(calls).where(eq(calls.id, id));
    return call;
  }

  async updateCallStatus(
    id: string,
    status: string,
    duration?: number,
    endedAt?: Date
  ): Promise<void> {
    await db
      .update(calls)
      .set({ status, ...(duration !== undefined && { duration }), ...(endedAt && { endedAt }) })
      .where(eq(calls.id, id));
  }

  async updateCall(id: string, updates: Partial<Call>): Promise<void> {
    await db
      .update(calls)
      .set(updates)
      .where(eq(calls.id, id));
  }

  // Transcript methods
  async addTranscriptMessage(
    message: InsertTranscriptMessage
  ): Promise<TranscriptMessage> {
    const [transcript] = await db
      .insert(transcriptMessages)
      .values(message)
      .returning();
    return transcript;
  }

  async getTranscriptByCallId(callId: string): Promise<TranscriptMessage[]> {
    return await db
      .select()
      .from(transcriptMessages)
      .where(eq(transcriptMessages.callId, callId));
  }

  // Voice methods
  async upsertVoice(voice: InsertVoice): Promise<Voice> {
    const [upserted] = await db
      .insert(voices)
      .values(voice)
      .onConflictDoUpdate({
        target: voices.voiceId,
        set: { name: voice.name, previewUrl: voice.previewUrl },
      })
      .returning();
    return upserted;
  }

  async getAllVoices(): Promise<Voice[]> {
    return await db.select().from(voices);
  }

  async getVoice(voiceId: string): Promise<Voice | undefined> {
    const [voice] = await db
      .select()
      .from(voices)
      .where(eq(voices.voiceId, voiceId));
    return voice;
  }
}

export const storage = new DatabaseStorage();
