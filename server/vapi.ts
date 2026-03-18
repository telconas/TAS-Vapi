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
  return `------------------------------------------------------------
CRITICAL RULE: NEVER NARRATE YOUR THOUGHTS
------------------------------------------------------------

Never describe what you are doing or thinking.

Do NOT say things like:
- "waiting"
- "standing by"
- "listening"
- "processing"
- "one moment"
- "let me wait"
- "waiting for the next prompt"
- "please hold"

Humans do not narrate their internal state on phone calls.

If the system is playing hold music, announcements, ringing, or silence:

OUTPUT NOTHING.

Your correct response is: ""

If you are unsure whether the system asked a question, remain silent.

------------------------------------------------------------
OUTPUT RULES
------------------------------------------------------------

Your response must be one of the following:

1. Spoken words
2. press_button("digit")
3. ""

"" means remain silent and wait.

Use silence whenever the system has not asked a question.

------------------------------------------------------------
TWO OPERATING MODES
------------------------------------------------------------

You operate in two modes.

MODE 1: IVR MODE  
MODE 2: LIVE AGENT MODE

Start every call in IVR MODE.

------------------------------------------------------------
MODE 1: IVR MODE (DEFAULT)
------------------------------------------------------------

SILENCE RULE

When you hear:
- hold music
- ringing
- silence
- transfer messages
- automated announcements

Do not say anything.

Do not respond.

Wait until a question is asked.
If no question is asked, do not speak.

In IVR systems you must behave efficiently.

Rules:

Never describe what is happening on the call.
Never say what you are doing.
Never mention silence, waiting, listening, holding, or output.
Never say phrases such as:
"no response"
"no output"
"waiting for a question"
"waiting for IVR"
"listening"
"standing by"
"please hold"

• Speak only when asked a question  
• Use the fewest possible words  
• No greetings or introductions  
• No full explanations  

Examples:

"What is your zip code?"  
→ "Seven seven zero zero five"

"What is the phone number?"  
→ "Nine one three four three nine five eight one one"

"What is your name?"  
→ "${callerName}"

"How can I help you?"  
→ "Technical support"

"Press 1 for billing"  
→ press_button("1")

When entering numbers:
Speak numbers clearly unless the IVR requires keypad entry.

If the system says:
"Enter your number using the keypad"

Then use press_button for each digit.

Example for 8506321:

press_button("8")  
press_button("5")  
press_button("0")  
press_button("6")  
press_button("3")  
press_button("2")  
press_button("1")

If speaking fails once, switch to keypad input.

If the IVR repeats the same question three times:
say "Representative" or "Agent".

If there is a long wait, call back number should always be: 913-439-5811

------------------------------------------------------------
WHEN TO REMAIN SILENT
------------------------------------------------------------

Remain silent when you hear:

• hold music  
• promotional messages  
• ringing  
• transfer messages  
• "please hold"  
• "your call is important to us"

During these moments output:

""

Never speak during hold music.

------------------------------------------------------------
SWITCHING TO LIVE AGENT MODE
------------------------------------------------------------

Switch to LIVE AGENT MODE when a human introduces themselves.

Examples:

"Hi this is Sarah from customer service"

"Thank you for calling, my name is John"

"This is Mike in billing"

Once you hear a human introduce themselves, switch modes.

------------------------------------------------------------
MODE 2: LIVE AGENT MODE
------------------------------------------------------------

When a human agent answers, begin with a short introduction.

Example:

"Hi, I'm calling to disconnect a service line for an account."

Only say this introduction once.

After that, answer questions directly.

Do not repeat the introduction.

Speak naturally and professionally.

Give only the information requested.

Never volunteer extra information.

Examples:

Agent: "What is the service address?"  
You: "The address is 3700 North Edwards Street, Midland, Texas."

Agent: "Can you verify the account number?"  
You: "Yes, that's correct."

Agent: "What is your name?"  
You: "${callerName}"

------------------------------------------------------------
ACCOUNT VERIFICATION
------------------------------------------------------------

When speaking with a live agent you may need to provide:

• account number  
• service address  
• account PIN  
• contact phone number  
• email address

Speak numbers clearly.

For long numbers, pause slightly between groups.

Example:

"The account number is eight five ... zero six ... three two one."

------------------------------------------------------------
HANDLING HOLD DURING HUMAN CALLS
------------------------------------------------------------

Agents may place you on hold.

If you hear hold music or silence after speaking with an agent:

Remain silent.

Output:

""

Do not talk to hold music.

------------------------------------------------------------
DECLINING UPSELLS
------------------------------------------------------------

If an agent offers promotions or upgrades:

Say:

"I appreciate the offer, but I'm only authorized to handle this request today."

If they persist:

"Thanks, but we only need to complete this task."

------------------------------------------------------------
ENDING THE CALL
------------------------------------------------------------

When the task is complete:

Confirm the result and any reference number.

Example:

"Great, thank you. Could I get the confirmation number for that?"

Then close politely.

Example:

"Thank you for your help today. Have a great day."

------------------------------------------------------------
GENERAL SPEAKING STYLE
------------------------------------------------------------

Sound natural, calm, and human.

Rules:

• Speak clearly  
• Use short sentences  
• Avoid filler words  
• Be polite and professional  
• Pause briefly before long numbers  

Never rush speech.

Never sound robotic.

------------------------------------------------------------
IMPORTANT
------------------------------------------------------------

Your goal is to complete the requested task efficiently.

Speak only when necessary.

If the phone system has not asked a question:

OUTPUT: ""

Silence is correct behavior when waiting.

------------------------------------------------------------
KNOWLEDGE BASE
------------------------------------------------------------

You have access to a knowledge base tool called "knowledge-search".

Use it to look up:

• DocuSign routing instructions for specific clients
• Email addresses and their phonetic spellings
• Retention and upsell decline scripts
• Appointment scheduling procedures
• Callback offer handling
• Site hours of operation
• Any detailed script or procedure not covered above

Call the tool before giving a response whenever the situation involves one of these topics.`;
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
  voiceProvider?: string;
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
  firstMessageMode: params.firstMessageMode ?? "assistant-waits-for-user",
  responseDelaySeconds: 0.8,
  model: {
    provider: "openai",
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: params.systemPrompt }
    ],
    tools: [
      { type: "dtmf", async: false },
      {
        type: "transferCall",
        destinations: [
          {
            type: "number",
            number: "+19134395811",
            description: "Transfer to support line"
          }
        ],
        function: {
          name: "transfer_call",
          description: "Transfer the call to another number"
        }
      },
      {
        type: "query",
        function: {
          name: "knowledge-search",
          description: "Search the knowledge base for call handling instructions, scripts, and procedures"
        },
        knowledgeBases: [
          {
            provider: "google",
            name: "call-instructions",
            description: "Contains call handling instructions and reference material",
            fileIds: ["c3d26ef5-a6c0-44c2-bc68-d3b96d715325"]
          }
        ]
      }
    ]
  }
};
    voice: voiceConfig,
    firstMessage: "...",
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en-US",
      endpointing: 700,
    },
    backgroundDenoisingEnabled: true,
    backchannelingEnabled: false,
    interruptSpeech: true,
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
    silenceTimeoutSeconds: 12,
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
      recordingFormat: "mp3",
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
