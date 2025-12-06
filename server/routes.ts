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
import {
  createVapiAssistant,
  makeVapiCall,
  getVapiCall,
  endVapiCall,
  buildSystemPrompt as buildVapiSystemPrompt,
} from "./vapi";

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
  vapiCallId?: string; // Vapi call identifier
  vapiAssistantId?: string; // Vapi assistant identifier
  openaiConversation: any[];
  ws: WebSocket;
  startTime: number;
  listenUrl?: string; // Vapi WebSocket URL for live audio monitoring
  controlUrl?: string; // Vapi HTTP URL for live call control
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
**913-300-9959** is not associated with any account.

------------------------------------------------------------
CALL BEHAVIOR & SPEAKING STYLE:

- Speak calmly, clearly, and professionally.  
-Your goal is to use a few words as possible to get your point across.
-When waiting on hold, do not speak until you are connected with a live agent.
- When the call is initiated, you will always be speaking with a non-human automated system. Be patient and wait for instructions during the automated system portion of the call.  During this time, use short sentences, or a few words to get instructions across. Do not ask the automated system questions like "can you confirm, xyz?" or "is this correct, xyz?"
- Once connected to a live agent, you can then adjust your speaking style to be more human like since you are speaking with a real human at that point in the call.
-**Do NOT say, "task is" when initially speaking. Act as human as you possibly can!**
- Wait for the other person or automated system to finish speaking before replying.  
- You can use these filler words occassionally to seem more human, but sparingly. "um," "uh", "hang on".  
- When reading account numbers, say **two digits at a time**, pausing slightly.  
  Example: for "8506" say "eight five … zero six."  
- Stay polite and composed even if the agent is frustrated.  
- When the issue is resolved, confirm next steps and end the call courteously:  
  "I guess that will be all. Thank you for your help today. I appreciate it. Have a great day, okay?."

------------------------------------------------------------
AUTOMATED SYSTEM NAVIGATION:

- Prefer touch-tone input, but use voice when asked a direct question. 
**Enter zip codes using touchtone keypad when asked.**
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
-- If the agent asks for your phone number, say "913-300-9959."
-- If the agent asks for your email, say "jay pee em at telcon associates.com, that's tee ee el, see oh en as in nancy, associates dot com."
-- If the agent asks for your account number, say "The account number is [account number]."
-- If the agent asks for your service address, say "The service address is [service address]."
-- If the agent asks for your account PIN, say "PIN is [account PIN]."
-- If the agent asks for a brief summary of the task or issue, say "The task or issue is [short summary from the task or issue section]."
--If the agent asks for a call back number, say "913-439-5811"

Be ready to provide:
- Account number  
- Service address  
- Account PIN  
- Short summary of the problem from the task or issue section  
-You may wait on hold during this phase of the call. Only speak when asked a question, unless prompted to do otherwise.

------------------------------------------------------------
ACCOUNT REFERENCE SECTION, SERVICE ADDRESS, CONTACT NAME AND PHONE, AND RELATED EMAIL THREAD:
These instructions are for your reference only. They contain inform
ation about the account, service address, contact name and phone, and related email thread.

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
TRANSFER TO HUMAN AGENT:

**CRITICAL: DO NOT TRANSFER during IVR navigation or automated systems!**

You have the press_button function to navigate IVR menus and enter account data. **Complete the IVR navigation first** using press_button before considering a transfer.

**ONLY transfer the call to a human agent** using the transfer_call function when:

1. **A live human agent is already on the line AND explicitly transfers you:**
   - The agent says something like "Let me transfer you to [department/specialist]"
   - The agent says "I'm going to connect you with someone who can help"
   - The agent initiates a transfer action themselves
   
2. **The task is complete AND a human agent confirms:**
   - Issue has been resolved
   - Ticket/confirmation number has been provided
   - Agent confirms "anything else I can help with?" and there isn't

3. **You are genuinely stuck after IVR navigation completes:**
   - You've navigated past the IVR menus successfully
   - You've reached a human agent who cannot help
   - You've attempted resolution 2-3 times without progress

**DO NOT TRANSFER if you hear:**
- Automated IVR menus or hold music
- "Please say or enter your account number"
- "Let me get you to someone who can help" (automated message)
- "Transferring you now" (from automated system)
- "Please hold for the next available agent"
- **Any automated system messages** - wait for actual human interaction first

**When legitimately transferring, say:**
"Let me connect you with one of our team members who can help you with this. Please hold for just a moment."

Then immediately use the transfer_call function. Do NOT ask for permission or confirmation—just transfer.

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

