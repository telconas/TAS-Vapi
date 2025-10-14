import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import twilio from "twilio";
import OpenAI from "openai";
import { ElevenLabsClient } from "elevenlabs";
import { randomUUID } from "crypto";
import { sendCallSummaryEmail } from "./sendgrid";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Log API key status (masked for security)
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
if (elevenLabsApiKey) {
  console.log(
    `ElevenLabs API key loaded: ${elevenLabsApiKey.substring(0, 8)}...${elevenLabsApiKey.substring(elevenLabsApiKey.length - 4)} (length: ${elevenLabsApiKey.length})`,
  );
} else {
  console.log("WARNING: ElevenLabs API key not found!");
}

const elevenLabsClient = new ElevenLabsClient({
  apiKey: elevenLabsApiKey,
});

interface ActiveCall {
  callId: string;
  phoneNumber: string;
  prompt: string;
  twilioCallSid?: string;
  openaiConversation: any[];
  ws: WebSocket;
  startTime: number;
}

const activeCalls = new Map<string, ActiveCall>();

// Helper function to build the full system prompt
function buildSystemPrompt(userInstructions: string): string {
  return `ROLE:
You are a professional virtual assistant speaking as **James Martin**, calling on behalf of the location listed in the account section below.  
Your job is to complete the specific task described in the "Task or Issue" section using the provided account information and email thread as reference.  

When specifically asked, please provide:
- Account number  
- Service address  
- Account PIN  
when verification is requested.  
**913-439-5811** is not associated with any account.

------------------------------------------------------------
CALL BEHAVIOR & SPEAKING STYLE:

- Speak calmly, clearly, and professionally.  
-Your goal is to use a few words as possible to get your point across.
-When waiting on hold, do not speak until you are connected with a live agent.
- When the call is initiated, you will always be speaking with a non-human automated system. Be patient and wait for instructions during the automated system portion of the call.  During this time, use short sentences, or a few words to get instructions across. Do not ask the automated system questions like "can you confirm, xyz?" or "is this correct, xyz?"
- Once connected to a live agent, you can then adjust your speaking style to be more human like since you are speaking with a real human at that point in the call.
-
- Wait for the other person or automated system to finish speaking before replying.  
- Avoid filler words (no "um," "uh").  
- When reading account numbers, say **two digits at a time**, pausing slightly.  
  Example: for "8506" say "eight five … zero six."  
- Stay polite and composed even if the agent is frustrated.  
- When the issue is resolved, confirm next steps and end the call courteously:  
  "Thank you for your help today. Have a great day."

------------------------------------------------------------
AUTOMATED SYSTEM NAVIGATION:

- Prefer touch-tone input, but use voice when asked a direct question. 
- You will almost always encounter an automated system before speaking with a live agent. Be patient and wait for instructions during the automated system portion of the call.  During this time, use short sentences, or a few words to get instructions across. 
- Once connected to a live agent, you can then adjust your speaking style to be more human like since you are speaking with a real human at that point in the call.
- Say "speak with agent" or "representative" to reach a human quicker than going through many automated prompts.
- Always provide the account number first (not the phone number).  
- Skip automated troubleshooting unless required ("It's a different issue for companies like Spectrum").  
- Use correct department names:
  - "Technical Support" → troubleshooting/outage  
  - "Billing or Account Services" → disconnects/billing issues  
  - "Customer Retention" → service changes

------------------------------------------------------------
LIVE AGENT INTRODUCTION:

When connected to a live agent, say:
> "Hello, this is James Martin calling on behalf of [location name]. Then wait for the agent to ask what the issue is. Only give one piece of information at a time."
-- If the agent asks for your name, say "James Martin."
-- If the agent asks for your relationship to the account, say "I am a vendor for [site name]."
-- If the agent asks for your phone number, say "913-439-5811."
-- If the agent asks for your email, say "jay pee em at telcon associates.com, that's tee ee el, see oh en as in nancy, associates dot com."
-- If the agent asks for your account number, say "The account number is [account number]."
-- If the agent asks for your service address, say "The service address is [service address]."
-- If the agent asks for your account PIN, say "The account PIN is [account PIN]."
-- If the agent asks for a brief summary of the task or issue, say "The task or issue is [short summary from the task or issue section]."

Be ready to provide:
- Account number  
- Service address  
- Account PIN  
- Short summary of the problem from the task or issue section  
-You may wait on hold during this phase of the call. Only speak when asked a question, unless prompted to do otherwise.

------------------------------------------------------------
ACCOUNT REFERENCE SECTION, SERVICE ADDRESS, CONTACT NAME AND PHONE, AND RELATED EMAIL THREAD:

${userInstructions}

------------------------------------------------------------
TASK OR ISSUE GUIDANCE:
Use the "Issue" description to drive your conversation flow.
Follow these patterns depending on the type:

1️⃣ **Troubleshooting (Internet/Connectivity)**  
Ask for remote reboot, signal check, and diagnostics.  
If unresolved, request a technician and a ticket number.

2️⃣ **Disconnect / Cancellation**  
Request to disconnect service (specify type and effective date).  
Confirm final bill, equipment return, and reference number.

3️⃣ **Billing / Payment**  
Address past due or payment confirmation.  
Request balance details or receipt confirmation.  
If discrepancy found, ask for review or supervisor.

4️⃣ **Service Change / Upgrade**  
Ask for available options, confirm pricing and activation date.  
Decline upsells unrelated to the task.

5️⃣ **Escalation or Miscellaneous**  
If issue doesn't match above, summarize clearly, request resolution or ticket number, and escalate politely if necessary.

------------------------------------------------------------
CALL ETIQUETTE:

- Always stay on topic.  
- Do not volunteer unrelated information.  
- Never agree to extra services or upgrades.  
- Keep responses short, do not over explain.
- Always document internally the outcome (confirmation number, resolution summary).

------------------------------------------------------------
REFERENCE: 
Hours: Monday–Friday 9 AM – 5 PM local time  
If outside hours, note for recall and end politely.

------------------------------------------------------------
TECHNICAL INSTRUCTIONS:

Keep responses concise and conversational, suitable for text-to-speech.

IMPORTANT: If you hear a phone menu (like 'Press 1 for Sales, Press 2 for Support'), use the press_button function to navigate the menu. You can press buttons 0-9, *, or #.

ZIP CODE ENTRY: If asked for a zip code, look in the account section above for the zip code. Enter ALL 5 digits one at a time using the press_button function (e.g., if zip is 12345, press 1, then 2, then 3, then 4, then 5).`;
}

