import axios from "axios";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = "https://api.vapi.ai";

if (!VAPI_API_KEY) {
  console.error("WARNING: VAPI_API_KEY environment variable not set!");
}

const vapiClient = axios.create({
  baseURL: VAPI_BASE_URL,
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// Get public webhook URL for Vapi callbacks
function getPublicWebhookUrl(path: string): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) {
    return `https://${domain}${path}`;
  }
  return `http://localhost:5000${path}`;
}

// Helper function to build the full system prompt
export function buildSystemPrompt(userInstructions: string): string {
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
🚨 CRITICAL RULE #1 - DTMF BUTTON PRESSING (MOST IMPORTANT):

When ANY automated system asks you to "enter", "press", "input", or "dial" digits:
1. **IMMEDIATELY use the press_button function when asked to enter zip code** - This is NOT optional
2. **NEVER speak digits verbally** - IVR systems CANNOT hear spoken numbers
3. Press ONE digit at a time by calling press_button multiple times
4. Find the information in the ACCOUNT REFERENCE SECTION above (ZIP code, account number, phone number)

Common IVR prompts that require press_button:
- "Enter your ZIP code" → Look up ZIP from service address, press each digit
- "Enter your account number" → Look up account number, press each digit
- "Press 1 for X, Press 2 for Y" → Press the appropriate menu option
- "Enter your phone number" → Press each digit of the phone number
- "Using your keypad, enter..." → Use press_button

Example: Service address is "365 Nicolette Mall, Minneapolis, Minnesota 55401"
When IVR says "Enter your ZIP code":
→ Call press_button("5"), press_button("5"), press_button("4"), press_button("0"), press_button("1")
→ Do NOT say "five five four zero one" or "Please continue"

**If you speak words instead of pressing buttons, the IVR will fail and loop repeatedly.**

------------------------------------------------------------
CALL BEHAVIOR & SPEAKING STYLE:

- Speak calmly, clearly, and professionally.  
- Your goal is to use as few words as possible to get your point across.
- When waiting on hold, do not speak until you are connected with a live agent.
- When interacting with automated systems, **PRESS BUTTONS instead of speaking** whenever the IVR asks for digits.
- Only use voice when the IVR asks a direct YES/NO question or asks you to describe an issue.
- Once connected to a live agent, you can then adjust your speaking style to be more human-like.
- Wait for the other person or automated system to finish speaking before replying.  
- Avoid filler words (no "um," "uh").  
- When reading account numbers to a HUMAN agent, say **two digits at a time**, pausing slightly.  
  Example: for "8506" say "eight five … zero six."  
- Stay polite and composed even if the agent is frustrated.  
- When the issue is resolved, confirm next steps and end the call courteously:  
  "Thank you for your help today. Have a great day."

------------------------------------------------------------
AUTOMATED SYSTEM NAVIGATION:

- **ALWAYS prefer pressing buttons over speaking** - Use press_button function for ALL digit entry
- Say "speak with agent" or "representative" to reach a human quicker than going through many automated prompts.
- Always provide the account number first (not the phone number).  
- Skip automated troubleshooting unless required.  
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
-- If the agent asks for your account PIN, say "The PIN is [account PIN]."
-- If the agent asks for a brief summary of the task or issue, say "The task or issue is [short summary from the task or issue section]."

Be ready to provide:
- Account number  
- Service address  
- Account PIN  
- Short summary of the problem from the task or issue section  
-You may wait on hold during this phase of the call. Only speak when asked a question, unless prompted to do otherwise.

------------------------------------------------------------
HANDLING DOCUSIGN

-Docusigns with Comcast will always be sent to jay pee em at telcon associates.com, that's tee ee el, see oh en as in nancy, associates dot com.
- If you are asked to sign a document, say "I will sign the document and send it to jay pee em at telcon associates.com, that's tee ee el, see oh en as in nancy, associates dot com."
- If you are asked to sign a document and you are not sure who to send it to, say "I will sign the document and send it to jay pee em at telcon associates.com, that's tee ee el, see oh en as in nancy, associates dot com.


-------------------------------------------------------------

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
TRANSFER TO HUMAN AGENT:

**AUTOMATICALLY transfer the call to a human agent** using the transfer_call function when:

1. **Customer explicitly requests it:**
   - "Can I speak to a human?"
   - "I want to talk to a real person"
   - "Transfer me to an agent"
   - "Connect me to someone"
   - "I don't want to talk to a robot"
   - Any similar request for human assistance

2. **You are unable to help:**
   - The customer's issue is outside your capabilities
   - You've attempted to help 2-3 times but haven't made progress
   - The customer is becoming frustrated or repeating their issue
   - The situation requires human judgment or authorization

3. **Complex escalations:**
   - Customer disputes charges or wants refunds
   - Legal or compliance matters
   - Account security concerns requiring verification you cannot perform
   - Service issues requiring immediate executive attention

**When transferring, say:**
"Let me connect you with one of our team members who can help you with this. Please hold for just a moment."

Then immediately use the transfer_call function. Do NOT ask for permission or confirmation—just transfer.

------------------------------------------------------------
REFERENCE: 
Hours: Monday–Friday 9 AM – 5 PM local time  
If outside hours, note for recall and end politely.

------------------------------------------------------------
TECHNICAL INSTRUCTIONS:

Keep responses concise and conversational, suitable for text-to-speech.

**REMINDER: The press_button function is your PRIMARY tool for IVR navigation. Use it immediately and aggressively when any system asks for digits.**`;
}

// Voice provider configuration
interface VoiceConfig {
  provider: "11labs" | "deepgram" | "azure";
  voiceId: string;
}

function getVoiceConfig(voiceProvider: string, voice: string): VoiceConfig {
  switch (voiceProvider) {
    case "elevenlabs":
      return {
        provider: "11labs", // Vapi uses "11labs" not "elevenlabs"
        voiceId: voice, // ElevenLabs voice ID
      };
    case "deepgram":
      // Extract voice name from Deepgram format (aura-2-asteria-en → asteria)
      const voiceName = voice.replace(/^aura-2?-/, "").replace(/-en$/, "");
      return {
        provider: "deepgram",
        voiceId: voiceName, // Just the voice name (e.g., "asteria")
      };
    case "polly":
      // Vapi doesn't support Polly directly, fall back to Deepgram
      console.warn(
        "Polly not supported by Vapi, using Deepgram Asteria instead",
      );
      return {
        provider: "deepgram",
        voiceId: "asteria",
      };
    default:
      return {
        provider: "deepgram",
        voiceId: "asteria",
      };
  }
}

// Create or update Vapi assistant
export async function createVapiAssistant(params: {
  name: string;
  systemPrompt: string;
  voiceProvider: string;
  voice: string;
  firstMessageMode?: "assistant-waits-for-user" | "assistant-speaks-first";
}): Promise<string> {
  const voiceConfig = getVoiceConfig(params.voiceProvider, params.voice);

  const webhookUrl = getPublicWebhookUrl("/api/vapi/webhook");

  // Log the system prompt being sent to Vapi (first 500 chars for debugging)
  console.log("=== Creating Vapi Assistant ===");
  console.log("Assistant name:", params.name);
  console.log("Voice provider:", params.voiceProvider);
  console.log("Voice:", params.voice);
  console.log("System prompt (first 500 chars):", params.systemPrompt.substring(0, 500));
  console.log("System prompt (last 500 chars):", params.systemPrompt.substring(params.systemPrompt.length - 500));
  console.log("System prompt total length:", params.systemPrompt.length);

  const assistantPayload = {
    name: params.name,
    firstMessageMode: params.firstMessageMode || "assistant-waits-for-user", // AI only speaks when asked
    model: {
      provider: "openai",
      model: "gpt-4o", // GPT-4 Omni - latest and fastest
      messages: [
        {
          role: "system",
          content: params.systemPrompt,
        },
      ],
      tools: [
        // DTMF button pressing tool
        {
          type: "dtmf",
          async: false,
          function: {
            name: "press_button",
            description:
              'CRITICAL: Use this function to press phone keypad buttons to send DTMF tones. You MUST use this function when the IVR asks you to: "enter", "press", "dial", or "input" ANY digits, numbers, ZIP codes, phone numbers, account numbers, or menu options. NEVER speak digits - always press buttons using this function. Examples: "Please enter your ZIP code" → use press_button for each digit. "Press 1 for sales" → use press_button("1"). "Enter your phone number" → use press_button for each digit. You can press digits 0-9, *, or #.',
            parameters: {
              type: "object",
              properties: {
                digit: {
                  type: "string",
                  description: "The single digit to press (0-9, *, or #)",
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
              },
              required: ["digit"],
            },
          },
        },
        // Call transfer tool
        {
          type: "transferCall",
          destinations: [
            {
              type: "number",
              number: "+16166170915", // Hardcoded transfer destination
              message: "Transferring your call now. Please hold.",
              description: "Transfer to support line",
            },
          ],
          function: {
            name: "transfer_call",
            description: "Transfer the call to another number",
          },
        },
      ],
    },
    voice: voiceConfig,
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en-US",
    },
    // Silence timeout configuration - prevents call drops during hold
    silenceTimeoutSeconds: 1200, // 20 minutes of silence before ending call
    maxDurationSeconds: 3600, // Maximum call duration: 60 minutes
    // Configure webhooks for real-time updates
    serverMessages: [
      "transcript",
      "status-update",
      "end-of-call-report",
      "function-call",
    ],
    serverUrl: webhookUrl,
    // Artifact plan: Controls recording, transcription, and analysis
    artifactPlan: {
      recordingEnabled: true, // Keep recording active during and after transfers
      videoRecordingEnabled: false,
      transcriptPlan: {
        enabled: true, // Keep transcription active during and after transfers
      },
      recordingPath: "mono", // Record all audio in mono format
    },
    endCallMessage: "Thank you for your time. Goodbye.",
    // Enable live monitoring for real-time audio streaming
    monitorPlan: {
      listenEnabled: true, // Enable WebSocket audio streaming for real-time capture
      controlEnabled: true, // Enable live call control
    },
  };

  const response = await vapiClient.post("/assistant", assistantPayload);
  return response.data.id;
}

// Make outbound call via Vapi
export async function makeVapiCall(params: {
  assistantId: string;
  phoneNumber: string;
  customerName?: string;
}): Promise<{
  callId: string;
  vapiCallId: string;
  listenUrl?: string;
  controlUrl?: string;
}> {
  const callPayload = {
    assistantId: params.assistantId,
    phoneNumberId: process.env.PHONE_NUMBER_ID, // Vapi phone number ID
    customer: {
      number: params.phoneNumber,
      name: params.customerName,
    },
  };

  const response = await vapiClient.post("/call/phone", callPayload);

  return {
    callId: response.data.id,
    vapiCallId: response.data.id,
    listenUrl: response.data.monitor?.listenUrl,
    controlUrl: response.data.monitor?.controlUrl,
  };
}

// Get call details from Vapi
export async function getVapiCall(vapiCallId: string): Promise<any> {
  const response = await vapiClient.get(`/call/${vapiCallId}`);
  return response.data;
}

// End call via Vapi
export async function endVapiCall(vapiCallId: string): Promise<void> {
  await vapiClient.delete(`/call/${vapiCallId}`);
}
