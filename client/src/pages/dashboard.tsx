import { useState, useEffect, useRef } from "react";
import { PhoneInputForm } from "@/components/phone-input-form";
import { CallStatus } from "@/components/call-status";
import { TranscriptionPanel } from "@/components/transcription-panel";
import { VoiceSelector } from "@/components/voice-selector";
import { CallSummary } from "@/components/call-summary";
import { InstructionInput } from "@/components/instruction-input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCallSlot } from "@/hooks/use-call-slot";
import type { FormState } from "@/hooks/use-call-slot";
import type { TranscriptMessage } from "@shared/schema";
import { Phone, ChartBar as BarChart2, FileText, PhoneCall, Save, Radio, Volume2, VolumeX, Calendar } from "lucide-react";
import { Link } from "wouter";
import { supabase, EDGE_FUNCTIONS_URL } from "@/lib/supabase";
import { providers } from "@/components/phone-input-form";
import { RecentCalls } from "@/components/recent-calls";
import { playDtmfTone } from "@/lib/dtmf-tones";

interface Voice {
  voiceId: string;
  name: string;
  previewUrl?: string;
}

const edgeFetch = async (path: string, options?: RequestInit) => {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  return fetch(`${EDGE_FUNCTIONS_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
      Apikey: anonKey,
      ...(options?.headers || {}),
    },
  });
};

function getTabStatusColor(status: string) {
  switch (status) {
    case "ringing": return "bg-amber-500";
    case "connected": return "bg-emerald-500";
    case "ended": return "bg-slate-400";
    case "transferred": return "bg-blue-500";
    default: return "bg-slate-300";
  }
}

function getTabStatusLabel(status: string) {
  switch (status) {
    case "ringing": return "Ringing";
    case "connected": return "Live";
    case "ended": return "Ended";
    case "transferred": return "Transferred";
    default: return "Idle";
  }
}

const SLOT_STORAGE_KEY = (i: number) => `call-slot-form-${i}`;

function loadSavedForm(i: number): Partial<FormState> | null {
  try {
    const raw = localStorage.getItem(SLOT_STORAGE_KEY(i));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState(0);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<Voice[]>([]);
  const [callHistoryRefresh, setCallHistoryRefresh] = useState(0);
  const [savedIndicator, setSavedIndicator] = useState<number | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { toast } = useToast();

  const slot0 = useCallSlot();
  const slot1 = useCallSlot();
  const slot2 = useCallSlot();
  const slots = [slot0, slot1, slot2];
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const slot = slots[activeTab];

  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const response = await edgeFetch("/api-voices/voices");
        if (response.ok) {
          const voices = await response.json();
          setElevenLabsVoices(voices);
          const defaultVoice = voices.length > 0 ? voices[0].voiceId : "";
          [slot0, slot1, slot2].forEach((s, i) => {
            const saved = loadSavedForm(i);
            if (saved) {
              s.setForm({ ...saved, selectedVoice: saved.selectedVoice || defaultVoice });
            } else if (defaultVoice) {
              s.setForm({ selectedVoice: defaultVoice });
            }
          });
        }
      } catch (error) {
        console.error("Error fetching voices:", error);
      }
    };
    fetchVoices();
  }, []);

  useEffect(() => {
    const channel = supabase.channel("call-events", {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "call_status" }, ({ payload }) => {
        const { callId, status } = payload;
        const targetSlot = slotsRef.current.find((s) => s.currentCallIdRef.current === callId);
        if (!targetSlot) return;

        targetSlot.setCallStatus(status);

        if (status === "connected") {
          targetSlot.callActiveRef.current = true;
          targetSlot.setIsAudioPlaying(true);
        } else if (status === "ended" || status === "transferred" || status === "transferring") {
          targetSlot.callActiveRef.current = false;
          targetSlot.stopDurationCounter();
          targetSlot.setIsAudioPlaying(false);
          targetSlot.setListenUrl(null);
          if (callId) fetchCallDetails(callId, targetSlot);
          setCallHistoryRefresh((n) => n + 1);
        }
      })
      .on("broadcast", { event: "transcription" }, ({ payload }) => {
        const targetSlot = slotsRef.current.find(
          (s) => s.callActiveRef.current && s.currentCallIdRef.current === payload.callId
        );
        if (!targetSlot) return;
        const newMessage: TranscriptMessage = {
          id: Math.random().toString(36).substr(2, 9),
          callId: payload.callId,
          speaker: payload.speaker,
          text: payload.text,
          timestamp: new Date(payload.timestamp || Date.now()),
        };
        targetSlot.setTranscript((prev) => [...prev, newMessage]);
      })
      .on("broadcast", { event: "call_summary" }, ({ payload }) => {
        const targetSlot = slotsRef.current.find((s) => s.currentCallIdRef.current === payload.callId);
        if (targetSlot && payload.summary) targetSlot.setCallSummary(payload.summary);
      })
      .on("broadcast", { event: "dtmf_press" }, ({ payload }) => {
        if (payload.digit) playDtmfTone(payload.digit);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const dbChannel = supabase
      .channel("scheduled-call-inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls" },
        (payload) => {
          const newCall = payload.new as {
            id: string;
            status: string;
            phone_number: string;
            listen_url: string | null;
          };
          if (newCall.status !== "ringing") return;
          const alreadyTracked = slotsRef.current.some(
            (s) => s.currentCallIdRef.current === newCall.id
          );
          if (alreadyTracked) return;
          const freeSlot = slotsRef.current.find((s) => !s.callActiveRef.current && s.callStatus === "idle");
          if (!freeSlot) return;

          freeSlot.callActiveRef.current = true;
          freeSlot.currentCallIdRef.current = newCall.id;
          freeSlot.setCurrentCallId(newCall.id);
          freeSlot.setDialedNumber(newCall.phone_number);
          freeSlot.setCallStatus("ringing");
          freeSlot.setDuration(0);
          freeSlot.startDurationCounter();
          freeSlot.setTranscript([]);
          freeSlot.setRecordingUrl(null);
          freeSlot.setCallSummary(null);
          if (newCall.listen_url) freeSlot.setListenUrl(newCall.listen_url);

          toast({
            title: "Scheduled Call Started",
            description: `Calling ${newCall.phone_number}...`,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls" },
        (payload) => {
          const updated = payload.new as {
            id: string;
            listen_url: string | null;
          };
          const targetSlot = slotsRef.current.find((s) => s.currentCallIdRef.current === updated.id);
          if (targetSlot && updated.listen_url) {
            targetSlot.setListenUrl(updated.listen_url);
          }
        }
      )
      .subscribe();

    return () => {
      dbChannel.unsubscribe();
    };
  }, []);

  const fetchCallDetails = async (callId: string, targetSlot: ReturnType<typeof useCallSlot>) => {
    setTimeout(async () => {
      try {
        const response = await edgeFetch(`/api-calls/calls/${callId}`);
        if (response.ok) {
          const call = await response.json();
          if (call.recordingUrl) targetSlot.setRecordingUrl(call.recordingUrl);
          if (call.summary) {
            targetSlot.setCallSummary(call.summary);
          } else {
            pollForSummary(callId, targetSlot);
          }
        }
      } catch (error) {
        console.error("Error fetching call details:", error);
      }
    }, 3000);
  };

  const pollForSummary = async (callId: string, targetSlot: ReturnType<typeof useCallSlot>) => {
    let attempts = 0;
    const maxAttempts = 10;
    const poll = async () => {
      attempts++;
      try {
        const response = await edgeFetch(`/api-calls/calls/${callId}`);
        if (response.ok) {
          const call = await response.json();
          if (call.summary) {
            targetSlot.setCallSummary(call.summary);
            return;
          }
        }
        if (attempts < maxAttempts) setTimeout(poll, 3000);
      } catch (error) {
        console.error("Error polling for summary:", error);
      }
    };
    setTimeout(poll, 5000);
  };

  const handleStartCall = async (phone: string, prompt: string, callerName: string, email?: string, providerName?: string) => {
    const s = slots[activeTab];
    try {
      s.callActiveRef.current = true;
      s.currentCallIdRef.current = null;
      s.setDialedNumber(phone);
      s.setCallStatus("ringing");
      s.setDuration(0);
      s.startDurationCounter();
      s.setTranscript([]);
      s.setRecordingUrl(null);
      s.setCallSummary(null);
      s.setListenUrl(null);

      const response = await edgeFetch("/api-calls/calls/start", {
        method: "POST",
        body: JSON.stringify({
          phoneNumber: phone,
          prompt,
          callerName,
          emailRecipient: email,
          providerName: providerName || null,
          voiceProvider: "elevenlabs",
          elevenLabsVoice: s.form.selectedVoice,
        }),
      });

      if (!response.ok) throw new Error("Failed to start call");

      const data = await response.json();
      s.setCurrentCallId(data.callId);
      s.currentCallIdRef.current = data.callId;
      if (data.listenUrl) s.setListenUrl(data.listenUrl);

      toast({ title: "Call Initiated", description: `Calling ${phone}...` });
    } catch (error) {
      console.error("Error starting call:", error);
      s.setCallStatus("idle");
      toast({ title: "Call Failed", description: "Failed to initiate the call. Please try again.", variant: "destructive" });
    }
  };

  const handleHangUp = async () => {
    const s = slots[activeTab];
    s.stopDurationCounter();
    s.setIsAudioPlaying(false);
    s.callActiveRef.current = false;

    if (s.currentCallId) {
      try {
        await edgeFetch(`/api-calls/calls/${s.currentCallId}/hangup`, { method: "POST" });
      } catch (error) {
        console.error("Error hanging up call:", error);
      }
    }

    s.setCallStatus("ended");
    s.setListenUrl(null);
    toast({ title: "Call Ended", description: "The call has been disconnected." });
  };

  const handleTransfer = async () => {
    const s = slots[activeTab];
    if (!s.currentCallId) return;
    try {
      const response = await edgeFetch(`/api-calls/calls/${s.currentCallId}/transfer`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to transfer call");
      const data = await response.json();
      toast({ title: "Call Transferred", description: `The call has been transferred to ${data.transferredTo}` });
      s.setCallStatus("ended");
      s.stopDurationCounter();
      s.setIsAudioPlaying(false);
    } catch (error) {
      console.error("Error transferring call:", error);
      toast({ title: "Error", description: "Failed to transfer the call. Please try again.", variant: "destructive" });
    }
  };

  const handleSendInstruction = async (instruction: string) => {
    const s = slots[activeTab];
    if (!s.currentCallId) {
      toast({ title: "Connection Error", description: "No active call to send instruction to", variant: "destructive" });
      return;
    }
    try {
      const response = await edgeFetch(`/api-calls/calls/${s.currentCallId}/instruction`, {
        method: "POST",
        body: JSON.stringify({ instruction }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: "Instruction Sent", description: "The AI agent has received your guidance." });
      } else {
        toast({ title: "Instruction Failed", description: data.message || "Failed to send instruction", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Connection Error", description: "Cannot send instruction - request failed", variant: "destructive" });
    }
  };

  const handleDownloadTranscript = () => {
    const s = slots[activeTab];
    const text = s.transcript
      .map((msg) => {
        const date = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp as any);
        const time = date.toLocaleTimeString();
        const speaker = msg.speaker === "ai" ? "AI Assistant" : "Caller";
        return `[${time}] ${speaker}: ${msg.text}`;
      })
      .join("\n\n");

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${s.dialedNumber}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: "Transcript Downloaded", description: "The call transcript has been saved to your device." });
  };

  const stopMonitoring = () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (workletNodeRef.current) { workletNodeRef.current.disconnect(); workletNodeRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    gainNodeRef.current = null;
    setIsMonitoring(false);
    setIsMuted(false);
  };

  const startMonitoring = async () => {
    const listenUrl = slot.listenUrl;
    if (!listenUrl) { toast({ title: "Not available", description: "No listen URL yet. Wait for call to connect.", variant: "destructive" }); return; }
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();
      await ctx.audioWorklet.addModule('/pcm-player-processor.js');
      const workletNode = new AudioWorkletNode(ctx, 'pcm-player-processor', { processorOptions: { inputSampleRate: 16000 } });
      workletNodeRef.current = workletNode;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      gainNodeRef.current = gain;
      workletNode.connect(gain);
      gain.connect(ctx.destination);
      const ws = new WebSocket(listenUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;
      let streamChannels = 1;
      ws.onopen = () => { setIsMonitoring(true); };
      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const meta = JSON.parse(event.data);
            if (meta.type === 'start') {
              streamChannels = meta.channels || 1;
              workletNodeRef.current?.port.postMessage({ type: 'config', inputSampleRate: meta.sampleRate || 16000 });
            }
          } catch { /* not JSON */ }
          return;
        }
        if (!(event.data instanceof ArrayBuffer) || event.data.byteLength === 0) return;
        const node = workletNodeRef.current;
        if (!node) return;
        const int16 = new Int16Array(event.data);
        const frameCount = Math.floor(int16.length / streamChannels);
        const float32 = new Float32Array(frameCount);
        if (streamChannels === 2) {
          for (let i = 0; i < frameCount; i++) float32[i] = (int16[i * 2] + int16[i * 2 + 1]) / 2 / 32768.0;
        } else {
          for (let i = 0; i < frameCount; i++) float32[i] = int16[i] / 32768.0;
        }
        node.port.postMessage(float32, [float32.buffer]);
      };
      ws.onerror = () => { stopMonitoring(); toast({ title: "Monitor Error", description: "Failed to connect to audio stream.", variant: "destructive" }); };
      ws.onclose = (e) => { setIsMonitoring(false); if (e.code !== 1000 && e.code !== 1001) setIsMuted(false); };
    } catch (err) {
      toast({ title: "Monitor Error", description: err instanceof Error ? err.message : "Failed to start monitoring", variant: "destructive" });
    }
  };

  const toggleMute = () => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 1 : 0;
      setIsMuted(!isMuted);
    }
  };

  const isCallActive = slot.callStatus === "ringing" || slot.callStatus === "connected";

  useEffect(() => {
    if (!isCallActive && isMonitoring) stopMonitoring();
  }, [isCallActive]);

  const handleScheduleCall = async (scheduledAt: string) => {
    const s = slots[activeTab];
    const providerEntry = s.form.selectedProvider
      ? providers.find((p) => p.number === s.form.selectedProvider)
      : null;
    const fullNumber = `${s.form.countryCode}${s.form.phoneNumber}`;
    try {
      const { error } = await supabase.from("scheduled_calls").insert({
        phone_number: fullNumber,
        prompt: s.form.prompt,
        caller_name: s.form.callerName || "James Martin",
        email_recipient: s.form.email || null,
        provider_name: providerEntry?.name || null,
        voice_id: s.form.selectedVoice || null,
        scheduled_at: scheduledAt,
        status: "pending",
      });
      if (error) throw error;
      const d = new Date(scheduledAt);
      const label = d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      toast({ title: "Call Scheduled", description: `Queued for ${label}` });
    } catch (err) {
      console.error(err);
      toast({ title: "Schedule Failed", description: "Could not schedule the call.", variant: "destructive" });
    }
  };

  const handleSaveSlot = (index: number) => {
    try {
      localStorage.setItem(SLOT_STORAGE_KEY(index), JSON.stringify(slots[index].form));
      setSavedIndicator(index);
      setTimeout(() => setSavedIndicator(null), 2000);
      toast({ title: `Call ${index + 1} saved`, description: "Settings saved for this call tab." });
    } catch {
      toast({ title: "Save failed", description: "Could not save settings.", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Phone className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">TAS AI Agent</h1>
              <p className="text-sm text-muted-foreground">Powered by OpenAI, Vapi, and ElevenLabs</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/scheduled">
                <Button variant="outline" size="sm">
                  <Calendar className="w-4 h-4 mr-2" />
                  Scheduled
                </Button>
              </Link>
              <Link href="/analytics">
                <Button variant="outline" size="sm">
                  <BarChart2 className="w-4 h-4 mr-2" />
                  Analytics
                </Button>
              </Link>
              <Link href="/reports">
                <Button variant="outline" size="sm">
                  <FileText className="w-4 h-4 mr-2" />
                  Reports
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6 max-w-7xl">
        <div className="mb-6">
          <div className="flex items-center gap-1 border-b border-border">
            {slots.map((s, i) => {
              const active = activeTab === i;
              const statusColor = getTabStatusColor(s.callStatus);
              const statusLabel = getTabStatusLabel(s.callStatus);
              const hasContent = s.callStatus !== "idle";
              return (
                <button
                  key={i}
                  onClick={() => setActiveTab(i)}
                  className={[
                    "relative flex items-center gap-2.5 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                  ].join(" ")}
                >
                  <PhoneCall className="w-4 h-4 shrink-0" />
                  <span>Call {i + 1}</span>
                  {hasContent && (
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${statusColor} ${s.callStatus === "ringing" || s.callStatus === "connected" ? "animate-pulse" : ""}`} />
                      <span className={`text-xs ${active ? "text-muted-foreground" : "text-muted-foreground/70"}`}>
                        {statusLabel}
                        {s.dialedNumber ? ` · ${s.dialedNumber.slice(-10)}` : ""}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Call Controls</h2>
                <div className="flex items-center gap-2">
                  {isCallActive && slot.listenUrl && (
                    <>
                      {isMonitoring && (
                        <Button size="sm" variant="outline" onClick={toggleMute} className="gap-1.5">
                          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={isMonitoring ? "destructive" : "outline"}
                        onClick={isMonitoring ? stopMonitoring : startMonitoring}
                        className="gap-1.5"
                      >
                        <Radio className={`w-3.5 h-3.5 ${isMonitoring ? "animate-pulse" : ""}`} />
                        {isMonitoring ? "Stop" : "Monitor"}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSaveSlot(activeTab)}
                    disabled={isCallActive}
                    className="gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savedIndicator === activeTab ? "Saved!" : "Save"}
                  </Button>
                </div>
              </div>
              <div className="space-y-6">
                <VoiceSelector
                  selectedElevenLabsVoice={slot.form.selectedVoice}
                  onElevenLabsVoiceChange={(v) => slot.setForm({ selectedVoice: v })}
                  elevenLabsVoices={elevenLabsVoices}
                  disabled={isCallActive}
                />
                <PhoneInputForm
                  form={slot.form}
                  onFormChange={slot.setForm}
                  onStartCall={handleStartCall}
                  onHangUp={handleHangUp}
                  onTransfer={handleTransfer}
                  onSchedule={handleScheduleCall}
                  isCallActive={isCallActive}
                />
                <CallStatus status={slot.callStatus} duration={slot.duration} />
              </div>
            </Card>

            {!isCallActive && (
              <RecentCalls refreshTrigger={callHistoryRefresh} />
            )}
          </div>

          <div className="lg:col-span-3 space-y-6">
            <TranscriptionPanel
              messages={slot.transcript}
              isActive={slot.callStatus === "connected"}
            />

            {slot.callStatus === "connected" && (
              <InstructionInput onSendInstruction={handleSendInstruction} />
            )}

            {slot.callStatus === "ended" && slot.transcript.length > 0 && (
              <CallSummary
                duration={slot.duration}
                transcript={slot.transcript}
                onDownloadTranscript={handleDownloadTranscript}
                recordingUrl={slot.recordingUrl || undefined}
                summary={slot.callSummary || undefined}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
