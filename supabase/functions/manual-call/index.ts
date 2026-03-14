import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER") || "+19134395811";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function base64url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return base64url(binary);
}

const twilioAuth = () => `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`;

let cachedApiKeySid: string | null = Deno.env.get("TWILIO_API_KEY_SID") || null;
let cachedApiKeySecret: string | null = Deno.env.get("TWILIO_API_KEY_SECRET") || null;

async function ensureApiKey(): Promise<{ sid: string; secret: string }> {
  if (cachedApiKeySid && cachedApiKeySecret) {
    return { sid: cachedApiKeySid, secret: cachedApiKeySecret };
  }

  const listRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Keys.json`,
    { headers: { Authorization: twilioAuth() } }
  );
  const listData = await listRes.json();
  const existing = listData.keys?.find((k: any) => k.friendly_name === "TAS Manual Dialer Key");

  if (existing) {
    cachedApiKeySid = existing.sid;
    if (cachedApiKeySecret) {
      return { sid: cachedApiKeySid!, secret: cachedApiKeySecret };
    }
  }

  const createRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Keys.json`,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuth(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ FriendlyName: "TAS Manual Dialer Key" }).toString(),
    }
  );
  const newKey = await createRes.json();

  if (!newKey.sid || !newKey.secret) {
    throw new Error(`Failed to create Twilio API Key: ${JSON.stringify(newKey)}`);
  }

  cachedApiKeySid = newKey.sid;
  cachedApiKeySecret = newKey.secret;
  return { sid: newKey.sid, secret: newKey.secret };
}

async function ensureTwimlApp(): Promise<string> {
  const envSid = Deno.env.get("TWILIO_TWIML_APP_SID");
  if (envSid) return envSid;

  const voiceUrl = `${SUPABASE_URL}/functions/v1/manual-call/voice`;

  const listRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Applications.json?FriendlyName=TAS+Manual+Dialer`,
    { headers: { Authorization: twilioAuth() } }
  );
  const listData = await listRes.json();

  if (listData.applications?.length > 0) {
    const app = listData.applications[0];
    if (app.voice_url !== voiceUrl) {
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Applications/${app.sid}.json`,
        {
          method: "POST",
          headers: {
            Authorization: twilioAuth(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ VoiceUrl: voiceUrl, VoiceMethod: "POST" }).toString(),
        }
      );
    }
    return app.sid;
  }

  const createRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Applications.json`,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuth(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        FriendlyName: "TAS Manual Dialer",
        VoiceUrl: voiceUrl,
        VoiceMethod: "POST",
      }).toString(),
    }
  );
  const app = await createRes.json();
  if (!app.sid) throw new Error(`Failed to create TwiML App: ${JSON.stringify(app)}`);
  return app.sid;
}

async function generateAccessToken(identity: string, twimlAppSid: string): Promise<string> {
  const { sid: keySid, secret: keySecret } = await ensureApiKey();

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const header = base64url(JSON.stringify({ typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" }));

  const grants: Record<string, any> = {
    identity,
    voice: {
      outgoing: { application_sid: twimlAppSid },
      incoming: { allow: false },
    },
  };

  const payload = base64url(JSON.stringify({
    jti: `${keySid}-${now}`,
    iss: keySid,
    sub: TWILIO_ACCOUNT_SID,
    nbf: now,
    exp,
    grants,
  }));

  const signingInput = `${header}.${payload}`;
  const sig = await hmacSha256(keySecret, signingInput);
  return `${signingInput}.${sig}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/manual-call/, "");

    if (req.method === "POST" && path === "/token") {
      const body = await req.json().catch(() => ({}));
      const identity = body.identity || `manual-caller-${Date.now()}`;

      const twimlAppSid = await ensureTwimlApp();
      const token = await generateAccessToken(identity, twimlAppSid);

      return new Response(
        JSON.stringify({ token, identity }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path === "/voice") {
      const contentType = req.headers.get("content-type") || "";
      let params: Record<string, string> = {};

      if (contentType.includes("application/x-www-form-urlencoded")) {
        const text = await req.text();
        for (const pair of text.split("&")) {
          const [k, v] = pair.split("=");
          if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
        }
      }

      const to = params["To"] || "";
      const callId = params["CallId"] || `manual-${Date.now()}`;

      if (!to) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination number provided.</Say><Hangup /></Response>`,
          { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
        );
      }

      const recordingCallback = `${SUPABASE_URL}/functions/v1/manual-call/recording-callback/${callId}`;
      const statusCallback = `${SUPABASE_URL}/functions/v1/manual-call/status/${callId}`;

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${TWILIO_PHONE_NUMBER}" record="record-from-answer" recordingStatusCallback="${recordingCallback}" recordingStatusCallbackEvent="completed">
    <Number statusCallback="${statusCallback}" statusCallbackEvent="initiated ringing answered completed">${to}</Number>
  </Dial>
</Response>`;

      return new Response(twiml, {
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    if (req.method === "POST" && path === "/start") {
      const body = await req.json().catch(() => ({}));
      const { phoneNumber, callerName, emailRecipient } = body;

      if (!phoneNumber) {
        return new Response(
          JSON.stringify({ error: "Phone number is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabase = getSupabase();
      const { data: call, error } = await supabase
        .from("calls")
        .insert({
          phone_number: phoneNumber,
          prompt: "Manual call - no AI instructions",
          status: "ringing",
          call_type: "manual",
          caller_name: callerName || "Manual Caller",
          email_recipient: emailRecipient || null,
          voice_provider: "manual",
          duration: 0,
        })
        .select()
        .single();

      if (error || !call) {
        return new Response(
          JSON.stringify({ error: "Failed to create call record" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ callId: call.id, status: "registered" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path.startsWith("/recording-callback/")) {
      const callId = path.split("/")[2];
      const contentType = req.headers.get("content-type") || "";
      let params: Record<string, string> = {};

      if (contentType.includes("application/x-www-form-urlencoded")) {
        const text = await req.text();
        for (const pair of text.split("&")) {
          const [k, v] = pair.split("=");
          if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
        }
      }

      const recordingUrl = params["RecordingUrl"];
      if (recordingUrl && callId) {
        const supabase = getSupabase();
        await supabase.from("calls").update({ recording_url: recordingUrl }).eq("id", callId);
      }

      return new Response("OK", { headers: corsHeaders });
    }

    if (req.method === "POST" && path.startsWith("/status/")) {
      const callId = path.split("/")[2];
      const contentType = req.headers.get("content-type") || "";
      let params: Record<string, string> = {};

      if (contentType.includes("application/x-www-form-urlencoded")) {
        const text = await req.text();
        for (const pair of text.split("&")) {
          const [k, v] = pair.split("=");
          if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
        }
      }

      const callStatus = params["CallStatus"];
      const duration = parseInt(params["CallDuration"] || "0", 10);

      if (callId && callStatus) {
        const supabase = getSupabase();
        const statusMap: Record<string, string> = {
          "completed": "ended",
          "failed": "ended",
          "no-answer": "ended",
          "busy": "ended",
          "canceled": "ended",
          "in-progress": "connected",
          "ringing": "ringing",
        };
        const mappedStatus = statusMap[callStatus] || callStatus;
        await supabase.from("calls").update({
          status: mappedStatus,
          ...(mappedStatus === "ended" ? { duration, ended_at: new Date().toISOString() } : {}),
        }).eq("id", callId);
      }

      return new Response("OK", { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
