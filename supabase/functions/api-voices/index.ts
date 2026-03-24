import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const PINNED_VOICE_IDS = [
  "r5iFzIytiA1rzjhWFCjW",
  "QLAlOeRuLwKX0skeTR7R",
  "tMXujoAjiboschVOhAnk",
  "6ZZR4JY6rOriLSDtV54M",
  "g6xIsTj2HwM6VR4iXFCw",
  "fLQhkOW7F9KVKAjYCbhr",
  "UzD2XhoJj8J4ncQXotqw",
  "X2YDLxPMicvGVoyJZkPV",
  "Ifu36BnEjjIY932etsqk",
  "dXtC3XhB9GtPusIpNtQx",
  "S9NKLs1GeSTKzXd9D0Lf",
  "yj30vwTGJxSHezdAGsv9",
  "vDchjyOZZytffNeZXfZK",
  "3svOJAOhuPHXwQC2H5eq",
  "wrxvN1LZJIfL3HHvffqe",
  "dAZqM8Pl37bzdPFxvgXm",
  "pwMBn0SsmN1220Aorv15",
  "qSeXEcewz7tA0Q0qk9fH",
  "kXsOSDWolD7e9l1Z0sbH",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api-voices/, "");

    // GET /voices/:voiceId/preview
    if (req.method === "GET" && path.match(/^\/voices\/[^/]+\/preview$/)) {
      const voiceId = path.split("/")[2];
      const previewText =
        "I am calling about an issue we are having with our internet connection. I was wondering if you could help troubleshoot.";

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: previewText,
          model_id: "eleven_monolingual_v1",
        }),
      });

      if (!response.ok) {
        return new Response(JSON.stringify({ error: "Failed to generate voice preview" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const buffer = await response.arrayBuffer();
      return new Response(buffer, {
        headers: { ...corsHeaders, "Content-Type": "audio/mpeg" },
      });
    }

    // GET /voices
    if (req.method === "GET" && (path === "/voices" || path === "" || path === "/")) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const voicesResponse = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });

      if (!voicesResponse.ok) {
        return new Response(JSON.stringify({ error: "Failed to fetch voices" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const voicesData = await voicesResponse.json();
      const pinnedSet = new Set(PINNED_VOICE_IDS);
      const accountVoices = (voicesData.voices || [])
        .filter((voice: any) => pinnedSet.has(voice.voice_id))
        .map((voice: any) => ({
          voiceId: voice.voice_id,
          name: voice.name,
          previewUrl: voice.preview_url,
        }));

      const accountVoiceIds = new Set(accountVoices.map((v: any) => v.voiceId));
      const pinnedToFetch = PINNED_VOICE_IDS.filter((id) => !accountVoiceIds.has(id));
      const pinnedVoices: { voiceId: string; name: string; previewUrl?: string }[] = [];

      for (const voiceId of pinnedToFetch) {
        try {
          const resp = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
            headers: { "xi-api-key": ELEVENLABS_API_KEY },
          });
          if (resp.ok) {
            const data = await resp.json();
            pinnedVoices.push({
              voiceId: data.voice_id,
              name: data.name,
              previewUrl: data.preview_url,
            });
          }
        } catch (_) {
          // skip failed voice fetch
        }
      }

      const voices = [...accountVoices, ...pinnedVoices];

      for (const voice of voices) {
        await supabase.from("voices").upsert(
          { voice_id: voice.voiceId, name: voice.name, preview_url: voice.previewUrl || null },
          { onConflict: "voice_id" },
        );
      }

      return new Response(JSON.stringify(voices), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in api-voices:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
