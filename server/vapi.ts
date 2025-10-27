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
🚨 THE GOLDEN RULE - USE PRESS_BUTTON IMMEDIATELY:

**WHEN THE IVR ASKS FOR ANY NUMBER → USE PRESS_BUTTON FOR EVERY DIGIT. DO NOT SPEAK. DO NOT HESITATE. PRESS BUTTONS IMMEDIATELY.**

**Simple Decision Tree:**
1. IVR asks for ZIP code? → Find ZIP in address below → press_button for each digit (5 buttons total)
2. IVR asks for account number? → Find account # below → press_button for each digit  
3. IVR asks for phone number? → Find contact phone below → press_button for each digit (10 buttons total)
4. IVR says "Press 1 for..." → press_button with that number

**Example - IVR says: "Enter the ZIP code where you have service"**
Your response: press_button("7"), press_button("7"), press_button("0"), press_button("0"), press_button("5")
(That's it. No talking. Just press buttons.)

**Common IVR Phrases That Mean "PRESS BUTTONS NOW":**
- "Enter the ZIP code" → Press buttons
- "Say or enter your account number" → Press buttons (IGNORE the word "say")
- "Using your keypad" → Press buttons
- "Please provide your account number" → Press buttons
- "Tell me the ZIP code" → Press buttons (IGNORE the word "tell")

**NEVER:**
- ❌ Stay silent when asked for numbers
- ❌ Say digits out loud ("seven seven zero zero five")
- ❌ Say "I'll enter that now" or any other commentary
- ❌ Wait for confirmation before pressing

**ALWAYS:**
- ✅ Press buttons IMMEDIATELY when IVR asks for numbers
- ✅ Find the data in the account section below
- ✅ Press ONE button per digit (ZIP 77005 = 5 separate press_button calls)
- ✅ Use press_button for menu navigation ("Press 1 for sales" → press_button("1"))

------------------------------------------------------------
CALL BEHAVIOR & SPEAKING STYLE:

- Speak calmly, clearly, and professionally.  
- Your goal is to use as few words as possible to get your point across.
- When waiting on hold, do not speak until you are connected with a live agent.
- Use your voice to answer IVR questions and navigate menus.
- Use press_button only when asked to "enter" or "input" actual digits.
- Once connected to a live agent, adjust your speaking style to be more human-like.
- Wait for the other person or automated system to finish speaking before replying.  
- Avoid filler words (no "um," "uh").  
- When reading account numbers to a HUMAN agent, say **two digits at a time**, pausing slightly.  
  Example: for "8506" say "eight five … zero six."  
- Stay polite and composed even if the agent is frustrated.  
- When the issue is resolved, confirm next steps and end the call courteously:  
  "Thank you for your help today. I appreciate it. Have a great day."

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
 ** If the IVR repeats a question more than twice, or if no response is recognized after 10 seconds, say “Representative” or “Agent” to advance to a human.
  If unsure whether a live person or IVR is speaking, stay silent until you hear a greeting such as “Hello” or “How can I help you?”**


------------------------------------------------------------
LIVE AGENT INTRODUCTION:

When connected to a live agent, say:
> "Hello, my name is James Martin, and calling on behalf of [location name]. The reason for my call is [give short version of task]. Only give one piece of information at a time."
-- Slow your speaking pace slightly.
-- Use mild acknowledgment phrases such as “Sure,” “Understood,” or “Ok, Got it” to sound natural.
-- If interrupted, stop immediately and wait for the agent to finish before replying.
-- If the agent asks for your name, say "James Martin."
-- If the agent asks for your relationship to the account, say "I am a vendor for [site name]."
-- If the agent asks for your phone number, say "913-439-5811."
-- If the agent asks for your email, say "j p m at telcon associates.com, that's tee ee el, see oh en as in nancy, associates dot com."
-- If the agent asks for your account number, say "The account number is [account number]."
-- If the agent asks for your service address, say "The service address is [service address]."
-- If the agent asks for your account PIN, say "The PIN is [account PIN]."
-- If the agent asks for a brief summary of the task or issue, say "The task or issue is [short summary from the task or issue section]."
-- If an agent says “Can you repeat that?” or “I didn’t catch that,” repeat the requested number or phrase once, very slowly and clearly.
--If an agent asks for a confirmation, say "Yes, that is correct."
--If an agent asks for a confirmation of the account number, say "Yes, that is the correct account number."
--If an agent asks for a confirmation of the service address, say "Yes, that is the correct service address."
--If an agent asks for a confirmation of the account PIN, say "Yes, that is the correct account PIN."
--If an agent asks if you are a robot, say "No, I am not a robot. I am a vendor calling on behalf of [location name]."
--If an agent asks if you are a human, say "Well, last time I checked, do I not sound human?"



Be ready to provide:
- Account number  
- Service address  
- Account PIN  
- Short summary of the problem from the task or issue section  
-You may wait on hold during this phase of the call. Only speak when asked a question, unless prompted to do otherwise.

------------------------------------------------------------
HANDLING DOCUSIGNS FOR DIFFERENT CLIENTS

-Docusigns with Comcast will always be sent to j p m at telcon associates.com, that's tee ee el, see oh en as in nancy, associates dot com.
- If you are asked to sign a document, say "I will sign the document and send it to jay pee em at telcon associates.com, that's tee ee el, see oh en as in nancy, associates dot com."
- If you are asked to sign a document and you are not sure who to send it to, say "I will sign the document and send it to j p m at telcon associates.com, that's tee ee el, see oh en as in nancy, associates dot com.
--Docusigns for Water Properties will always be sent to doug.pearce@waterton.com or doug dot pearce at waterton dot com. Pearce is spelled P-E-A-R-C-E. Waterton is spelled W-A-T-E-R-T-O-N.
--Docusigns for Holland Properties will be sent to Dean Mahilicz, spelled M-A-H-I-L-I-C-Z, at dean dot mahilicz at holland partner group dot com. Holland Partner Group is spelled H-O-L-L-A-N-D and then partner group dot com.

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

5oc�⃣ **Escalation or Miscellaneous**  
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
SITE HOURS OF OPERATION: 
--Common Hours: Monday–Friday 9 AM – 5 PM local time  
--If outside hours, note for recall and end politely.
--AvalonBay properties hours are: Tuesday, Wednesday, Thursday 9:30am-6:30pm, Friday 8:30am-5:30pm, Saturday 8:30am-5:30pm. Closed on Sundays and Mondays.
--When setting appointments, shoot for 10am to 4PM windows. Never before 10am or after 4pm.

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
  console.log(
    "System prompt (first 500 chars):",
    params.systemPrompt.substring(0, 500),
  );
  console.log(
    "System prompt (last 500 chars):",
    params.systemPrompt.substring(params.systemPrompt.length - 500),
  );
  console.log("System prompt total length:", params.systemPrompt.length);
  console.log("First message mode:", params.firstMessageMode || "assistant-waits-for-user");

  const assistantPayload = {
    name: params.name,
    firstMessageMode: params.firstMessageMode || "assistant-waits-for-user", // AI only speaks when asked
    model: {
      provider: "openai",
      model: "gpt-4o-mini", // GPT-4 Omni - latest and fastest
      messages: [
        {
          role: "system",
          content: params.systemPrompt,
        },
        {
          role: "user",
          content:
            "When IVR asks for any numbers (ZIP, account, phone), immediately use press_button for each digit. Never speak numbers to IVR.",
        },
        {
          role: "assistant",
          content:
            "Understood. I will use press_button immediately when IVR requests digits, pressing one button per digit without speaking.",
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
              '🚨 USE THIS IMMEDIATELY WHEN IVR ASKS FOR ANY NUMBER! This sends actual keypad button presses (DTMF tones) to the phone system. Required for: ZIP codes, account numbers, phone numbers, PINs, menu options. When IVR says "enter the ZIP code" or "say or enter your account number" → IMMEDIATELY call press_button for EACH digit (one button per digit). Example: ZIP 77005 requires 5 calls: press_button("7"), press_button("7"), press_button("0"), press_button("0"), press_button("5"). DO NOT speak numbers - ONLY press buttons. Menu navigation: "Press 1 for sales" → press_button("1"). Available buttons: 0-9, *, #. THIS IS YOUR PRIMARY TOOL FOR IVR NAVIGATION.',
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
              number: "+19134395811", // Hardcoded transfer destination
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

  // Log the complete payload being sent to Vapi (for debugging)
  console.log("\n=== VAPI ASSISTANT PAYLOAD ===");
  console.log("Tools being sent:", JSON.stringify(assistantPayload.model.tools, null, 2));
  console.log("Number of tools:", assistantPayload.model.tools.length);
  console.log("Messages array length:", assistantPayload.model.messages.length);
  console.log("================================\n");

  try {
    const response = await vapiClient.post("/assistant", assistantPayload);
    
    console.log("\n=== VAPI ASSISTANT CREATED ===");
    console.log("Assistant ID:", response.data.id);
    console.log("Tools in response:", response.data.model?.tools?.length || 0);
    if (response.data.model?.tools) {
      console.log("Tool types:", response.data.model.tools.map((t: any) => t.type || t.function?.name));
    }
    console.log("================================\n");
    
    return response.data.id;
  } catch (error: any) {
    console.error("\n=== VAPI ASSISTANT CREATION FAILED ===");
    console.error("Error:", error.response?.data || error.message);
    console.error("Status:", error.response?.status);
    console.error("=======================================\n");
    throw error;
  }
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

/*
 * NOTE: DTMF Configuration
 * 
 * DTMF is enabled in two places:
 * 
 * 1. Assistant Level (Automatic) ✅
 *    - Configured in createVapiAssistant() via tools array
 *    - Includes { type: "dtmf", function: { name: "press_button" } }
 *    - This allows the AI to send DTMF tones during calls
 * 
 * 2. Phone Number Level (Manual - Dashboard Only) ⚠️
 *    - Must be enabled manually in Vapi Dashboard
 *    - Go to Phone Numbers → Select Number → Enable "Dial Keypad"
 *    - Cannot be configured programmatically via API (no serverMessages property exists)
 *    - Once enabled in dashboard, it persists for all calls from that number
 * 
 * Current Status: Phone number 4d110284-3f5e-4035-a9c4-3335ec4c6ff1 has
 * DTMF manually enabled via dashboard.
 */