// Helper function to build OpenAI call summary prompt
// Single source of truth for summary generation across the application
function buildSummaryPrompt(transcriptText: string): string {
  return `You are an AI assistant tasked with creating detailed, narrative-style bullet point summaries of phone call transcripts.

The caller is **Jim Martin**, referred to as **JPM** in the summary.

**IMPORTANT: ONLY summarize the conversation with a LIVE HUMAN AGENT.**

IGNORE and DO NOT INCLUDE any of the following:
- Automated greetings and IVR menu prompts
- Hold music or hold messages
- Automated system prompts asking for account numbers, ZIP codes, or PINs
- Any automated voice or recording before reaching a live person
- Button presses, DTMF navigation, or what buttons were pressed
- "Please hold while we transfer your call" type messages

START your summary from when a live human representative begins speaking and interacting with JPM.

If no live agent interaction occurred (call was entirely automated/IVR), respond with: "No live agent interaction - call was handled by automated system."

Follow these rules for the live agent portion:

1. Write **full sentences in bullet points**, each describing one distinct action, statement, or event.
2. Use **chronological order** so the bullet points read like a story of what happened.
3. Always identify the **representative's name** if mentioned.
4. **ALWAYS include important details mentioned during the conversation:**
   - Account numbers
   - Static IP addresses
   - Confirmation numbers
   - Service addresses
   - Phone numbers
   - Pricing and plan details
   - Dates and times
   - Any reference numbers or ticket numbers
5. Use **JPM** to refer to the caller and the representative's name when known.
6. Capture everything important - use as many bullet points as needed to cover all key information.
7. If the representative's name is not provided, use "the representative" or "the agent."

Example format:
- JPM spoke with Sarah regarding the business internet account.
- Sarah confirmed the account number is 8372749201 and verified the service address at 7700 Cody Lane, Sachse, TX 75048.
- The static IP block 209.182.44.16/29 was confirmed as active on the account.
- Sarah noted the current plan is Business Internet 200 at $149.99/month.
- A service call was scheduled for Tuesday, December 3rd between 10am-12pm.
- Confirmation number 445892 was provided for the scheduled appointment.

Transcript:
${transcriptText}`;
}

