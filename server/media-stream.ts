import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";
import { createClient } from "@deepgram/sdk";
import { randomUUID } from "crypto";
import alawmulaw from "alawmulaw";

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);

interface MediaStreamSession {
  callId: string;
  streamSid: string;
  twilioWs: WebSocket;
  deepgramConnection?: any;
  elevenLabsWs?: WebSocket;
  audioBuffer: Buffer[];
  transcriptBuffer: string;
  conversationHistory: any[];
  isProcessing: boolean;
  lastSpeechTime: number;
  voiceSettings: {
    provider: "polly" | "deepgram" | "elevenlabs";
    voiceId?: string;
    pollyVoice?: string;
    deepgramVoice?: string;
  };
}

const activeSessions = new Map<string, MediaStreamSession>();

// Helper: Convert μ-law to PCM16
function mulawToPcm(mulawBuffer: Buffer): Buffer {
  const decoded = alawmulaw.mulaw.decode(mulawBuffer);
  return Buffer.from(decoded);
}

// Helper: Convert PCM16 to μ-law
function pcmToMulaw(pcmBuffer: Buffer): Buffer {
  const int16Array = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
  const encoded = alawmulaw.mulaw.encode(int16Array);
  return Buffer.from(encoded);
}

// Helper: Build system prompt (from existing routes.ts logic)
function buildSystemPrompt(userPrompt: string): string {
  const basePrompt = `You are James Martin, a professional virtual assistant making outbound calls...`;
  // TODO: Copy full system prompt from routes.ts
  return basePrompt.replace("[[ACCOUNT REFERENCE SECTION]]", userPrompt || "");
}

// Initialize Deepgram streaming STT
async function startDeepgramStreaming(session: MediaStreamSession) {
  console.log(`[MEDIA] Starting Deepgram streaming for call ${session.callId}`);
  
  const connection = deepgramClient.listen.live({
    model: "nova-2",
    language: "en-US",
    smart_format: true,
    interim_results: true,
    endpointing: 500, // ms of silence to detect end of speech
  });

  connection.on("open", () => {
    console.log(`[MEDIA] Deepgram connection opened for call ${session.callId}`);
  });

  connection.on("Results", async (data: any) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (!transcript) return;

    const isFinal = data.is_final;
    
    console.log(`[MEDIA] Deepgram ${isFinal ? 'FINAL' : 'interim'}: "${transcript}"`);

    if (isFinal) {
      session.transcriptBuffer += transcript + " ";
      session.lastSpeechTime = Date.now();

      // Save to database
      await storage.addTranscriptMessage({
        callId: session.callId,
        speaker: "caller",
        text: transcript,
      });

      // Check if we should process (detect end of utterance)
      setTimeout(() => {
        if (Date.now() - session.lastSpeechTime >= 800 && !session.isProcessing) {
          processUserSpeech(session);
        }
      }, 800);
    }
  });

  connection.on("error", (error: any) => {
    console.error(`[MEDIA] Deepgram error for call ${session.callId}:`, error);
  });

  connection.on("close", () => {
    console.log(`[MEDIA] Deepgram connection closed for call ${session.callId}`);
  });

  session.deepgramConnection = connection;
}

// Process user speech with OpenAI
async function processUserSpeech(session: MediaStreamSession) {
  if (session.isProcessing || !session.transcriptBuffer.trim()) return;
  
  session.isProcessing = true;
  const userText = session.transcriptBuffer.trim();
  session.transcriptBuffer = "";

  console.log(`[MEDIA] Processing speech for call ${session.callId}: "${userText}"`);

  try {
    // Add user message to conversation
    session.conversationHistory.push({
      role: "user",
      content: userText,
    });

    // Call OpenAI GPT-4.1
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(""), // TODO: Get from call record
        },
        ...session.conversationHistory,
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "press_button",
            description: "Press a button on the phone (DTMF tone) to navigate IVR menus",
            parameters: {
              type: "object",
              properties: {
                digit: {
                  type: "string",
                  description: "The digit to press (0-9, *, or #)",
                  enum: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "#"],
                },
                reason: {
                  type: "string",
                  description: "Why this button is being pressed",
                },
              },
              required: ["digit", "reason"],
            },
          },
        },
      ],
    });

    const message = completion.choices[0]?.message;
    let aiResponse = message?.content || "";

    // TODO: Handle function calls (DTMF button pressing)
    if (message?.tool_calls && message.tool_calls.length > 0) {
      console.log(`[MEDIA] AI wants to press buttons - not yet implemented in streaming mode`);
      // Will implement DTMF in streaming mode later
    }

    if (aiResponse) {
      session.conversationHistory.push({
        role: "assistant",
        content: aiResponse,
      });

      await storage.addTranscriptMessage({
        callId: session.callId,
        speaker: "ai",
        text: aiResponse,
      });

      // Generate and stream TTS audio
      await generateAndStreamTTS(session, aiResponse);
    }
  } catch (error) {
    console.error(`[MEDIA] Error processing speech:`, error);
  } finally {
    session.isProcessing = false;
  }
}

