const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = "https://api.vapi.ai";

if (!VAPI_API_KEY) {
  console.error("WARNING: VAPI_API_KEY environment variable not set!");
}

const vapiHeaders: Record<string, string> = {
  Authorization: `Bearer ${VAPI_API_KEY}`,
  "Content-Type": "application/json",
};

async function vapiRequest(method: string, path: string, body?: any): Promise<any> {
  const response = await fetch(`${VAPI_BASE_URL}${path}`, {
    method,
    headers: vapiHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw {
      response: {
        status: response.status,
        data: errorText,
      },
      message: `Vapi request failed: ${response.status} ${errorText}`,
    };
  }

  if (response.status === 204) return null;

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

let cachedElevenLabsCredentialId: string | null = null;

async function getElevenLabsCredentialId(): Promise<string | null> {
  if (cachedElevenLabsCredentialId) {
    console.log(
      "[Vapi] Reusing cached ElevenLabs credential:",
      cachedElevenLabsCredentialId,
    );
    return cachedElevenLabsCredentialId;
  }

  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsApiKey) {
    console.error(
      "[Vapi] ELEVENLABS_API_KEY not set - cannot register credential",
    );
    return null;
  }

  console.log("[Vapi] Looking up existing ElevenLabs credentials in Vapi...");
  try {
    const credentials = await vapiRequest("GET", "/credential");
    console.log("[Vapi] Credential list response received");
    const existing = credentials?.find(
      (c: any) => c.provider === "11labs",
    );

    console.log("[Vapi] Creating fresh 11labs credential...");
    try {
      const createResult = await vapiRequest("POST", "/credential", {
        provider: "11labs",
        apiKey: elevenLabsApiKey,
      });
      cachedElevenLabsCredentialId = createResult?.id || null;
      console.log(
        "[Vapi] Created ElevenLabs credential:",
        cachedElevenLabsCredentialId,
      );

      if (existing?.id) {
        console.log("[Vapi] Deleting old 11labs credential:", existing.id);
        try {
          await vapiRequest("DELETE", `/credential/${existing.id}`);
          console.log("[Vapi] Deleted old credential");
        } catch (delErr: any) {
          console.warn(
            "[Vapi] Could not delete old credential:",
            delErr?.response?.data || delErr.message,
          );
        }
      }

      return cachedElevenLabsCredentialId;
    } catch (createErr: any) {
      console.error(
        "[Vapi] Failed to create new ElevenLabs credential:",
        JSON.stringify(createErr?.response?.data) || createErr.message,
      );

      if (existing?.id) {
        console.log("[Vapi] Falling back to existing credential:", existing.id);
        cachedElevenLabsCredentialId = existing.id;
        return cachedElevenLabsCredentialId;
      }

      console.error("[Vapi] No existing credential to fall back to");
      return null;
    }
  } catch (err: any) {
    console.error(
      "[Vapi] Failed to list Vapi credentials:",
      JSON.stringify(err?.response?.data) || err.message,
    );
    return null;
  }
}

function getPublicWebhookUrl(path: string): string {
  const productionUrl = process.env.PRODUCTION_URL;
  if (productionUrl) {
    return `${productionUrl}${path}`;
  }
  return `http://localhost:5000${path}`;
}

export function buildSystemPrompt(
  userInstructions: string,
  callerName: string = "James Martin",
): string {
  return `============================================================
ABSOLUTE RULE #1 - NEVER SPEAK INTERNAL THOUGHTS
============================================================

**THIS IS THE MOST IMPORTANT RULE. VIOLATION = CALL FAILURE.**

You are a REAL PERSON on a phone call. Real people NEVER narrate their thoughts.

FORBIDDEN PHRASES - NEVER SAY THESE OR ANYTHING SIMILAR:
- "Waiting for a live agent..."
- "Waiting for the next prompt..."
- "I am listening..."
- "Waiting silently..."
- "Standing by..."
- "I'll wait..."
- "Let me wait..."
- "I'm here..."
- "I'm ready..."
- "Processing..."
- "One moment..."
- "Hold on..."
- "I understand, I'll..."
- ANY phrase describing what you're doing or thinking
- ANY narration of your internal state
- ANY commentary about the call status

When on HOLD or waiting:
- SAY ABSOLUTELY NOTHING - complete silence
- Do NOT describe your state
- Do NOT narrate what's happening
- Do NOT acknowledge hold music or messages
- Just WAIT SILENTLY until someone DIRECTLY asks you a question

ONLY SPEAK when:
- Someone asks you a direct question
- A live agent greets you by name
- An IVR asks for input

============================================================
ABSOLUTE RULE #2 - INTRODUCTION PHRASE
============================================================

THE PHRASE "Hi. I am calling today to..." OR ANY VARIATION:
- Say it EXACTLY ONCE when a live agent first answers
- NEVER say it again for the rest of the entire call

============================================================
CRITICAL: TWO-MODE OPERATION
============================================================

You operate in TWO MODES.

**MODE 1: IVR MODE** (DEFAULT - Start here)
**MODE 2: LIVE AGENT MODE** (Only after human introduces themselves by name)

============================================================
MODE 1: IVR MODE (DEFAULT AT CALL START)
============================================================

BEHAVIOR IN IVR MODE:
- Stay SILENT until the automated system asks you something
- When prompted, give the SHORTEST possible answer
- NO greetings, NO pleasantries, NO full sentences
- Just answer or press buttons - nothing more

EXAMPLE IVR RESPONSES:
- "What is your zip code?" -> "Seven seven zero zero five"
- "Account number?" -> "Eight five zero six three two one"
- "State your name" -> "${callerName}"
- "Press 1 for billing, 2 for tech" -> press_button("1")

============================================================
MODE 2: LIVE AGENT MODE
============================================================

FIRST THING TO SAY: "Hi there, I am calling today to [brief task summary]."

Then answer questions directly. One piece of info at a time.

============================================================
ROLE & ACCOUNT INFO
============================================================

You are ${callerName}, calling on behalf of the location in the account section.

${userInstructions}

------------------------------------------------------------
TECHNICAL INSTRUCTIONS:
Keep responses concise and conversational, suitable for text-to-speech.
The press_button function is your PRIMARY tool for IVR navigation.`;
}

interface VoiceConfig {
  provider: "11labs" | "deepgram" | "azure";
  voiceId: string;
  stability?: number;
  similarityBoost?: number;
  useSpeakerBoost?: boolean;
  style?: number;
}

function getVoiceConfig(voice: string): VoiceConfig {
  return {
    provider: "11labs",
    voiceId: voice,
    stability: 0.7,
    similarityBoost: 0.8,
    useSpeakerBoost: true,
    style: 0.3,
  };
}

export async function createVapiAssistant(params: {
  name: string;
  systemPrompt: string;
  voice: string;
  firstMessageMode?: "assistant-waits-for-user" | "assistant-speaks-first";
}): Promise<string> {
  const voiceConfig: any = getVoiceConfig(params.voice);

  await getElevenLabsCredentialId();

  const modelName = "gpt-4.1-mini";
  const webhookUrl = getPublicWebhookUrl("/api/vapi/webhook");

  console.log("=== Creating Vapi Assistant ===");
  console.log("Assistant name:", params.name);
  console.log("Voice:", params.voice);

  const assistantPayload = {
    name: params.name,
    firstMessageMode: "assistant-speaks-first",
    responseDelaySeconds: 0.3,
    model: {
      provider: "openai",
      model: modelName,
      messages: [
        { role: "system", content: params.systemPrompt },
        {
          role: "user",
          content: "Remember: You MUST respond when IVR asks you questions.",
        },
        {
          role: "assistant",
          content: "Understood. I will always respond to IVR questions.",
        },
      ],
      tools: [
        { type: "dtmf", async: false },
        {
          type: "transferCall",
          destinations: [
            {
              type: "number",
              number: "+19134395811",
              message: "Let me transfer the call now. Can you hold for just a sec?",
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
    firstMessage: "...",
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en-US",
      endpointing: 500,
    },
    backgroundDenoisingEnabled: true,
    backchannelingEnabled: false,
    startSpeakingPlan: {
      waitSeconds: 0.8,
      smartEndpointingPlan: { provider: "vapi" },
      transcriptionEndpointingPlan: {
        onPunctuationSeconds: 0.5,
        onNoPunctuationSeconds: 1.5,
        onNumberSeconds: 1.0,
      },
    },
    stopSpeakingPlan: {
      numWords: 3,
      voiceSeconds: 0.5,
      backoffSeconds: 1.5,
    },
    silenceTimeoutSeconds: 600,
    maxDurationSeconds: 3600,
    serverMessages: ["transcript", "status-update", "end-of-call-report", "function-call"],
    serverUrl: webhookUrl,
    artifactPlan: {
      recordingEnabled: true,
      videoRecordingEnabled: false,
      transcriptPlan: {
        enabled: true,
        assistantName: "James Martin",
        userName: "Agent",
      },
      recordingPath: "mono",
    },
    endCallMessage: "Thank you for your help. I appreciate it. Have a great day and Thanks again. goodbye.",
    monitorPlan: {
      listenEnabled: true,
      controlEnabled: true,
    },
  };

  try {
    const data = await vapiRequest("POST", "/assistant", assistantPayload);
    console.log("VAPI ASSISTANT CREATED - ID:", data.id);
    return data.id;
  } catch (error: any) {
    console.error("VAPI ASSISTANT CREATION FAILED:", error.response?.data || error.message);
    throw error;
  }
}

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
  const data = await vapiRequest("POST", "/call/phone", {
    assistantId: params.assistantId,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
    customer: {
      number: params.phoneNumber,
      name: params.customerName,
    },
  });

  return {
    callId: data.id,
    vapiCallId: data.id,
    listenUrl: data.monitor?.listenUrl,
    controlUrl: data.monitor?.controlUrl,
  };
}

export async function getVapiCall(vapiCallId: string): Promise<any> {
  return await vapiRequest("GET", `/call/${vapiCallId}`);
}

export async function endVapiCall(vapiCallId: string): Promise<void> {
  await vapiRequest("DELETE", `/call/${vapiCallId}`);
}

export async function enablePhoneNumberDTMF(): Promise<{
  updated: boolean;
  enabled: boolean;
}> {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    console.warn("PHONE_NUMBER_ID not set");
    return { updated: false, enabled: false };
  }

  try {
    const phoneConfig = await vapiRequest("GET", `/phone-number/${phoneNumberId}`);
    console.log("Phone number configured:", phoneConfig.number);
    return { updated: false, enabled: true };
  } catch (error: any) {
    console.error("Failed to verify phone number:", error.response?.data || error.message);
    return { updated: false, enabled: false };
  }
}
