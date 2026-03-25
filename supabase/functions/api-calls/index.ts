import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const COST_PER_MINUTE = 0.12;
const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY") || "";
const VAPI_BASE_URL = "https://api.vapi.ai";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") || "";
const SENDGRID_FROM_EMAIL = Deno.env.get("SENDGRID_FROM_EMAIL") || "avb@telconassociates.com";
const PHONE_NUMBER_ID = Deno.env.get("PHONE_NUMBER_ID") || "";
const TRANSFER_NUMBER = Deno.env.get("TRANSFER_NUMBER") || "+19134395811";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function vapiRequest(method: string, path: string, body?: any): Promise<any> {
  const response = await fetch(`${VAPI_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vapi request failed: ${response.status} ${errorText}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function buildSystemPrompt(userInstructions: string, callerName: string = "${callerName}"): string {
  return `You are ${callerName}, a real person on a phone call. You have one job: answer questions when asked, and say nothing otherwise.

RULE 1 — OUTPUT NOTHING UNLESS DIRECTLY ASKED A QUESTION.
Do not speak to fill silence. Do not narrate. Do not describe what you are doing. Do not acknowledge hold music, automated messages, or pauses. If nothing has been asked of you, produce no output at all.

RULE 2 — IVR NAVIGATION.
When an automated system asks for input, give the shortest possible answer or press the correct button. No greetings. No full sentences. Just the answer.
Examples:
- "What is your zip code?" → "Seven seven zero zero five"
- "Please say your name" → "${callerName}"
- "Press 1 for billing" → press_button("1")

RULE 3 — LIVE AGENT GREETING.
When a live human agent first speaks to you, say: "Hi, I am calling today to [brief task summary]." Say this exactly once, never again.

RULE 4 — ANSWER QUESTIONS DIRECTLY.
Give one piece of information at a time. Keep answers short and conversational.

RULE 5 — SPEAKING NUMBERS SLOWLY.
When speaking any account number, phone number, confirmation number, or ZIP code, you MUST insert a comma after every single digit so the TTS engine pauses between each one.
Example: account number 1234567 → "1, 2, 3, 4, 5, 6, 7"
Example: ZIP code 77005 → "7, 7, 0, 0, 5"
NEVER read digits in groups or run them together. Always one digit, pause, next digit.

ACCOUNT & TASK INFORMATION:
${userInstructions}

Technical note: Use press_button for all DTMF/IVR button inputs.`;
}

async function createVapiAssistant(params: {
  name: string;
  systemPrompt: string;
  voiceProvider: string;
  voice: string;
}): Promise<string> {
  let voiceConfig: any;

  switch (params.voiceProvider) {
    case "elevenlabs":
    default:
      voiceConfig = {
        provider: "11labs",
        voiceId: params.voice,
        stability: 0.7,
        similarityBoost: 0.8,
        useSpeakerBoost: true,
        style: 0.3,
      };
  }

  const supabaseUrl = SUPABASE_URL;
  const webhookUrl = `${supabaseUrl}/functions/v1/vapi-webhook`;

  const assistantPayload = {
    name: params.name,
    firstMessageMode: "assistant-waits-for-user",
    responseDelaySeconds: 0.3,
    model: {
      provider: "openai",
      model: "gpt-4.1",
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: "Remember: You MUST respond when IVR asks you questions." },
        { role: "assistant", content: "Understood. I will always respond to IVR questions." },
      ],
      tools: [
        { type: "dtmf", async: false },
        {
          type: "transferCall",
          destinations: [
            {
              type: "number",
              number: TRANSFER_NUMBER,
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
        assistantName: "${callerName}",
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

  const data = await vapiRequest("POST", "/assistant", assistantPayload);
  return data.id;
}

async function makeVapiCall(params: {
  assistantId: string;
  phoneNumber: string;
  customerName?: string;
}): Promise<{ callId: string; vapiCallId: string; listenUrl?: string; controlUrl?: string }> {
  const data = await vapiRequest("POST", "/call/phone", {
    assistantId: params.assistantId,
    phoneNumberId: PHONE_NUMBER_ID,
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

async function endVapiCall(vapiCallId: string, controlUrl?: string): Promise<void> {
  if (controlUrl) {
    const response = await fetch(controlUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "end-call" }),
    });
    if (response.ok) return;
  }
  await vapiRequest("DELETE", `/call/${vapiCallId}`);
}

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

Transcript:
${transcriptText}`;
}

async function pollForRecording(supabase: any, vapiCallId: string, dbCallId: string): Promise<string | null> {
  const maxAttempts = 12;
  const delayMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      const response = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
        headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
      });
      if (!response.ok) continue;
      const vapiCall = await response.json();
      const recordingUrl =
        vapiCall?.artifact?.recordingUrl ||
        vapiCall?.artifact?.stereoRecordingUrl ||
        vapiCall?.recordingUrl;
      if (recordingUrl) {
        await supabase.from("calls").update({ recording_url: recordingUrl }).eq("id", dbCallId);
        return recordingUrl;
      }
    } catch (_) {
      // continue polling
    }
  }
  return null;
}