// Helper function to poll Vapi API for recording URL (processing may take time)
async function pollForRecording(vapiCallId: string, dbCallId: string) {
  const maxAttempts = 10;
  const delayMs = 5000; // 5 seconds between attempts
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    
    try {
      console.log(`[VAPI POLL] Attempt ${attempt}/${maxAttempts} - Checking for recording...`);
      const vapiCall = await getVapiCall(vapiCallId);
      
      const recordingUrl = vapiCall?.artifact?.recordingUrl || 
                           vapiCall?.artifact?.stereoRecordingUrl ||
                           vapiCall?.recordingUrl;
      
      if (recordingUrl) {
        console.log(`[VAPI POLL] ✓ Recording URL found: ${recordingUrl.substring(0, 50)}...`);
        await storage.updateCall(dbCallId, { recordingUrl });
        return;
      }
      
      console.log(`[VAPI POLL] Recording not ready yet (attempt ${attempt}/${maxAttempts})`);
    } catch (error) {
      console.error(`[VAPI POLL] Error fetching call:`, error);
    }
  }
  
  console.log(`[VAPI POLL] Recording not available after ${maxAttempts} attempts`);
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

          if (activeCall && activeCall.controlUrl) {
            try {
              // Send instruction to Vapi assistant via Live Call Control API
              // Use "system" role with explicit function call directive
              const response = await fetch(activeCall.controlUrl, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  type: "add-message",
                  message: {
                    role: "system",
                    content: `IMMEDIATE ACTION REQUIRED: ${instruction}. You MUST use the press_button function RIGHT NOW to execute this instruction. Do not speak, just press the buttons.`,
                  },
                }),
              });

              if (!response.ok) {
                const errorText = await response.text();
                console.error(
                  `[VAPI CONTROL] Failed to send instruction: ${response.status} - ${errorText}`,
                );
                throw new Error(`Vapi control API error: ${response.status}`);
              }

              console.log(
                `[VAPI CONTROL] Instruction sent successfully for call ${callId}: ${instruction}`,
              );

              // Send success response
              ws.send(
                JSON.stringify({
                  type: "instruction_response",
                  data: {
                    success: true,
                    message: "Instruction sent to AI assistant",
                  },
                }),
              );
            } catch (error) {
              console.error(`[VAPI CONTROL] Error sending instruction:`, error);
              ws.send(
                JSON.stringify({
                  type: "instruction_response",
                  data: {
                    success: false,
                    message: "Failed to send instruction to AI",
                  },
                }),
              );
            }
          } else {
            // Send error response
            ws.send(
              JSON.stringify({
                type: "instruction_response",
                data: {
                  success: false,
                  message: activeCall
                    ? "Call control not available"
                    : "Call not found or not active",
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
        .map(
          (t) => `${t.speaker === "ai" ? "JPM" : "Representative"}: ${t.text}`,
        )
        .join("\n");

      if (!cleanTranscripts || cleanTranscripts.trim().length === 0) {
        console.error(`[SUMMARY] No transcript content for call ${callId}`);
        return;
      }

      console.error(
        `[SUMMARY] Processing ${transcripts.length} transcript messages`,
      );

      // Generate summary using OpenAI
      const summaryPrompt = buildSummaryPrompt(cleanTranscripts);
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
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
        console.error(
          `[SUMMARY SUCCESS] ✓ Summary generated and saved for call ${callId}`,
        );

        // Send email if recipient is specified
        if (call.emailRecipient) {
          console.error(
            `[EMAIL] Attempting to send summary to ${call.emailRecipient}`,
          );
          await sendCallSummaryEmail(
            call.emailRecipient,
            call.phoneNumber,
            summary,
            call.duration || 0,
            call.recordingUrl || undefined,
          );
        }
      } else {
        console.error(
          `[SUMMARY ERROR] No summary generated for call ${callId}`,
        );
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

  // Manual summary generation and email sending
  app.post("/api/calls/:callId/send-summary", async (req, res) => {
    try {
      const { callId } = req.params;
      const call = await storage.getCall(callId);

      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }

      console.log(`[MANUAL SUMMARY] Generating summary for call ${callId}...`);

      // Get transcript
      const transcript = await storage.getTranscriptByCallId(callId);
      const transcriptText = transcript
        .map(
          (msg: { speaker: string; text: string }) =>
            `${msg.speaker === "ai" ? "AI" : "Caller"}: ${msg.text}`,
        )
        .join("\n");

      if (!transcriptText) {
        return res
          .status(400)
          .json({ error: "No transcript available for this call" });
      }

      console.log(
        `[MANUAL SUMMARY] Transcript length: ${transcriptText.length} characters`,
      );

      // Generate summary
      const summaryPrompt = `You are an AI assistant tasked with creating detailed, narrative-style bullet point summaries of phone call transcripts.

The caller is **Jim Martin**, referred to as **JPM** in the summary.

Your goal is to capture **exactly what transpired during the call** — as if taking professional call notes — using clear, complete sentences for each bullet point.

Follow these rules carefully:

1. Write **full sentences in bullet points**, each describing one distinct action, statement, or event that occurred during the call.
2. Use a **chronological order** so that the bullet points read like a concise story of what happened from start to finish.
3. Always identify the **representative’s name** if mentioned.
4. Always include **account numbers, PINs, service addresses, and phone numbers** if they are mentioned in the transcript.
5. Use **JPM** to refer to the caller and use the representative’s name when possible (e.g., “The representative, Sarah, confirmed the account number…”).
6. Avoid filler phrases like “pleasantries,” “greetings,” or “the call ended.”
7. Do not use dashes to separate sentences within a bullet point. Each bullet point should contain one or two full sentences that describe what happened.
8. Keep the focus on the **main points of the call** — issues discussed, actions taken, questions asked, confirmations provided, and outcomes.
9. Maintain a **professional and factual tone** throughout the summary.
10. If the representative’s name is not provided, note this clearly as “Representative name not mentioned.”

Example format:
- JPM verified the service address as 7700 Cody Lane, Sachse, TX 75048.  
- The representative, Sarah, confirmed that the upgrade had been installed on Monday.  
- JPM thanked the representative and confirmed that no further action was required.  

Transcript:
${transcriptText}`;

      const summaryCompletion = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that summarizes phone call transcripts.",
          },
          { role: "user", content: summaryPrompt },
        ],
        temperature: 0.3,
      });

      const summary = summaryCompletion.choices[0]?.message?.content || "";
      console.log(
        `[MANUAL SUMMARY] Summary generated: ${summary.substring(0, 100)}...`,
      );

      // Save summary
      await storage.updateCall(callId, { summary });

      // Send email if recipient provided
      if (call.emailRecipient) {
        console.log(
          `[MANUAL SUMMARY] Sending email to ${call.emailRecipient}...`,
        );
        await sendCallSummaryEmail(
          call.emailRecipient,
          call.phoneNumber,
          summary,
          call.duration || 0,
          call.recordingUrl || undefined,
        );
        console.log(`[MANUAL SUMMARY] ✓ Email sent to ${call.emailRecipient}`);
      }

      res.json({
        success: true,
        summary,
        emailSent: !!call.emailRecipient,
        recipient: call.emailRecipient,
      });
    } catch (error) {
      console.error("[MANUAL SUMMARY] Error:", error);
      res.status(500).json({ error: "Failed to generate and send summary" });
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

  // API: Get call details by ID
  app.get("/api/calls/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const call = await storage.getCall(id);

      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }

      res.json(call);
    } catch (error) {
      console.error("Error fetching call:", error);
      res.status(500).json({ error: "Failed to fetch call details" });
    }
  });

  // API: Start a new call (using Vapi.ai)
  app.post("/api/calls/start", async (req, res) => {
    try {
      const {
        phoneNumber,
        prompt,
        callerName,
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
      let validatedProvider = voiceProvider || "deepgram"; // Default to Deepgram for Vapi
      let validatedDeepgramVoice: string | undefined;
      let validatedElevenLabsVoice: string | undefined;

      if (validatedProvider === "deepgram") {
        // Validate Deepgram voice (Vapi expects full aura-2-X-en format)
        validatedDeepgramVoice =
          deepgramVoice &&
          (deepgramVoice.startsWith("aura-2-") ||
            deepgramVoice.startsWith("aura-"))
            ? deepgramVoice
            : "aura-2-asteria-en"; // Default to Aura-2 Asteria
      } else if (validatedProvider === "elevenlabs") {
        // Use ElevenLabs voice (validation happens when fetching from API)
        validatedElevenLabsVoice = elevenLabsVoice;
        // If no voice selected, fall back to Deepgram instead of using invalid default
        if (!validatedElevenLabsVoice) {
          console.warn(
            "No ElevenLabs voice selected, falling back to Deepgram Aura-2 Asteria",
          );
          validatedProvider = "deepgram";
          validatedDeepgramVoice = "aura-2-asteria-en";
        }
      } else if (validatedProvider === "polly") {
        // Polly not supported by Vapi, fall back to Deepgram Aura-2
        console.warn(
          "Polly not supported by Vapi, using Deepgram Aura-2 Asteria instead",
        );
        validatedProvider = "deepgram";
        validatedDeepgramVoice = "aura-2-asteria-en";
      }

      // Validate environment variables
      if (!process.env.VAPI_API_KEY) {
        return res.status(500).json({ error: "Vapi API key not configured" });
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
        pollyVoice: undefined, // Polly not used with Vapi
        deepgramVoice: validatedDeepgramVoice,
        voiceId: validatedElevenLabsVoice, // ElevenLabs voice ID
        duration: 0,
        emailRecipient: emailRecipient || undefined,
      });

      // Build system prompt for Vapi assistant with caller name
      const validatedCallerName = callerName || "James Martin";
      const systemPrompt = buildVapiSystemPrompt(prompt, validatedCallerName);

      // Determine voice for Vapi (Deepgram voices will be converted to just the name in getVoiceConfig)
      const voice =
        validatedProvider === "elevenlabs"
          ? validatedElevenLabsVoice || "21m00Tcm4TlvDq8ikWAM" // Default ElevenLabs voice
          : validatedDeepgramVoice || "aura-2-asteria-en"; // Will be converted to 'asteria'

      // Create Vapi assistant
      const assistantId = await createVapiAssistant({
        name: `Call ${call.id.substring(0, 8)}`,
        systemPrompt,
        voiceProvider: validatedProvider,
        voice,
        firstMessageMode: "assistant-waits-for-user", // AI only speaks when asked
      });

      // Make Vapi call
      const { vapiCallId, listenUrl, controlUrl } = await makeVapiCall({
        assistantId,
        phoneNumber,
        customerName: "Customer",
      });

      // Update call record with Vapi call ID and monitoring URLs
      await storage.updateCall(call.id, {
        twilioCallSid: vapiCallId, // Store Vapi call ID in twilioCallSid field
        listenUrl: listenUrl || undefined,
        controlUrl: controlUrl || undefined,
      });

      console.log(`[VAPI] Monitoring URLs for call ${call.id}:`, {
        listenUrl,
        controlUrl,
      });

      // Store active call info
      activeCalls.set(call.id, {
        callId: call.id,
        phoneNumber,
        prompt,
        vapiCallId,
        vapiAssistantId: assistantId,
        openaiConversation: [],
        ws: wsClient,
        startTime: Date.now(),
        listenUrl,
        controlUrl,
      });

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

      console.log(
        `[VAPI] Started call ${call.id} with Vapi call ID: ${vapiCallId}`,
      );

      res.json({ callId: call.id, vapiCallId });
    } catch (error: any) {
      console.error("Error starting call:", error);

      // Log detailed Vapi error if available
      if (error.response) {
        console.error("Vapi API error response:", {
          status: error.response.status,
          data: error.response.data,
        });
      }

      res.status(500).json({ error: "Failed to start call" });
    }
  });

  // Vapi webhook endpoint - Receives real-time events from Vapi
  app.post("/api/vapi/webhook", async (req, res) => {
    try {
      const { message } = req.body;

      if (!message) {
        return res.sendStatus(200);
      }

      console.log("[VAPI WEBHOOK] Received event:", message.type);

      // Find active call by Vapi call ID
      let activeCall: ActiveCall | undefined;
      for (const call of Array.from(activeCalls.values())) {
        if (call.vapiCallId === message.call?.id) {
          activeCall = call;
          break;
        }
      }

      // Handle different message types
      switch (message.type) {
        case "transcript": {
          // Real-time transcription
          const { transcript, role, transcriptType } = message;

          // Only process final transcripts, not partial updates
          // Vapi sends many partial updates as speech recognition refines
          if (activeCall && transcript && transcriptType === "final") {
            const speaker = role === "assistant" ? "ai" : "caller";

            // Save to database
            await storage.addTranscriptMessage({
              callId: activeCall.callId,
              speaker,
              text: transcript,
            });

            // Send to frontend via WebSocket
            activeCall.ws.send(
              JSON.stringify({
                type: "transcription",
                data: {
                  callId: activeCall.callId,
                  speaker,
                  text: transcript,
                  timestamp: Date.now(),
                },
              }),
            );

            // Note: DTMF is handled by the AI using the press_button function tool
            // The Live Call Control API does not support direct DTMF sending
          }
          break;
        }

        case "status-update": {
          // Call status updates (ringing, in-progress, ended)
          const { status } = message;

          if (activeCall) {
            let appStatus: string = status;

            // Map Vapi statuses to our app statuses
            if (status === "in-progress") {
              appStatus = "connected";
            } else if (status === "ended") {
              appStatus = "ended";
            }

            // Update database
            if (appStatus === "ended") {
              const duration = Math.floor(
                (Date.now() - activeCall.startTime) / 1000,
              );
              await storage.updateCallStatus(
                activeCall.callId,
                "ended",
                duration,
                new Date(),
              );
            } else {
              await storage.updateCallStatus(activeCall.callId, appStatus);
            }

            // Send to frontend
            activeCall.ws.send(
              JSON.stringify({
                type: "call_status",
                data: {
                  callId: activeCall.callId,
                  status: appStatus,
                  duration:
                    appStatus === "ended"
                      ? Math.floor((Date.now() - activeCall.startTime) / 1000)
                      : undefined,
                },
              }),
            );

            // Clean up active call if ended
            if (appStatus === "ended") {
              activeCalls.delete(activeCall.callId);
            }
          }
          break;
        }

        case "end-of-call-report": {
          // Full call report with recording URL, transcript, cost, etc.
          const { call: vapiCall } = message;

          // Log full vapiCall object to debug duration field
          console.log("[VAPI] End-of-call-report FULL payload:", JSON.stringify(vapiCall, null, 2));

          console.log("[VAPI] End-of-call-report received:", {
            hasActiveCall: !!activeCall,
            hasVapiCall: !!vapiCall,
            vapiCallId: vapiCall?.id,
          });

          if (vapiCall) {
            // Find the call in database using Vapi call ID
            // activeCall might be deleted already, so we look it up by Vapi ID
            let dbCall: any = null;

            // First try using activeCall if available
            if (activeCall) {
              dbCall = await storage.getCall(activeCall.callId);
            }

            // If no activeCall or call not found, search by Vapi call ID
            if (!dbCall) {
              dbCall = await storage.getCallByVapiId(vapiCall.id);
            }

            if (!dbCall) {
              console.log(
                "[VAPI] Could not find call in database for Vapi ID:",
                vapiCall.id,
              );
              break;
            }

            // Extract duration - Vapi may use different field names
            // Try: duration, durationSeconds, durationMs, or calculate from timestamps
            let callDuration = 
              vapiCall.duration || 
              vapiCall.durationSeconds || 
              (vapiCall.durationMs ? Math.floor(vapiCall.durationMs / 1000) : 0) ||
              (vapiCall.endedAt && vapiCall.startedAt ? 
                Math.floor((new Date(vapiCall.endedAt).getTime() - new Date(vapiCall.startedAt).getTime()) / 1000) : 0);
            
            // Fallback: calculate from activeCall start time if still no duration
            if (!callDuration && activeCall) {
              callDuration = Math.floor((Date.now() - activeCall.startTime) / 1000);
            }
            
            // Final fallback: use dbCall.duration if it was already set
            if (!callDuration && dbCall.duration) {
              callDuration = dbCall.duration;
            }

            // Extract recording URL from artifact object (Vapi's structure)
            const recordingUrl = vapiCall.artifact?.recordingUrl || 
                                 vapiCall.artifact?.stereoRecordingUrl ||
                                 vapiCall.recordingUrl;

            console.log("[VAPI] End of call report for call:", dbCall.id, {
              vapiDuration: vapiCall.duration,
              calculatedDuration: callDuration,
              cost: vapiCall.cost,
              recordingUrl: recordingUrl,
              hasArtifact: !!vapiCall.artifact,
            });

            // Update call with recording URL and duration
            const updateData: any = {};
            if (recordingUrl) {
              updateData.recordingUrl = recordingUrl;
            }
            if (callDuration > 0) {
              updateData.duration = callDuration;
            }
            if (Object.keys(updateData).length > 0) {
              await storage.updateCall(dbCall.id, updateData);
            }

            // If no recording URL, poll Vapi API for it (recording processing may take time)
            if (!recordingUrl && vapiCall.id) {
              console.log("[VAPI] No recording URL in webhook, will poll Vapi API...");
              pollForRecording(vapiCall.id, dbCall.id);
            }

            console.log("[VAPI] DB Call:", {
              callId: dbCall.id,
              emailRecipient: dbCall.emailRecipient,
            });

            // Generate AI summary
            const transcript = await storage.getTranscriptByCallId(dbCall.id);
            const transcriptText = transcript
              .map(
                (msg: { speaker: string; text: string }) =>
                  `${msg.speaker === "ai" ? "AI" : "Caller"}: ${msg.text}`,
              )
              .join("\n");

            console.log("[VAPI] Transcript length:", transcriptText.length);

            if (transcriptText) {
              const summaryPrompt = buildSummaryPrompt(transcriptText);
              console.log("[VAPI] Generating summary...");
              const summaryCompletion =
                await openaiClient.chat.completions.create({
                  model: "gpt-4o-mini",
                  messages: [
                    {
                      role: "system",
                      content:
                        "You are a helpful assistant that summarizes phone call transcripts.",
                    },
                    { role: "user", content: summaryPrompt },
                  ],
                  temperature: 0.3,
                });

              const summary =
                summaryCompletion.choices[0]?.message?.content || "";
              console.log(
                "[VAPI] Summary generated:",
                summary.substring(0, 100) + "...",
              );

              // Save summary to database
              await storage.updateCall(dbCall.id, { summary });

              // Send email if recipient provided (delay 3 minutes to ensure recording is available)
              if (dbCall.emailRecipient && summary) {
                const EMAIL_DELAY_MS = 3 * 60 * 1000; // 3 minutes
                console.log(
                  `[EMAIL] Scheduling summary email to ${dbCall.emailRecipient} in 3 minutes (recording URL will be refreshed)...`,
                );
                
                // Store the call ID to fetch fresh recording URL after delay
                const callIdForEmail = dbCall.id;
                const emailRecipient = dbCall.emailRecipient;
                const phoneNumber = dbCall.phoneNumber;
                const emailSummary = summary;
                const emailDuration = callDuration;
                
                setTimeout(async () => {
                  try {
                    // Fetch the latest call data to get the most current recording URL
                    const freshCallData = await storage.getCall(callIdForEmail);
                    const freshRecordingUrl = freshCallData?.recordingUrl || recordingUrl;
                    
                    console.log(
                      `[EMAIL] Now sending delayed summary to ${emailRecipient}...`,
                    );
                    console.log(
                      `[EMAIL] Recording URL: ${freshRecordingUrl || 'not available'}`,
                    );
                    
                    await sendCallSummaryEmail(
                      emailRecipient,
                      phoneNumber,
                      emailSummary,
                      emailDuration,
                      freshRecordingUrl || undefined,
                    );
                    console.log(
                      `[EMAIL] ✓ Delayed summary sent to ${emailRecipient}`,
                    );
                  } catch (emailError) {
                    console.error(
                      "[EMAIL] ✗ Failed to send delayed summary:",
                      emailError,
                    );
                  }
                }, EMAIL_DELAY_MS);
              } else {
                console.log("[EMAIL] Skipped - missing requirements:", {
                  hasRecipient: !!dbCall.emailRecipient,
                  hasSummary: !!summary,
                });
              }
            } else {
              console.log("[VAPI] No transcript available for summary");
            }
          } else {
            console.log(
              "[VAPI] Skipping end-of-call-report - no vapiCall data",
            );
          }
          break;
        }

        case "function-call": {
          // DTMF button press or other function calls
          const { functionCall } = message;

          if (functionCall && activeCall) {
            console.log(
              "[VAPI] Function call:",
              functionCall.name,
              functionCall.parameters,
            );

            // Log DTMF presses
            if (functionCall.name === "press_button") {
              const digit = functionCall.parameters?.digit;
              console.log(`[DTMF] Call ${activeCall.callId} pressed: ${digit}`);
            }
          }
          break;
        }

        default:
          console.log("[VAPI WEBHOOK] Unknown message type:", message.type);
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("[VAPI WEBHOOK] Error processing webhook:", error);
      res.sendStatus(200); // Always return 200 to prevent retries
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
    <Say${voiceAttr}><Prosody volume="x-loud">${escapeXml(aiResponse)}</Prosody></Say>
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
        console.error(
          "Summary generation failed from recording callback:",
          err,
        ),
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

    console.error(
      `[TEST] Manual summary generation trigger for call ${callId}`,
    );

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
  <Dial>+19134395811</Dial>
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

    // Validate controlUrl is available
    if (!activeCall.controlUrl) {
      console.error(`[TRANSFER] No controlUrl available for call ${callId}`);
      return res.status(400).json({
        error: "Call control not available",
        details: "This call does not have live control enabled",
      });
    }

    try {
      // With Vapi, use live call control to transfer directly
      if (activeCall.controlUrl) {
        // Use Vapi's live call control to transfer the call
        const response = await fetch(activeCall.controlUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "transfer",
            destination: {
              type: "number",
              number: "+19134395811",
            },
            content: "Transferring your call now. Please hold.",
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `[VAPI] Transfer failed: ${response.status} - ${errorText}`,
          );
          return res.status(response.status).json({
            error: "Transfer failed",
            details: errorText,
          });
        }

        console.log(`[VAPI] Call ${callId} transfer initiated to +19134395811`);

        // DON'T delete active call or mark as ended - Vapi will continue recording/transcribing
        // The end-of-call-report webhook will handle final status and summary with COMPLETE transcript

        // Send WebSocket update to frontend (for UI notification only)
        activeCall.ws.send(
          JSON.stringify({
            type: "call_status",
            data: {
              callId,
              status: "transferring",
            },
          }),
        );

        res.json({
          success: true,
          transferredTo: "+19134395811",
          message:
            "Call transfer initiated - recording will continue through transfer",
        });
      }
      // Fallback to Twilio for legacy calls
      else if (activeCall.twilioCallSid) {
        const host = getPublicHost(req);
        await twilioClient.calls(activeCall.twilioCallSid).update({
          url: `https://${host}/api/transfer-twiml/${callId}`,
          method: "POST",
        });

        console.log(`[TWILIO] Call ${callId} transferred to +19134395811`);

        // Calculate duration at transfer time
        const duration = Math.floor((Date.now() - activeCall.startTime) / 1000);

        // Update call status in database
        await storage.updateCallStatus(
          callId,
          "transferred",
          duration,
          new Date(),
        );

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

        res.json({ success: true, transferredTo: "+19134395811", duration });
      } else {
        res.status(400).json({ error: "No call control available" });
      }
    } catch (error) {
      console.error("Error transferring call:", error);
      res.status(500).json({ error: "Failed to transfer call" });
    }
  });

  // API: Hang up an active call (supports both Vapi and Twilio)
  app.post("/api/calls/:callId/hangup", async (req, res) => {
    const { callId } = req.params;
    const activeCall = activeCalls.get(callId);

    if (!activeCall) {
      return res.status(404).json({ error: "Call not found" });
    }

    try {
      // End the Vapi call if we have a Vapi call ID
      if (activeCall.vapiCallId) {
        await endVapiCall(activeCall.vapiCallId);
        console.log(`[VAPI] Ended call ${callId}`);
      }
      // Fallback to Twilio for legacy calls
      else if (activeCall.twilioCallSid) {
        await twilioClient
          .calls(activeCall.twilioCallSid)
          .update({ status: "completed" });
        console.log(`[TWILIO] Ended call ${callId}`);
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

  // ============================================
  // MANUAL CALLING ROUTES (Browser-based PSTN)
  // ============================================

  // Generate Twilio access token for browser-based calling
  app.post("/api/manual-call/token", async (req, res) => {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

      if (!accountSid || !authToken) {
        return res.status(500).json({ error: "Twilio credentials not configured" });
      }

      const { identity } = req.body;
      const tokenIdentity = identity || `manual-caller-${Date.now()}`;

      const AccessToken = twilio.jwt.AccessToken;
      const VoiceGrant = AccessToken.VoiceGrant;

      const token = new AccessToken(
        accountSid,
        process.env.TWILIO_API_KEY_SID || accountSid,
        process.env.TWILIO_API_KEY_SECRET || authToken,
        { identity: tokenIdentity }
      );

      const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: twimlAppSid,
        incomingAllow: false,
      });
      token.addGrant(voiceGrant);

      console.log(`[MANUAL CALL] Generated token for identity: ${tokenIdentity}`);
      res.json({ token: token.toJwt(), identity: tokenIdentity });
    } catch (error) {
      console.error("[MANUAL CALL] Error generating token:", error);
      res.status(500).json({ error: "Failed to generate token" });
    }
  });

  app.get("/api/twilio/token", async (req, res) => {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

      if (!accountSid || !authToken) {
        return res.status(500).json({ error: "Twilio credentials not configured" });
      }

      // Create an access token for Twilio Voice
      const AccessToken = twilio.jwt.AccessToken;
      const VoiceGrant = AccessToken.VoiceGrant;

      const identity = `manual-caller-${Date.now()}`;
      const token = new AccessToken(
        accountSid,
        process.env.TWILIO_API_KEY_SID || accountSid,
        process.env.TWILIO_API_KEY_SECRET || authToken,
        { identity }
      );

      // Grant voice access
      const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: twimlAppSid,
        incomingAllow: false,
      });
      token.addGrant(voiceGrant);

      console.log(`[MANUAL CALL] Generated token for identity: ${identity}`);
      res.json({ token: token.toJwt(), identity });
    } catch (error) {
      console.error("[MANUAL CALL] Error generating token:", error);
      res.status(500).json({ error: "Failed to generate token" });
    }
  });

  // Register a manual outbound call (call initiated from browser via Device.connect)
  app.post("/api/manual-call/start", async (req, res) => {
    try {
      const { phoneNumber, callerName, emailRecipient, sessionId } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      const ws = sessionId ? wsClients.get(sessionId) : null;

      // Create call record in database with generated ID
      const callId = randomUUID();
      await storage.createCall({
        phoneNumber,
        prompt: "Manual call - no AI instructions",
        status: "ringing",
        callType: "manual",
        callerName: callerName || "Unknown",
        emailRecipient: emailRecipient || null,
      });

      // Store in active calls for tracking
      activeCalls.set(callId, {
        callId,
        phoneNumber,
        prompt: "",
        openaiConversation: [],
        ws: ws || null,
        startTime: Date.now(),
      });

      console.log(`[MANUAL CALL] Registered call ${callId} to ${phoneNumber}`);

      // Notify via WebSocket if available
      if (ws) {
        ws.send(JSON.stringify({
          type: "call_status",
          data: { callId, status: "ringing", callType: "manual" }
        }));
      }

      // Return the callId - the actual call is made by browser Device.connect()
      res.json({ callId, status: "registered" });
    } catch (error) {
      console.error("[MANUAL CALL] Error registering call:", error);
      res.status(500).json({ error: "Failed to register manual call" });
    }
  });

  // TwiML Voice URL for Twilio Client SDK (Device.connect)
  // This is called by Twilio when the browser initiates an outbound call via Device.connect()
  app.post("/api/twilio/voice", async (req, res) => {
    const { To, CallId, From } = req.body;
    const host = getPublicHost(req);

    console.log(`[TWILIO VOICE] Incoming voice request - To: ${To}, CallId: ${CallId}, From: ${From}`);

    if (!To) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>No destination number provided.</Say>
  <Hangup />
</Response>`;
      return res.type("text/xml").send(twiml);
    }

    // Generate TwiML to dial the destination with recording
    const callId = CallId || `manual-${Date.now()}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${process.env.TWILIO_PHONE_NUMBER}" record="record-from-answer" recordingStatusCallback="https://${host}/api/twilio/manual-recording-callback/${callId}" recordingStatusCallbackEvent="completed">
    <Number statusCallback="https://${host}/api/twilio/manual-status/${callId}" statusCallbackEvent="initiated ringing answered completed">${To}</Number>
  </Dial>
</Response>`;

    console.log(`[TWILIO VOICE] Returning TwiML for call to ${To}`);
    res.type("text/xml").send(twiml);
  });

  // TwiML for manual outbound call - connects to browser via WebRTC (legacy/fallback)
  app.post("/api/twilio/manual-voice/:callId", async (req, res) => {
    const { callId } = req.params;
    const host = getPublicHost(req);
    const activeCall = activeCalls.get(callId);
    const phoneNumber = req.body.To || activeCall?.phoneNumber;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${process.env.TWILIO_PHONE_NUMBER}" record="record-from-answer" recordingStatusCallback="https://${host}/api/twilio/manual-recording-callback/${callId}">
    <Number>${phoneNumber}</Number>
  </Dial>
</Response>`;

    res.type("text/xml").send(twiml);
  });

  // Status callback for manual calls
  app.post("/api/twilio/manual-status/:callId", async (req, res) => {
    const { callId } = req.params;
    const { CallStatus, CallDuration } = req.body;
    const activeCall = activeCalls.get(callId);

    console.log(`[MANUAL CALL] Status update for ${callId}: ${CallStatus}`);

    let status: string;
    switch (CallStatus) {
      case "initiated":
      case "ringing":
        status = "ringing";
        break;
      case "in-progress":
        status = "connected";
        break;
      case "completed":
      case "busy":
      case "no-answer":
      case "failed":
      case "canceled":
        status = "ended";
        break;
      default:
        status = CallStatus;
    }

    // Update database
    const duration = CallDuration ? parseInt(CallDuration) : 
      (activeCall ? Math.floor((Date.now() - activeCall.startTime) / 1000) : 0);

    if (status === "ended") {
      await storage.updateCallStatus(callId, status, duration, new Date());
      activeCalls.delete(callId);
    } else if (status === "connected") {
      await storage.updateCallStatus(callId, status);
    }

    // Notify via WebSocket
    if (activeCall?.ws) {
      activeCall.ws.send(JSON.stringify({
        type: "call_status",
        data: { callId, status, duration, callType: "manual" }
      }));
    }

    res.sendStatus(200);
  });

  // Recording callback for manual calls
  app.post("/api/twilio/manual-recording-callback/:callId", async (req, res) => {
    const { callId } = req.params;
    const { RecordingUrl, RecordingDuration } = req.body;

    console.log(`[MANUAL CALL] Recording callback for ${callId}: ${RecordingUrl}`);

    if (RecordingUrl) {
      const duration = RecordingDuration ? parseInt(RecordingDuration) : 0;
      
      // Update call with recording URL
      await storage.updateCallRecording(callId, RecordingUrl);

      // Get call details for summary
      const call = await storage.getCall(callId);
      if (call) {
        // Generate summary from recording (for manual calls, we'll note it's a manual call)
        const summary = `Manual call to ${call.phoneNumber} by ${call.callerName || "unknown caller"}. Duration: ${Math.floor(duration / 60)}m ${duration % 60}s. Recording available.`;
        
        await storage.updateCallSummary(callId, summary);

        // Send email if recipient specified
        if (call.emailRecipient) {
          console.log(`[MANUAL CALL EMAIL] Scheduling summary email to ${call.emailRecipient} in 3 minutes...`);
          
          setTimeout(async () => {
            try {
              const updatedCall = await storage.getCall(callId);
              const recordingUrl = updatedCall?.recordingUrl || RecordingUrl;
              
              console.log(`[MANUAL CALL EMAIL] Sending email for call ${callId}`);
              console.log(`[MANUAL CALL EMAIL] Recording URL: ${recordingUrl}`);
              
              await sendCallSummaryEmail(
                call.emailRecipient!,
                call.phoneNumber,
                summary,
                duration,
                recordingUrl
              );
              
              console.log(`[MANUAL CALL EMAIL] ✓ Email sent to ${call.emailRecipient}`);
            } catch (error) {
              console.error(`[MANUAL CALL EMAIL] Failed:`, error);
            }
          }, 180000); // 3 minute delay
        }
      }
    }

    res.sendStatus(200);
  });

  // Hang up manual call
  app.post("/api/manual-call/:callId/hangup", async (req, res) => {
    const { callId } = req.params;
    const activeCall = activeCalls.get(callId);

    if (!activeCall?.twilioCallSid) {
      return res.status(404).json({ error: "Manual call not found" });
    }

    try {
      await twilioClient.calls(activeCall.twilioCallSid).update({ status: "completed" });
      
      const duration = Math.floor((Date.now() - activeCall.startTime) / 1000);
      await storage.updateCallStatus(callId, "ended", duration, new Date());
      
      if (activeCall.ws) {
        activeCall.ws.send(JSON.stringify({
          type: "call_status",
          data: { callId, status: "ended", duration, callType: "manual" }
        }));
      }
      
      activeCalls.delete(callId);
      
      console.log(`[MANUAL CALL] Hung up call ${callId}`);
      res.json({ success: true, duration });
    } catch (error) {
      console.error("[MANUAL CALL] Error hanging up:", error);
      res.status(500).json({ error: "Failed to hang up call" });
    }
  });

  // Send DTMF digits for manual call
  app.post("/api/manual-call/:callId/dtmf", async (req, res) => {
    const { callId } = req.params;
    const { digits } = req.body;
    const activeCall = activeCalls.get(callId);

    if (!activeCall?.twilioCallSid) {
      return res.status(404).json({ error: "Manual call not found" });
    }

    try {
      // Use Twilio's DTMF API to send tones
      await twilioClient.calls(activeCall.twilioCallSid)
        .update({
          twiml: `<Response><Play digits="${digits}"/><Pause length="60"/></Response>`
        });
      
      console.log(`[MANUAL CALL] Sent DTMF ${digits} for call ${callId}`);
      res.json({ success: true, digits });
    } catch (error) {
      console.error("[MANUAL CALL] Error sending DTMF:", error);
      res.status(500).json({ error: "Failed to send DTMF" });
    }
  });

  return httpServer;
}
