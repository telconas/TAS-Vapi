import axios from 'axios';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = 'https://api.vapi.ai';

if (!VAPI_API_KEY) {
  console.error('WARNING: VAPI_API_KEY environment variable not set!');
}

const vapiClient = axios.create({
  baseURL: VAPI_BASE_URL,
  headers: {
    'Authorization': `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json',
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
-- If the agent asks for your phone number, say "913-300-9959."
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

// Voice provider configuration
interface VoiceConfig {
  provider: 'elevenlabs' | 'deepgram' | 'azure';
  voiceId: string;
}

function getVoiceConfig(voiceProvider: string, voice: string): VoiceConfig {
  switch (voiceProvider) {
    case 'elevenlabs':
      return {
        provider: 'elevenlabs',
        voiceId: voice, // ElevenLabs voice ID
      };
    case 'deepgram':
      // Extract voice name from Deepgram format (aura-2-asteria-en → asteria)
      const voiceName = voice.replace(/^aura-2?-/, '').replace(/-en$/, '');
      return {
        provider: 'deepgram',
        voiceId: voiceName, // Just the voice name (e.g., "asteria")
      };
    case 'polly':
      // Vapi doesn't support Polly directly, fall back to Deepgram
      console.warn('Polly not supported by Vapi, using Deepgram Asteria instead');
      return {
        provider: 'deepgram',
        voiceId: 'asteria',
      };
    default:
      return {
        provider: 'deepgram',
        voiceId: 'asteria',
      };
  }
}

// Create or update Vapi assistant
export async function createVapiAssistant(params: {
  name: string;
  systemPrompt: string;
  voiceProvider: string;
  voice: string;
  firstMessageMode?: 'assistant-waits-for-user' | 'assistant-speaks-first';
}): Promise<string> {
  const voiceConfig = getVoiceConfig(params.voiceProvider, params.voice);
  
  const webhookUrl = getPublicWebhookUrl('/api/vapi/webhook');
  
  const assistantPayload = {
    name: params.name,
    firstMessageMode: params.firstMessageMode || 'assistant-waits-for-user', // AI only speaks when asked
    model: {
      provider: 'openai',
      model: 'gpt-4-1106-preview', // GPT-4 Turbo
      messages: [
        {
          role: 'system',
          content: params.systemPrompt,
        },
      ],
      tools: [
        // DTMF button pressing tool
        {
          type: 'dtmf',
          async: false,
          function: {
            name: 'press_button',
            description: 'Press a button on the phone keypad to navigate IVR menus or enter digits. Use this when you hear a phone menu (e.g., "Press 1 for Sales"). You can press digits 0-9, *, or #.',
            parameters: {
              type: 'object',
              properties: {
                digit: {
                  type: 'string',
                  description: 'The digit to press (0-9, *, or #)',
                  enum: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#'],
                },
              },
              required: ['digit'],
            },
          },
        },
        // Call transfer tool
        {
          type: 'transferCall',
          destinations: [
            {
              type: 'number',
              number: '+16166170915', // Hardcoded transfer destination
              message: 'Transferring your call now. Please hold.',
              description: 'Transfer to support line',
            },
          ],
          function: {
            name: 'transfer_call',
            description: 'Transfer the call to another number',
          },
        },
      ],
    },
    voice: voiceConfig,
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en-US',
    },
    // Configure webhooks for real-time updates
    serverMessages: ['transcript', 'status-update', 'end-of-call-report', 'function-call'],
    serverUrl: webhookUrl,
    recordingEnabled: true, // Enable call recording
    endCallMessage: 'Thank you for your time. Goodbye.',
    // Enable live monitoring for real-time audio streaming
    monitorPlan: {
      listenEnabled: true, // Enable WebSocket audio streaming
      controlEnabled: true, // Enable live call control
    },
  };

  const response = await vapiClient.post('/assistant', assistantPayload);
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

  const response = await vapiClient.post('/call/phone', callPayload);
  
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

// Send message to active call (operator instructions)
export async function sendVapiMessage(vapiCallId: string, message: string): Promise<void> {
  await vapiClient.post(`/call/${vapiCallId}/message`, {
    type: 'assistant-message',
    message: {
      role: 'system',
      content: message,
    },
  });
}
