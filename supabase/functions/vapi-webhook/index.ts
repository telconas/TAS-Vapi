import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") || "";
const SENDGRID_FROM_EMAIL = Deno.env.get("SENDGRID_FROM_EMAIL") || "avb@telconassociates.com";
const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY") || "";
const TRANSFER_NUMBER = Deno.env.get("TRANSFER_NUMBER") || "+19134395811";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
   - Account numbers, Static IP addresses, Confirmation numbers
   - Service addresses, Phone numbers, Pricing and plan details
   - Dates and times, Any reference numbers or ticket numbers
5. Use **JPM** to refer to the caller and the representative's name when known.
6. Capture everything important - use as many bullet points as needed.
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

async function generateSummaryAndEmail(supabase: any, callId: string, recordingUrl?: string): Promise<void> {
  const { data: call } = await supabase.from("calls").select().eq("id", callId).maybeSingle();
  if (!call) return;

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

  const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant that summarizes phone call transcripts." },
        { role: "user", content: buildSummaryPrompt(cleanTranscripts) },
      ],
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

  if (call.email_recipient && SENDGRID_API_KEY) {
    const duration = call.duration || 0;
    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    };

    const freshRecordingUrl = recordingUrl || call.recording_url;
    const sentences = summary.includes("\n")
      ? summary.split("\n").map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : [summary];

    const bulletListHtml = sentences.map((s: string) => `<li>${s}</li>`).join("");
    const hasRecording = freshRecordingUrl && freshRecordingUrl.trim().length > 0;

    const emailHtml = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:#219ebc;color:white;padding:20px;border-radius:5px 5px 0 0}.content{background:#f9f9f9;padding:20px;border:1px solid #ddd}.summary{background:white;padding:15px;border-left:4px solid #219ebc;margin:20px 0}.summary ul{margin:0;padding-left:20px}.summary li{margin:8px 0}.meta{color:#666;font-size:14px;margin:10px 0}.footer{text-align:center;margin-top:20px;color:#999;font-size:12px}.recording-link{display:inline-block;background:#219ebc;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;margin-top:10px}</style></head><body><div class="container"><div class="header"><h1>TAS Call Summary</h1></div><div class="content"><p class="meta"><strong>Phone Number:</strong> ${call.phone_number}</p><p class="meta"><strong>Duration:</strong> ${formatDuration(duration)}</p><h2>Summary of TAS Call</h2><div class="summary"><ul>${bulletListHtml}</ul></div>${hasRecording ? `<p><a href="${freshRecordingUrl}" class="recording-link">Listen to Recording</a></p>` : `<p style="color:#999;font-style:italic;margin-top:15px;">Recording not available</p>`}</div><div class="footer"><p>TAS AI Agent</p></div></div></body></html>`;

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
    const body = await req.json();
    const { message } = body;

    if (!message) {
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    console.log("[VAPI WEBHOOK] Received event:", message.type);

    switch (message.type) {
      case "transcript": {
        const { transcript, role, transcriptType } = message;

        if (transcript && transcriptType === "final" && message.call?.id) {
          const { data: call } = await supabase
            .from("calls")
            .select()
            .eq("twilio_call_sid", message.call.id)
            .maybeSingle();

          if (call) {
            const speaker = role === "assistant" ? "ai" : "caller";

            await supabase.from("transcript_messages").insert({
              call_id: call.id,
              speaker,
              text: transcript,
            });

            await supabase.channel("call-events").send({
              type: "broadcast",
              event: "transcription",
              payload: {
                callId: call.id,
                speaker,
                text: transcript,
                timestamp: Date.now(),
              },
            });
          }
        }
        break;
      }

      case "status-update": {
        const { status } = message;

        if (message.call?.id) {
          const { data: call } = await supabase
            .from("calls")
            .select()
            .eq("twilio_call_sid", message.call.id)
            .maybeSingle();

          if (call) {
            let appStatus = status;
            if (status === "in-progress") appStatus = "connected";
            else if (status === "ended") appStatus = "ended";

            const updateData: any = { status: appStatus };
            if (appStatus === "ended") {
              updateData.ended_at = new Date().toISOString();
            }

            await supabase.from("calls").update(updateData).eq("id", call.id);

            await supabase.channel("call-events").send({
              type: "broadcast",
              event: "call_status",
              payload: { callId: call.id, status: appStatus },
            });
          }
        }
        break;
      }

      case "end-of-call-report": {
        const { call: vapiCall } = message;

        if (vapiCall) {
          const { data: dbCall } = await supabase
            .from("calls")
            .select()
            .eq("twilio_call_sid", vapiCall.id)
            .maybeSingle();

          if (dbCall) {
            let callDuration =
              vapiCall.duration ||
              vapiCall.durationSeconds ||
              (vapiCall.durationMs ? Math.floor(vapiCall.durationMs / 1000) : 0) ||
              (vapiCall.endedAt && vapiCall.startedAt
                ? Math.floor(
                    (new Date(vapiCall.endedAt).getTime() - new Date(vapiCall.startedAt).getTime()) / 1000,
                  )
                : 0);

            let recordingUrl =
              vapiCall.artifact?.recordingUrl ||
              vapiCall.artifact?.stereoRecordingUrl ||
              vapiCall.recordingUrl;

            const updateData: any = { status: "ended", ended_at: new Date().toISOString() };
            if (recordingUrl) updateData.recording_url = recordingUrl;
            if (callDuration > 0) updateData.duration = callDuration;

            await supabase.from("calls").update(updateData).eq("id", dbCall.id);

            EdgeRuntime.waitUntil((async () => {
              if (!recordingUrl && vapiCall.id) {
                recordingUrl = await pollForRecording(supabase, vapiCall.id, dbCall.id);
              }
              await generateSummaryAndEmail(supabase, dbCall.id, recordingUrl || undefined);
            })());
          }
        }
        break;
      }

      case "function-call": {
        const { functionCall } = message;
        if (functionCall?.name === "press_button" && message.call?.id) {
          const digit = functionCall.parameters?.digit;
          console.log(`[DTMF] Pressed: ${digit}`);
        }
        break;
      }

      default:
        console.log("[VAPI WEBHOOK] Unknown message type:", message.type);
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error: any) {
    console.error("Error in vapi-webhook:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