// Helper function to generate and save ElevenLabs audio
async function generateAndSaveAudio(
  text: string,
  voiceId: string,
  filename: string,
): Promise<string> {
  // Use REST API directly instead of buggy SDK
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `ElevenLabs API error: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Ensure audio cache directory exists
  const audioCacheDir = "/tmp/audio-cache";
  if (!existsSync(audioCacheDir)) {
    mkdirSync(audioCacheDir, { recursive: true });
  }

  // Save to file
  const audioPath = join(audioCacheDir, filename);
  writeFileSync(audioPath, buffer);

  return `/api/audio/${filename}`;
}

// Helper function to generate and save Deepgram Aura TTS audio
async function generateDeepgramAudio(
  text: string,
  voice: string, // aura-2-{voice}-en (e.g., aura-2-asteria-en, aura-2-orion-en)
  filename: string,
): Promise<string> {
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    throw new Error("DEEPGRAM_API_KEY environment variable not set");
  }

  const response = await fetch(
    `https://api.deepgram.com/v1/speak?model=${voice}`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${deepgramApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Deepgram API error: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Ensure audio cache directory exists
  const audioCacheDir = "/tmp/audio-cache";
  if (!existsSync(audioCacheDir)) {
    mkdirSync(audioCacheDir, { recursive: true });
  }

  // Save to file
  const audioPath = join(audioCacheDir, filename);
  writeFileSync(audioPath, buffer);

  console.log(`Generated Deepgram audio: ${filename} (${buffer.length} bytes)`);

  return `/api/audio/${filename}`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Map to track WebSocket connections per session
  const wsClients = new Map<string, WebSocket>();

  // WebSocket server for real-time communication
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    console.log("WebSocket client connected");

    // Generate session ID for this connection
    const sessionId = randomUUID();
    wsClients.set(sessionId, ws);

    // Send session ID to client
    ws.send(
      JSON.stringify({
        type: "session",
        data: { sessionId },
      }),
    );

    // Set up ping interval to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000); // Ping every 30 seconds

    ws.on("pong", () => {
      // Connection is alive
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });

    ws.on("message", async (data: string) => {
      try {
        const message = JSON.parse(data.toString());
        console.log("Received WebSocket message:", message.type);

        // Handle operator instructions
        if (message.type === "instruction") {
          const { callId, instruction } = message.data;
          const activeCall = activeCalls.get(callId);

          if (activeCall) {
            // Add instruction to AI conversation context as a system message
            // This won't be transcribed or played to caller
            activeCall.openaiConversation.push({
              role: "system",
              content: `[OPERATOR INSTRUCTION - Not for caller]: ${instruction}`,
            });

            console.log(`Instruction added for call ${callId}: ${instruction}`);

            // Send success response
            ws.send(
              JSON.stringify({
                type: "instruction_response",
                data: {
                  success: true,
                  message: "Instruction added to AI context",
                },
              }),
            );
          } else {
            // Send error response
            ws.send(
              JSON.stringify({
                type: "instruction_response",
                data: {
                  success: false,
                  message: "Call not found or not active",
                },
              }),
            );
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
      clearInterval(pingInterval);
      wsClients.delete(sessionId);
    });
  });

  // Helper function to get the proper public host (for Twilio callbacks)
  function getPublicHost(req: Request): string {
    // Use REPLIT_DEV_DOMAIN for public access (Twilio can reach this),
    // fallback to host header for local development
    return process.env.REPLIT_DEV_DOMAIN || req.get("host") || "localhost:5000";
  }

  // Helper function to generate call summary using OpenAI
  async function generateCallSummary(callId: string) {
    console.error(`[SUMMARY] Generating summary for call ${callId}`);

    try {
      const call = await storage.getCall(callId);
      const transcripts = await storage.getTranscriptByCallId(callId);

      if (!call) {
        console.error(`[SUMMARY ERROR] Call ${callId} not found`);
        return;
      }

      // Filter out internal messages and format transcript
      const cleanTranscripts = transcripts
        .filter((t) => !t.text.startsWith("[INTERNAL:"))
        .map((t) => `${t.speaker === 'ai' ? 'JPM' : 'Representative'}: ${t.text}`)
        .join('\n');

      if (!cleanTranscripts || cleanTranscripts.trim().length === 0) {
        console.error(`[SUMMARY] No transcript content for call ${callId}`);
        return;
      }

      console.error(`[SUMMARY] Processing ${transcripts.length} transcript messages`);

      // Generate summary using OpenAI
      const summaryPrompt = `You are an AI assistant tasked with summarizing phone call transcripts. The caller is Jim Martin, referred to as JPM when summarizing. Summarize the contents of the call using bullet points for what transpires. Always get the name of the representative. The customer will always be referred to as JPM. Use full sentences, but do not use dashes to delineate sentences. Always include any account numbers, PIN numbers, service addresses, and phone numbers if mentioned on the call. No need to add things like: "the two parties exchanged pleasantries and the call ended". Stay to the main points of the call when summarizing.

Here is the transcript:

${cleanTranscripts}`;

      const completion = await openaiClient.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "user",
            content: summaryPrompt,
          },
        ],
        temperature: 0.3,
      });

      const summary = completion.choices[0]?.message?.content || "";

      if (summary) {
        // Store summary in database
        await storage.updateCall(callId, { summary });
        console.error(`[SUMMARY SUCCESS] ✓ Summary generated and saved for call ${callId}`);

        // Send email if recipient is specified
        if (call.emailRecipient) {
          console.error(`[EMAIL] Attempting to send summary to ${call.emailRecipient}`);
          await sendCallSummaryEmail(
            call.emailRecipient,
            call.phoneNumber,
            summary,
            call.duration || 0,
            call.recordingUrl || undefined
          );
        }
      } else {
        console.error(`[SUMMARY ERROR] No summary generated for call ${callId}`);
      }
    } catch (error) {
      console.error(
        "[SUMMARY ERROR] Exception generating call summary:",
        error,
      );
    }
  }

  // API: Get call details by ID
  app.get("/api/calls/:callId", async (req, res) => {
    try {
      const { callId } = req.params;
      const call = await storage.getCall(callId);

      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }

      // Replace Twilio recording URL with our proxy URL
      if (call.recordingUrl) {
        call.recordingUrl = `/api/recording-proxy/${callId}`;
      }

      res.json(call);
    } catch (error) {
      console.error("Error fetching call:", error);
      res.status(500).json({ error: "Failed to fetch call details" });
    }
  });

  // API: Proxy recording from Twilio with authentication
  app.get("/api/recording-proxy/:callId", async (req, res) => {
    try {
      const { callId } = req.params;
      const call = await storage.getCall(callId);

      if (!call || !call.recordingUrl) {
        return res.status(404).json({ error: "Recording not found" });
      }

      // Fetch recording from Twilio with authentication
      const auth = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
      ).toString("base64");
      const recordingResponse = await fetch(call.recordingUrl, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });

      if (!recordingResponse.ok) {
        throw new Error(
          `Twilio recording fetch failed: ${recordingResponse.status}`,
        );
      }

      // Stream the recording to the client
      res.setHeader("Content-Type", "audio/mpeg");
      const buffer = await recordingResponse.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Error proxying recording:", error);
      res.status(500).json({ error: "Failed to fetch recording" });
    }
  });

  // API: Serve generated audio files
  app.get("/api/audio/:filename", (req, res) => {
    const { filename } = req.params;

    // Validate filename to prevent path traversal
    const safeFilename = basename(filename);
    if (safeFilename !== filename || !safeFilename.endsWith(".mp3")) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const audioPath = join("/tmp/audio-cache", safeFilename);

    // Check if file exists
    if (!existsSync(audioPath)) {
      console.error(`Audio file not found: ${audioPath}`);
      return res.status(404).json({ error: "Audio file not found" });
    }

    // Set proper headers for audio playback and Twilio compatibility
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
    res.sendFile(audioPath);
  });

  // API: Get ElevenLabs voices
  app.get("/api/voices", async (req, res) => {
    try {
      const voicesResponse = await elevenLabsClient.voices.getAll();
      const voices = voicesResponse.voices.map((voice: any) => ({
        voiceId: voice.voice_id,
        name: voice.name,
        previewUrl: voice.preview_url,
      }));

      // Cache voices in database
      for (const voice of voices) {
        await storage.upsertVoice(voice);
      }

      res.json(voices);
    } catch (error) {
      console.error("Error fetching voices:", error);
      res.status(500).json({ error: "Failed to fetch voices" });
    }
  });

  // API: Generate voice preview audio
  app.get("/api/voices/:voiceId/preview", async (req, res) => {
    try {
      const { voiceId } = req.params;
      const previewText =
        "Hello! My name is James Martin and I am calling about an issue we are having at Avalon Bellevue. I was wondering if you could help troubleshoot the internet being down.";

      const apiKey = process.env.ELEVENLABS_API_KEY;
      console.log(
        `Preview request - API key exists: ${!!apiKey}, length: ${apiKey?.length}, first 8: ${apiKey?.substring(0, 8)}`,
      );

      // Use REST API directly instead of SDK
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: previewText,
            model_id: "eleven_monolingual_v1",
          }),
        },
      );

      console.log(`ElevenLabs API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`ElevenLabs API error body: ${errorText}`);
        throw new Error(
          `ElevenLabs API error: ${response.status} ${response.statusText}`,
        );
      }

      const buffer = await response.arrayBuffer();

      // Send as audio response
      res.setHeader("Content-Type", "audio/mpeg");
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Error generating voice preview:", error);
      res.status(500).json({ error: "Failed to generate voice preview" });
    }
  });

  // Allowlist of valid Polly voices
  const VALID_POLLY_VOICES = [
    "Polly.Joanna",
    "Polly.Matthew",
    "Polly.Salli",
    "Polly.Kendra",
    "Polly.Kimberly",
    "Polly.Ivy",
    "Polly.Joey",
    "Polly.Justin",
    "Polly.Amy",
    "Polly.Brian",
    "Polly.Emma",
    "Polly.Aditi",
    "Polly.Raveena",
    "Polly.Nicole",
    "Polly.Russell",
  ];

  // Allowlist of valid Deepgram Aura-2 voices
  const VALID_DEEPGRAM_VOICES = [
    "aura-2-asteria-en",
    "aura-2-luna-en",
    "aura-2-stella-en",
    "aura-2-athena-en",
    "aura-2-hera-en",
    "aura-2-orion-en",
    "aura-2-arcas-en",
    "aura-2-perseus-en",
    "aura-2-angus-en",
    "aura-2-orpheus-en",
    "aura-2-helios-en",
    "aura-2-zeus-en",
  ];

  // API: Start a new call
  app.post("/api/calls/start", async (req, res) => {
    try {
      const {
        phoneNumber,
        prompt,
        pollyVoice,
        deepgramVoice,
        elevenLabsVoice,
        voiceProvider,
        sessionId,
        emailRecipient,
      } = req.body;

      // Validate request
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      if (!prompt) {
        return res.status(400).json({ error: "AI prompt is required" });
      }

      // Determine voice provider and validate voices
      let validatedProvider = voiceProvider || "polly"; // Default to Polly
      let validatedPollyVoice: string | undefined;
      let validatedDeepgramVoice: string | undefined;
      let validatedElevenLabsVoice: string | undefined;

      if (validatedProvider === "deepgram") {
        // Validate Deepgram voice
        validatedDeepgramVoice =
          deepgramVoice && VALID_DEEPGRAM_VOICES.includes(deepgramVoice)
            ? deepgramVoice
            : "aura-2-asteria-en"; // Default to Asteria
      } else if (validatedProvider === "elevenlabs") {
        // Use ElevenLabs voice (validation happens when fetching from API)
        validatedElevenLabsVoice = elevenLabsVoice || undefined;
      } else {
        // Default to or validate Polly voice
        validatedProvider = "polly";
        validatedPollyVoice =
          pollyVoice && VALID_POLLY_VOICES.includes(pollyVoice)
            ? pollyVoice
            : "Polly.Joanna"; // Default to Joanna
      }

      // Validate environment variables
      if (
        !process.env.TWILIO_ACCOUNT_SID ||
        !process.env.TWILIO_AUTH_TOKEN ||
        !process.env.TWILIO_PHONE_NUMBER
      ) {
        return res
          .status(500)
          .json({ error: "Twilio credentials not configured" });
      }

      // Get WebSocket client for this session
      const wsClient = sessionId
        ? wsClients.get(sessionId)
        : Array.from(wsClients.values())[0];

      if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
        return res
          .status(500)
          .json({ error: "No WebSocket connection available" });
      }

      // Create call record in database
      const call = await storage.createCall({
        phoneNumber,
        prompt,
        status: "ringing",
        voiceProvider: validatedProvider,
        pollyVoice: validatedPollyVoice,
        deepgramVoice: validatedDeepgramVoice,
        voiceId: validatedElevenLabsVoice, // ElevenLabs voice ID
        duration: 0,
        emailRecipient: emailRecipient || undefined,
      });

      // Store active call info
      activeCalls.set(call.id, {
        callId: call.id,
        phoneNumber,
        prompt,
        openaiConversation: [],
        ws: wsClient,
        startTime: Date.now(),
      });

      // Make Twilio call with recording enabled
      const host = getPublicHost(req);
      const recordingCallbackUrl = `https://${host}/api/recording/${call.id}`;

      console.error(`[CALL SETUP] Using host: ${host}`);
      console.error(
        `[CALL SETUP] Recording callback URL: ${recordingCallbackUrl}`,
      );

      const twilioCall = await twilioClient.calls.create({
        from: "+19134395811",
        to: phoneNumber,
        url: `https://${host}/api/twiml/${call.id}`,
        statusCallback: `https://${host}/api/call-status/${call.id}`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        record: true,
        recordingChannels: "dual",
        recordingStatusCallback: recordingCallbackUrl,
      });

      // Update with Twilio call SID in database and active calls
      await storage.updateCall(call.id, { twilioCallSid: twilioCall.sid });

      const activeCall = activeCalls.get(call.id);
      if (activeCall) {
        activeCall.twilioCallSid = twilioCall.sid;
      }

      // Send status update via WebSocket
      wsClient.send(
        JSON.stringify({
          type: "call_status",
          data: {
            callId: call.id,
            status: "ringing",
          },
        }),
      );

      res.json({ callId: call.id, twilioCallSid: twilioCall.sid });
    } catch (error) {
      console.error("Error starting call:", error);
      res.status(500).json({ error: "Failed to start call" });
    }
  });

  // TwiML endpoint - Called by Twilio when call connects
  app.post("/api/twiml/:callId", async (req, res) => {
    const { callId } = req.params;

    try {
      // Get call details to access voiceId
      const call = await storage.getCall(callId);

      if (!call) {
        return res.status(404).send("Call not found");
      }

      // Start recording and gathering speech immediately - AI only speaks when asked a question
      // If gather times out, redirect back to continue listening (keeps call alive during hold)
      const host = getPublicHost(req);

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Record recordingTrack="both" recordingStatusCallback="https://${host}/api/twiml-recording/${callId}" />
  </Start>
  <Gather input="speech" timeout="60" speechTimeout="1" action="https://${host}/api/gather/${callId}" />
  <Redirect method="POST">https://${host}/api/gather/${callId}</Redirect>
</Response>`;

      res.type("text/xml");
      res.send(twiml);
    } catch (error) {
      console.error("Error generating TwiML:", error);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Record timeout="3" maxLength="30" playBeep="false" transcribe="true" transcribeCallback="https://${getPublicHost(req)}/api/transcribe/${callId}" />
</Response>`;
      res.type("text/xml");
      res.send(twiml);
    }
  });

  // Call status callback
  app.post("/api/call-status/:callId", async (req, res) => {
    const { callId } = req.params;
    const { CallStatus } = req.body;

    const activeCall = activeCalls.get(callId);

    if (CallStatus === "in-progress" && activeCall) {
      await storage.updateCallStatus(callId, "connected");

      activeCall.ws.send(
        JSON.stringify({
          type: "call_status",
          data: {
            callId,
            status: "connected",
          },
        }),
      );

      // AI only speaks when asked a question - no initial greeting
    } else if (CallStatus === "completed" && activeCall) {
      const duration = Math.floor((Date.now() - activeCall.startTime) / 1000);

      await storage.updateCallStatus(callId, "ended", duration, new Date());

      activeCall.ws.send(
        JSON.stringify({
          type: "call_status",
          data: {
            callId,
            status: "ended",
            duration,
          },
        }),
      );

      activeCalls.delete(callId);

      // Note: Webhook will be sent from recording callback once recording URL is available
    }

    res.sendStatus(200);
  });

  // Transcription callback from Twilio
  app.post("/api/transcribe/:callId", async (req, res) => {
    const { callId } = req.params;
    const { TranscriptionText, RecordingUrl } = req.body;

    const activeCall = activeCalls.get(callId);

    if (!activeCall || !TranscriptionText) {
      return res.sendStatus(200);
    }

    try {
      // Save caller's transcribed speech
      await storage.addTranscriptMessage({
        callId,
        speaker: "caller",
        text: TranscriptionText,
      });

      // Send to frontend
      activeCall.ws.send(
        JSON.stringify({
          type: "transcription",
          data: {
            callId,
            speaker: "caller",
            text: TranscriptionText,
            timestamp: Date.now(),
          },
        }),
      );

      // Generate AI response using the provided prompt
      activeCall.openaiConversation.push({
        role: "user",
        content: TranscriptionText,
      });

      const completion = await openaiClient.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(activeCall.prompt),
          },
          ...activeCall.openaiConversation,
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "press_button",
              description:
                "Press a button (DTMF tone) on the phone keypad to navigate phone menus or IVR systems",
              parameters: {
                type: "object",
                properties: {
                  digit: {
                    type: "string",
                    description: "The digit or symbol to press: 0-9, *, or #",
                    enum: [
                      "0",
                      "1",
                      "2",
                      "3",
                      "4",
                      "5",
                      "6",
                      "7",
                      "8",
                      "9",
                      "*",
                      "#",
                    ],
                  },
                  reason: {
                    type: "string",
                    description:
                      "Brief explanation of why pressing this button (e.g., 'Selecting English language option')",
                  },
                },
                required: ["digit", "reason"],
              },
            },
          },
        ],
        tool_choice: "auto",
      });

      const message = completion.choices[0]?.message;
      let aiResponse = message?.content || "";

      // Check if AI wants to press a button
      if (message?.tool_calls && message.tool_calls.length > 0) {
        // Add the assistant's tool call to conversation
        activeCall.openaiConversation.push({
          role: "assistant",
          content: message.content || null,
          tool_calls: message.tool_calls,
        });

        const toolResults = [];

        for (const toolCall of message.tool_calls) {
          if (
            toolCall.type === "function" &&
            toolCall.function.name === "press_button"
          ) {
            const args = JSON.parse(toolCall.function.arguments);
            let result = { success: false, message: "" };

            // Send DTMF tone through Twilio
            if (activeCall.twilioCallSid) {
              try {
                // Use playDtmf method which doesn't interrupt the call
                await twilioClient.calls(activeCall.twilioCallSid).update({
                  method: "POST",
                  url: `https://${getPublicHost(req)}/api/dtmf/${callId}?digit=${args.digit}`,
                });

                result = {
                  success: true,
                  message: `Pressed button ${args.digit} successfully`,
                };

                // Save button press to database for audit trail (hidden from UI)
                const buttonMessage = `[INTERNAL: Pressed button ${args.digit}] ${args.reason}`;
                await storage.addTranscriptMessage({
                  callId,
                  speaker: "ai",
                  text: buttonMessage,
                });

                // Note: Button press not sent to frontend WebSocket (hidden from live transcript UI)
              } catch (dtmfError) {
                console.error("Error sending DTMF:", dtmfError);
                result = {
                  success: false,
                  message: `Failed to press button: ${dtmfError}`,
                };
              }
            }

            toolResults.push({
              tool_call_id: toolCall.id,
              role: "tool" as const,
              content: JSON.stringify(result),
            });
          }
        }

        // Add tool results to conversation
        activeCall.openaiConversation.push(...toolResults);

        // Get follow-up response from AI after button press
        const followUpCompletion = await openaiClient.chat.completions.create({
          model: "gpt-4.1",
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(activeCall.prompt),
            },
            ...activeCall.openaiConversation,
          ],
        });

        aiResponse = followUpCompletion.choices[0]?.message?.content || "Done.";
      }

      if (!aiResponse) {
        aiResponse = "I understand.";
      }
      activeCall.openaiConversation.push({
        role: "assistant",
        content: aiResponse,
      });

      // Save AI response
      await storage.addTranscriptMessage({
        callId,
        speaker: "ai",
        text: aiResponse,
      });

      // Send to frontend
      activeCall.ws.send(
        JSON.stringify({
          type: "transcription",
          data: {
            callId,
            speaker: "ai",
            text: aiResponse,
            timestamp: Date.now(),
          },
        }),
      );

      // Generate ElevenLabs audio and play it back to caller
      const call = await storage.getCall(callId);
      if (call?.voiceId && activeCall.twilioCallSid) {
        try {
          // Generate and save audio
          const audioFilename = `${callId}-${Date.now()}.mp3`;
          const audioUrl = await generateAndSaveAudio(
            aiResponse,
            call.voiceId,
            audioFilename,
          );

          // Update call to play the AI response
          await twilioClient.calls(activeCall.twilioCallSid).update({
            method: "POST",
            url: `https://${getPublicHost(req)}/api/twiml-response/${callId}?audioUrl=${encodeURIComponent(audioUrl)}`,
          });
        } catch (audioError) {
          console.error("Error playing AI audio:", audioError);
        }
      }
    } catch (error) {
      console.error("Transcription processing error:", error);
    }

    res.sendStatus(200);
  });

  // Gather callback - Handles speech captured by <Gather> with barge-in support
  app.post("/api/gather/:callId", async (req, res) => {
    const { callId } = req.params;
    const { SpeechResult, Confidence } = req.body;

    const activeCall = activeCalls.get(callId);

    if (!activeCall || !SpeechResult) {
      // No speech detected (timeout or silence) - continue gathering to keep call alive
      // This allows the AI to stay on hold indefinitely (up to Twilio's 4-hour max call duration)
      console.log(
        `Call ${callId}: No speech detected, continuing gather loop (keeps call alive during hold)`,
      );
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="60" speechTimeout="1" action="https://${getPublicHost(req)}/api/gather/${callId}" />
  <Redirect method="POST">https://${getPublicHost(req)}/api/gather/${callId}</Redirect>
</Response>`;
      res.type("text/xml");
      return res.send(twiml);
    }

    try {
      const t0 = Date.now();
      console.log(
        `[LATENCY] Call ${callId}: Speech received - "${SpeechResult}"`,
      );

      // Save caller's speech
      await storage.addTranscriptMessage({
        callId,
        speaker: "caller",
        text: SpeechResult,
      });

      // Send to frontend
      activeCall.ws.send(
        JSON.stringify({
          type: "transcription",
          data: {
            callId,
            speaker: "caller",
            text: SpeechResult,
            timestamp: Date.now(),
          },
        }),
      );

      const t1 = Date.now();
      console.log(
        `[LATENCY] Call ${callId}: Starting GPT-4.1 request (+${t1 - t0}ms)`,
      );

      // Generate AI response
      activeCall.openaiConversation.push({
        role: "user",
        content: SpeechResult,
      });

      const completion = await openaiClient.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(activeCall.prompt),
          },
          ...activeCall.openaiConversation,
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "press_button",
              description:
                "Press a button (DTMF tone) on the phone keypad to navigate phone menus or IVR systems",
              parameters: {
                type: "object",
                properties: {
                  digit: {
                    type: "string",
                    description: "The digit or symbol to press: 0-9, *, or #",
                    enum: [
                      "0",
                      "1",
                      "2",
                      "3",
                      "4",
                      "5",
                      "6",
                      "7",
                      "8",
                      "9",
                      "*",
                      "#",
                    ],
                  },
                  reason: {
                    type: "string",
                    description:
                      "Brief explanation of why pressing this button (e.g., 'Selecting English language option')",
                  },
                },
                required: ["digit", "reason"],
              },
            },
          },
        ],
        tool_choice: "auto",
      });

      const t2 = Date.now();
      console.log(
        `[LATENCY] Call ${callId}: GPT-4.1 response received (+${t2 - t1}ms, total: ${t2 - t0}ms)`,
      );

      const message = completion.choices[0]?.message;
      let aiResponse = message?.content || "";

      // Check if AI wants to press a button
      if (message?.tool_calls && message.tool_calls.length > 0) {
        activeCall.openaiConversation.push({
          role: "assistant",
          content: message.content || null,
          tool_calls: message.tool_calls,
        });

        const toolResults = [];

        for (const toolCall of message.tool_calls) {
          if (
            toolCall.type === "function" &&
            toolCall.function.name === "press_button"
          ) {
            const args = JSON.parse(toolCall.function.arguments);
            let result = { success: false, message: "" };

            if (activeCall.twilioCallSid) {
              try {
                await twilioClient.calls(activeCall.twilioCallSid).update({
                  method: "POST",
                  url: `https://${getPublicHost(req)}/api/dtmf/${callId}?digit=${args.digit}`,
                });

                result = {
                  success: true,
                  message: `Pressed button ${args.digit} successfully`,
                };

                const buttonMessage = `[Pressed button: ${args.digit}] ${args.reason}`;
                await storage.addTranscriptMessage({
                  callId,
                  speaker: "ai",
                  text: buttonMessage,
                });

                activeCall.ws.send(
                  JSON.stringify({
                    type: "transcription",
                    data: {
                      callId,
                      speaker: "ai",
                      text: buttonMessage,
                      timestamp: Date.now(),
                    },
                  }),
                );
              } catch (dtmfError) {
                console.error("Error sending DTMF:", dtmfError);
                result = {
                  success: false,
                  message: `Failed to press button: ${dtmfError}`,
                };
              }
            }

            toolResults.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
          }
        }

        activeCall.openaiConversation.push(...toolResults);

        // Get follow-up response
        const followUpCompletion = await openaiClient.chat.completions.create({
          model: "gpt-4.1",
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(activeCall.prompt),
            },
            ...activeCall.openaiConversation,
          ],
        });

        aiResponse = followUpCompletion.choices[0]?.message?.content || "Done.";
      }

      if (aiResponse) {
        activeCall.openaiConversation.push({
          role: "assistant",
          content: aiResponse,
        });

        await storage.addTranscriptMessage({
          callId,
          speaker: "ai",
          text: aiResponse,
        });

        activeCall.ws.send(
          JSON.stringify({
            type: "transcription",
            data: {
              callId,
              speaker: "ai",
              text: aiResponse,
              timestamp: Date.now(),
            },
          }),
        );

        // Generate and play audio
        const call = await storage.getCall(callId);

        // Helper to escape XML special characters
        const escapeXml = (text: string) => {
          return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
        };

        // Check voice provider and generate audio accordingly
        if (call?.voiceProvider === "deepgram" && call?.deepgramVoice) {
          // Use Deepgram Aura TTS
          const safeDeepgramVoice = VALID_DEEPGRAM_VOICES.includes(
            call.deepgramVoice,
          )
            ? call.deepgramVoice
            : "aura-2-asteria-en";

          try {
            const t4 = Date.now();
            console.log(
              `[LATENCY] Call ${callId}: Starting Deepgram Aura TTS generation (+${t4 - t0}ms)`,
            );
            const audioFilename = `${callId}-${Date.now()}.mp3`;
            const audioUrl = await generateDeepgramAudio(
              aiResponse,
              safeDeepgramVoice,
              audioFilename,
            );
            const t5 = Date.now();
            console.log(
              `[LATENCY] Call ${callId}: Deepgram Aura TTS audio generated (+${t5 - t4}ms, total: ${t5 - t0}ms)`,
            );

            // Return TwiML to play audio with barge-in (redirect keeps call alive)
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="60" speechTimeout="1" action="https://${getPublicHost(req)}/api/gather/${callId}">
    <Play>https://${getPublicHost(req)}${audioUrl}</Play>
  </Gather>
  <Redirect method="POST">https://${getPublicHost(req)}/api/gather/${callId}</Redirect>
</Response>`;
            console.log(
              `[LATENCY] Call ${callId}: TwiML response sent to Twilio (total pipeline: ${Date.now() - t0}ms)`,
            );
            res.type("text/xml");
            return res.send(twiml);
          } catch (audioError) {
            console.error("Error generating Deepgram audio:", audioError);
            // Fallback to Polly voice
          }
        } else if (call?.voiceProvider === "elevenlabs" && call?.voiceId) {
          // Use ElevenLabs TTS
          try {
            const t4 = Date.now();
            console.log(
              `[LATENCY] Call ${callId}: Starting ElevenLabs TTS generation (+${t4 - t0}ms)`,
            );
            const audioFilename = `${callId}-${Date.now()}.mp3`;
            const audioUrl = await generateAndSaveAudio(
              aiResponse,
              call.voiceId,
              audioFilename,
            );
            const t5 = Date.now();
            console.log(
              `[LATENCY] Call ${callId}: ElevenLabs TTS audio generated (+${t5 - t4}ms, total: ${t5 - t0}ms)`,
            );

            // Return TwiML to play audio with barge-in (redirect keeps call alive)
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="60" speechTimeout="1" action="https://${getPublicHost(req)}/api/gather/${callId}">
    <Play>https://${getPublicHost(req)}${audioUrl}</Play>
  </Gather>
  <Redirect method="POST">https://${getPublicHost(req)}/api/gather/${callId}</Redirect>
</Response>`;
            console.log(
              `[LATENCY] Call ${callId}: TwiML response sent to Twilio (total pipeline: ${Date.now() - t0}ms)`,
            );
            res.type("text/xml");
            return res.send(twiml);
          } catch (audioError) {
            console.error("Error generating ElevenLabs audio:", audioError);
            // Fallback to Polly voice
          }
        }

        // Use Polly voice (default or fallback)
        // Validate voice against allowlist for security
        const safeVoice =
          call?.pollyVoice && VALID_POLLY_VOICES.includes(call.pollyVoice)
            ? call.pollyVoice
            : "Polly.Joanna";
        const voiceAttr = ` voice="${safeVoice}"`;
        console.log(
          `[LATENCY] Call ${callId}: Using Polly voice (no TTS generation needed) - total: ${Date.now() - t0}ms`,
        );
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="60" speechTimeout="1" action="https://${getPublicHost(req)}/api/gather/${callId}">
    <Say${voiceAttr}>${escapeXml(aiResponse)}</Say>
  </Gather>
  <Redirect method="POST">https://${getPublicHost(req)}/api/gather/${callId}</Redirect>
</Response>`;
        console.log(
          `[LATENCY] Call ${callId}: TwiML response sent to Twilio (total pipeline: ${Date.now() - t0}ms)`,
        );
        res.type("text/xml");
        return res.send(twiml);
      }

      // No AI response - just continue gathering (keeps call alive)
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="60" speechTimeout="1" action="https://${getPublicHost(req)}/api/gather/${callId}" />
  <Redirect method="POST">https://${getPublicHost(req)}/api/gather/${callId}</Redirect>
</Response>`;
      res.type("text/xml");
      res.send(twiml);
    } catch (error) {
      console.error("Gather processing error:", error);
      // Continue gathering on error (keeps call alive even during long hold times)
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="60" speechTimeout="1" action="https://${getPublicHost(req)}/api/gather/${callId}" />
  <Redirect method="POST">https://${getPublicHost(req)}/api/gather/${callId}</Redirect>
</Response>`;
      res.type("text/xml");
      res.send(twiml);
    }
  });

  // TwiML endpoint - Play AI response with barge-in support
  app.post("/api/twiml-response/:callId", async (req, res) => {
    const { callId } = req.params;
    const { audioUrl } = req.query;

    // TwiML to play AI response with speech barge-in (interruption support)
    // Redirect keeps call alive if gather times out
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="60" speechTimeout="1" action="https://${getPublicHost(req)}/api/gather/${callId}">
    <Play>https://${getPublicHost(req)}${audioUrl}</Play>
  </Gather>
  <Redirect method="POST">https://${getPublicHost(req)}/api/gather/${callId}</Redirect>
</Response>`;

    res.type("text/xml");
    res.send(twiml);
  });

  // DTMF endpoint - Sends button press tones with barge-in support
  app.post("/api/dtmf/:callId", async (req, res) => {
    const { callId } = req.params;
    const { digit } = req.query;

    // Return TwiML that plays the DTMF tone with speech barge-in
    // Redirect keeps call alive if gather times out
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play digits="${digit}"/>
  <Pause length="1"/>
  <Gather input="speech" timeout="60" speechTimeout="1" action="https://${getPublicHost(req)}/api/gather/${callId}" />
  <Redirect method="POST">https://${getPublicHost(req)}/api/gather/${callId}</Redirect>
</Response>`;

    res.type("text/xml");
    res.send(twiml);
  });

  // Recording callback - Receives recording URL from Twilio (call-level recording)
  app.post("/api/recording/:callId", async (req, res) => {
    const { callId } = req.params;
    const { RecordingUrl, RecordingSid } = req.body;

    console.log(`[RECORDING CALLBACK] Received for call ${callId}`);
    console.log(`[RECORDING CALLBACK] Recording URL: ${RecordingUrl}`);
    console.log(`[RECORDING CALLBACK] Recording SID: ${RecordingSid}`);

    try {
      // Append .mp3 to get actual audio file (Twilio's RecordingUrl points to metadata)
      const audioUrl = RecordingUrl + ".mp3";

      // Store recording URL in database
      await storage.updateCall(callId, { recordingUrl: audioUrl });

      // Generate call summary using OpenAI
      generateCallSummary(callId).catch((err) =>
        console.error("Summary generation failed from recording callback:", err),
      );

      res.sendStatus(200);
    } catch (error) {
      console.error("Error processing recording callback:", error);
      res.sendStatus(500);
    }
  });

  // TwiML recording callback - Receives recording URL from TwiML <Record> verb
  app.post("/api/twiml-recording/:callId", async (req, res) => {
    const { callId } = req.params;
    const { RecordingUrl, RecordingSid } = req.body;

    console.log(`[TWIML RECORDING CALLBACK] Received for call ${callId}`);
    console.log(`[TWIML RECORDING CALLBACK] Recording URL: ${RecordingUrl}`);
    console.log(`[TWIML RECORDING CALLBACK] Recording SID: ${RecordingSid}`);

    try {
      // Append .mp3 to get actual audio file
      const audioUrl = RecordingUrl + ".mp3";

      // Update recording URL in database (this will override any call-level recording)
      await storage.updateCall(callId, { recordingUrl: audioUrl });

      // Generate call summary using OpenAI
      generateCallSummary(callId).catch((err) =>
        console.error(
          "Summary generation failed from TwiML recording callback:",
          err,
        ),
      );

      res.sendStatus(200);
    } catch (error) {
      console.error("Error processing TwiML recording callback:", error);
      res.sendStatus(500);
    }
  });

  // TEST ENDPOINT: Manually trigger summary generation for testing
  app.post("/api/test-summary/:callId", async (req, res) => {
    const { callId } = req.params;

    console.error(`[TEST] Manual summary generation trigger for call ${callId}`);

    try {
      await generateCallSummary(callId);
      res.json({ success: true, message: "Summary generation triggered" });
    } catch (error) {
      console.error("[TEST] Error triggering summary generation:", error);
      res.status(500).json({ error: "Failed to trigger summary generation" });
    }
  });

  // TwiML endpoint for call transfer
  app.post("/api/transfer-twiml/:callId", async (req, res) => {
    const { callId } = req.params;
    
    console.error(`[TRANSFER] Generating transfer TwiML for call ${callId}`);
    
    // TwiML to dial the transfer number (616-617-0915)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>+16166170915</Dial>
</Response>`;
    
    res.type("text/xml");
    res.send(twiml);
  });

  // API: Transfer an active call to 616-617-0915
  app.post("/api/calls/:callId/transfer", async (req, res) => {
    const { callId } = req.params;
    const activeCall = activeCalls.get(callId);

    if (!activeCall) {
      return res.status(404).json({ error: "Call not found" });
    }

    try {
      // Transfer the call by updating the TwiML URL
      if (activeCall.twilioCallSid) {
        const host = getPublicHost(req);
        await twilioClient
          .calls(activeCall.twilioCallSid)
          .update({
            url: `https://${host}/api/transfer-twiml/${callId}`,
            method: "POST",
          });

        console.error(`[TRANSFER] Call ${callId} transferred to +16166170915`);

        // Calculate duration at transfer time
        const duration = Math.floor((Date.now() - activeCall.startTime) / 1000);

        // Update call status in database
        await storage.updateCallStatus(callId, "transferred", duration, new Date());

        // Send WebSocket update
        activeCall.ws.send(
          JSON.stringify({
            type: "call_status",
            data: {
              callId,
              status: "transferred",
              duration,
            },
          }),
        );

        // Clean up active call
        activeCalls.delete(callId);

        res.json({ success: true, transferredTo: "+16166170915", duration });
      } else {
        res.status(400).json({ error: "No Twilio call SID available" });
      }
    } catch (error) {
      console.error("Error transferring call:", error);
      res.status(500).json({ error: "Failed to transfer call" });
    }
  });

  // API: Hang up an active call
  app.post("/api/calls/:callId/hangup", async (req, res) => {
    const { callId } = req.params;
    const activeCall = activeCalls.get(callId);

    if (!activeCall) {
      return res.status(404).json({ error: "Call not found" });
    }

    try {
      // End the Twilio call if we have a call SID
      if (activeCall.twilioCallSid) {
        await twilioClient
          .calls(activeCall.twilioCallSid)
          .update({ status: "completed" });
      }

      // Calculate duration
      const duration = Math.floor((Date.now() - activeCall.startTime) / 1000);

      // Update call status in database
      await storage.updateCallStatus(callId, "ended", duration, new Date());

      // Send WebSocket update
      activeCall.ws.send(
        JSON.stringify({
          type: "call_status",
          data: {
            callId,
            status: "ended",
            duration,
          },
        }),
      );

      // Clean up active call
      activeCalls.delete(callId);

      // Note: Call summary will be generated from recording callback once recording URL is available

      res.json({ success: true, duration });
    } catch (error) {
      console.error("Error hanging up call:", error);
      res.status(500).json({ error: "Failed to hang up call" });
    }
  });

  return httpServer;
}