async function generateSummaryAndEmail(supabase: any, callId: string): Promise<void> {
  const { data: call } = await supabase.from("calls").select().eq("id", callId).maybeSingle();
  if (!call) return;

  let recordingUrl = call.recording_url;
  if (!recordingUrl && call.twilio_call_sid) {
    recordingUrl = await pollForRecording(supabase, call.twilio_call_sid, callId);
  }

  const { data: transcripts } = await supabase
    .from("transcript_messages")
    .select()
    .eq("call_id", callId)
    .order("timestamp", { ascending: true });

  if (!transcripts || transcripts.length === 0) return;

  const cleanTranscripts = (transcripts as any[])
    .filter((t: any) => !t.text.startsWith("[INTERNAL:"))
    .map((t: any) => `${t.speaker === "ai" ? "JPM" : "Representative"}: ${t.text}`)
    .join("\n");

  if (!cleanTranscripts.trim()) return;

  const summaryPrompt = buildSummaryPrompt(cleanTranscripts);

  const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: summaryPrompt }],
      temperature: 0.3,
    }),
  });

  if (!openaiResponse.ok) return;

  const openaiData = await openaiResponse.json();
  const summary = openaiData.choices?.[0]?.message?.content || "";
  if (!summary) return;

  await supabase.from("calls").update({ summary }).eq("id", callId);

  await supabase.channel("call-events").send({
    type: "broadcast",
    event: "call_summary",
    payload: { callId, summary },
  });

  const { data: freshCall } = await supabase.from("calls").select("duration, email_recipient, phone_number, recording_url, created_at").eq("id", callId).maybeSingle();

  if ((freshCall?.email_recipient || call.email_recipient) && SENDGRID_API_KEY) {
    const rawDuration = freshCall?.duration ?? call.duration ?? 0;
    const createdAtMs = new Date(call.created_at).getTime();
    const wallClock = !isNaN(createdAtMs) ? Math.floor((Date.now() - createdAtMs) / 1000) : 0;
    const duration = rawDuration > 0 ? rawDuration : wallClock;
    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    };

    const sentences = summary.includes("\n")
      ? summary.split("\n").map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : [summary];

    const bulletListHtml = sentences.map((s: string) => `<li>${s}</li>`).join("");
    const hasRecording = recordingUrl && recordingUrl.trim().length > 0;

    const emailHtml = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:#219ebc;color:white;padding:20px;border-radius:5px 5px 0 0}.content{background:#f9f9f9;padding:20px;border:1px solid #ddd}.summary{background:white;padding:15px;border-left:4px solid #219ebc;margin:20px 0}.summary ul{margin:0;padding-left:20px}.summary li{margin:8px 0}.meta{color:#666;font-size:14px;margin:10px 0}.footer{text-align:center;margin-top:20px;color:#999;font-size:12px}.recording-link{display:inline-block;background:#219ebc;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;margin-top:10px}</style></head><body><div class="container"><div class="header"><h1>TAS Call Summary</h1></div><div class="content"><p class="meta"><strong>Phone Number:</strong> ${call.phone_number}</p><p class="meta"><strong>Duration:</strong> ${formatDuration(duration)}</p><h2>Summary of TAS Call</h2><div class="summary"><ul>${bulletListHtml}</ul></div>${hasRecording ? `<p><a href="${recordingUrl}" class="recording-link">Listen to Recording</a></p>` : `<p style="color:#999;font-style:italic;margin-top:15px;">Recording not available</p>`}</div><div class="footer"><p>TAS AI Agent</p></div></div></body></html>`;

    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: call.email_recipient }] }],
        from: { email: SENDGRID_FROM_EMAIL },
        subject: `Call Summary: ${call.phone_number} (${formatDuration(duration)})`,
        content: [{ type: "text/html", value: emailHtml }],
      }),
    });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = getSupabase();

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api-calls/, "");

    // GET /calls/:callId
    if (req.method === "GET" && path.match(/^\/calls\/[^/]+$/)) {
      const callId = path.split("/")[2];
      const { data: call, error } = await supabase.from("calls").select().eq("id", callId).maybeSingle();
      if (error || !call) {
        return new Response(JSON.stringify({ error: "Call not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const mappedCall = {
        id: call.id,
        phoneNumber: call.phone_number,
        prompt: call.prompt,
        status: call.status,
        duration: call.duration,
        startedAt: call.started_at,
        endedAt: call.ended_at,
        voiceId: call.voice_id,
        voiceName: call.voice_name,
        pollyVoice: call.polly_voice,
        voiceProvider: call.voice_provider,
        deepgramVoice: call.deepgram_voice,
        twilioCallSid: call.twilio_call_sid,
        recordingUrl: call.recording_url,
        summary: call.summary,
        emailRecipient: call.email_recipient,
        listenUrl: call.listen_url,
        controlUrl: call.control_url,
        callType: call.call_type,
        callerName: call.caller_name,
      };

      return new Response(JSON.stringify(mappedCall), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /calls/start
    if (req.method === "POST" && path === "/calls/start") {
      const body = await req.json();
      const {
        phoneNumber,
        prompt,
        callerName,
        deepgramVoice,
        elevenLabsVoice,
        voiceProvider,
        emailRecipient,
        providerName,
      } = body;

      if (!phoneNumber) {
        return new Response(JSON.stringify({ error: "Phone number is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!prompt) {
        return new Response(JSON.stringify({ error: "AI prompt is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const validatedProvider = "elevenlabs";
      const validatedElevenLabsVoice = elevenLabsVoice || "21m00Tcm4TlvDq8ikWAM";

      const { data: call, error: insertError } = await supabase
        .from("calls")
        .insert({
          phone_number: phoneNumber,
          prompt,
          status: "ringing",
          voice_provider: validatedProvider,
          voice_id: validatedElevenLabsVoice,
          duration: 0,
          email_recipient: emailRecipient || null,
          call_type: "ai",
          caller_name: callerName || "James Martin",
          provider_name: providerName || null,
        })
        .select()
        .single();

      if (insertError || !call) {
        return new Response(JSON.stringify({ error: "Failed to create call record" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const validatedCallerName = callerName || "James Martin";
      const systemPrompt = buildSystemPrompt(prompt, validatedCallerName);
      const voice = validatedElevenLabsVoice;

      const assistantId = await createVapiAssistant({
        name: `Call ${call.id.substring(0, 8)}`,
        systemPrompt,
        voiceProvider: validatedProvider,
        voice,
      });

      const { vapiCallId, listenUrl, controlUrl } = await makeVapiCall({
        assistantId,
        phoneNumber,
        customerName: "Customer",
      });

      await supabase.from("calls").update({
        twilio_call_sid: vapiCallId,
        listen_url: listenUrl || null,
        control_url: controlUrl || null,
      }).eq("id", call.id);

      await supabase.channel("call-events").send({
        type: "broadcast",
        event: "call_status",
        payload: { callId: call.id, status: "ringing" },
      });

      return new Response(JSON.stringify({ callId: call.id, vapiCallId, listenUrl: listenUrl || null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /calls/:callId/hangup
    if (req.method === "POST" && path.match(/^\/calls\/[^/]+\/hangup$/)) {
      const callId = path.split("/")[2];

      const { data: call } = await supabase.from("calls").select().eq("id", callId).maybeSingle();

      if (!call) {
        return new Response(JSON.stringify({ error: "Call not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (call.twilio_call_sid) {
        try {
          await endVapiCall(call.twilio_call_sid, call.control_url || undefined);
        } catch (_) {
          // May already be ended — continue with local cleanup
        }
      }

      const { data: endedCall } = await supabase.from("calls").select("duration, created_at").eq("id", callId).maybeSingle();
      const nowMs = Date.now();
      const startMs = endedCall?.created_at ? new Date(endedCall.created_at).getTime() : nowMs;
      const endDuration = endedCall?.duration && endedCall.duration > 0
        ? endedCall.duration
        : Math.floor((nowMs - startMs) / 1000);
      await supabase.from("calls").update({
        status: "ended",
        ended_at: new Date().toISOString(),
        duration: endDuration,
        cost_usd: (endDuration / 60) * COST_PER_MINUTE,
      }).eq("id", callId);

      await supabase.channel("call-events").send({
        type: "broadcast",
        event: "call_status",
        payload: { callId, status: "ended" },
      });

      EdgeRuntime.waitUntil(generateSummaryAndEmail(supabase, callId));

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /calls/:callId/transfer
    if (req.method === "POST" && path.match(/^\/calls\/[^/]+\/transfer$/)) {
      const callId = path.split("/")[2];
      const { data: call } = await supabase.from("calls").select().eq("id", callId).maybeSingle();

      if (!call) {
        return new Response(JSON.stringify({ error: "Call not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!call.control_url) {
        return new Response(JSON.stringify({ error: "Call control not available" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const transferResponse = await fetch(call.control_url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "transfer",
          destination: { type: "number", number: TRANSFER_NUMBER },
          content: "Transferring your call now. Please hold.",
        }),
      });

      if (!transferResponse.ok) {
        const errorText = await transferResponse.text();
        return new Response(JSON.stringify({ error: "Transfer failed", details: errorText }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const now = new Date().toISOString();
      const transferDuration = call.started_at
        ? Math.floor((Date.now() - new Date(call.started_at).getTime()) / 1000)
        : (call.duration ?? 0);

      await supabase.from("calls").update({
        status: "transferred",
        ended_at: now,
        duration: transferDuration > 0 ? transferDuration : (call.duration ?? 0),
      }).eq("id", callId);

      await supabase.channel("call-events").send({
        type: "broadcast",
        event: "call_status",
        payload: { callId, status: "transferred" },
      });

      return new Response(
        JSON.stringify({ success: true, transferredTo: TRANSFER_NUMBER, message: "Call transfer initiated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST /calls/:callId/send-summary
    if (req.method === "POST" && path.match(/^\/calls\/[^/]+\/send-summary$/)) {
      const callId = path.split("/")[2];
      EdgeRuntime.waitUntil(generateSummaryAndEmail(supabase, callId));

      return new Response(JSON.stringify({ success: true, message: "Summary generation triggered" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /calls/:callId/instruction (send operator instruction to active call)
    if (req.method === "POST" && path.match(/^\/calls\/[^/]+\/instruction$/)) {
      const callId = path.split("/")[2];
      const { instruction } = await req.json();

      const { data: call } = await supabase.from("calls").select().eq("id", callId).maybeSingle();
      if (!call || !call.control_url) {
        return new Response(JSON.stringify({ error: "Call not found or control not available" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isButtonPress = /^(press|dial|enter|push)\s*\d/i.test(instruction.trim()) || /^\d+$/.test(instruction.trim());
      const instructionContent = isButtonPress
        ? `IMMEDIATE ACTION REQUIRED: ${instruction}. Use the press_button function to execute this. Press each digit one at a time.`
        : `OPERATOR INSTRUCTION: ${instruction}. Follow this instruction immediately in your next response.`;

      const vapiResponse = await fetch(call.control_url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "add-message",
          message: { role: "system", content: instructionContent },
        }),
      });

      if (!vapiResponse.ok) {
        return new Response(JSON.stringify({ success: false, message: "Failed to send instruction" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, message: "Instruction sent to AI assistant" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in api-calls:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