// Generate and stream TTS audio back to Twilio
async function generateAndStreamTTS(session: MediaStreamSession, text: string) {
  console.log(`[MEDIA] Generating TTS for call ${session.callId}: "${text}"`);

  // For now, use ElevenLabs with ulaw output format (direct Twilio compatibility)
  // TODO: Support Polly and Deepgram voices
  const ELEVENLABS_VOICE_ID = session.voiceSettings.voiceId || "Xb7hH8MSUJpSbSDYk0k2"; // Default voice
  
  try {
    const elevenLabsWs = new WebSocket(
      `wss://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream-input?model_id=eleven_flash_v2_5&output_format=ulaw_8000`
    );

    elevenLabsWs.on("open", () => {
      console.log(`[MEDIA] ElevenLabs WebSocket opened for call ${session.callId}`);

      // Initialize connection
      elevenLabsWs.send(JSON.stringify({
        text: " ",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
        },
        xi_api_key: process.env.ELEVENLABS_API_KEY,
      }));

      // Send text
      elevenLabsWs.send(JSON.stringify({
        text: text + " ",
        try_trigger_generation: true,
      }));

      // End stream
      elevenLabsWs.send(JSON.stringify({ text: "" }));
    });

    elevenLabsWs.on("message", (data: Buffer) => {
      const response = JSON.parse(data.toString());
      
      if (response.audio) {
        // Audio is already in ulaw_8000 format (base64 encoded)
        // Send directly to Twilio
        const message = {
          event: "media",
          streamSid: session.streamSid,
          media: {
            payload: response.audio, // Already base64 ulaw
          },
        };
        
        if (session.twilioWs.readyState === WebSocket.OPEN) {
          session.twilioWs.send(JSON.stringify(message));
        }
      }

      if (response.isFinal) {
        console.log(`[MEDIA] TTS complete for call ${session.callId}`);
        elevenLabsWs.close();
      }
    });

    elevenLabsWs.on("error", (error) => {
      console.error(`[MEDIA] ElevenLabs WebSocket error:`, error);
    });

  } catch (error) {
    console.error(`[MEDIA] TTS generation error:`, error);
  }
}

// Setup Media Streams WebSocket server
export function setupMediaStreamServer(httpServer: Server) {
  const mediaWss = new WebSocketServer({ 
    server: httpServer, 
    path: "/media-stream" 
  });

  mediaWss.on("connection", (ws: WebSocket) => {
    console.log("[MEDIA] New Twilio media stream connection");

    let session: MediaStreamSession | null = null;

    ws.on("message", async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());

        switch (data.event) {
          case "start":
            console.log("[MEDIA] Stream started:", data.start);
            
            // Extract call ID from custom parameters
            const callId = data.start.customParameters?.callId;
            if (!callId) {
              console.error("[MEDIA] No callId in stream start event");
              return;
            }

            // Get call details from database
            const call = await storage.getCall(callId);
            if (!call) {
              console.error(`[MEDIA] Call ${callId} not found`);
              return;
            }

            // Create session
            session = {
              callId,
              streamSid: data.start.streamSid,
              twilioWs: ws,
              audioBuffer: [],
              transcriptBuffer: "",
              conversationHistory: [],
              isProcessing: false,
              lastSpeechTime: 0,
              voiceSettings: {
                provider: (call.voiceProvider as any) || "elevenlabs",
                voiceId: call.voiceId || undefined,
                pollyVoice: call.pollyVoice || undefined,
                deepgramVoice: call.deepgramVoice || undefined,
              },
            };

            activeSessions.set(data.start.streamSid, session);

            // Start Deepgram streaming STT
            if (session) {
              await startDeepgramStreaming(session);
            }
            break;

          case "media":
            if (!session || !session.deepgramConnection) return;

            // Decode base64 μ-law audio
            const mulawAudio = Buffer.from(data.media.payload, "base64");
            
            // Convert μ-law to PCM16 for Deepgram
            const pcmAudio = mulawToPcm(mulawAudio);
            
            // Send to Deepgram
            if (session.deepgramConnection.getReadyState() === 1) {
              session.deepgramConnection.send(pcmAudio);
            }
            break;

          case "stop":
            console.log("[MEDIA] Stream stopped");
            if (session) {
              // Cleanup
              if (session.deepgramConnection) {
                session.deepgramConnection.finish();
              }
              activeSessions.delete(session.streamSid);
            }
            break;
        }
      } catch (error) {
        console.error("[MEDIA] Error processing message:", error);
      }
    });

    ws.on("close", () => {
      console.log("[MEDIA] Media stream connection closed");
      if (session) {
        if (session.deepgramConnection) {
          session.deepgramConnection.finish();
        }
        activeSessions.delete(session.streamSid);
      }
    });

    ws.on("error", (error) => {
      console.error("[MEDIA] WebSocket error:", error);
    });
  });

  console.log("[MEDIA] Media stream server initialized on /media-stream");
}
