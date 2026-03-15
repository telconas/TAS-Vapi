import { useState, useEffect, useRef } from "react";
import { PhoneInputForm } from "@/components/phone-input-form";
import { CallStatus } from "@/components/call-status";
import { TranscriptionPanel } from "@/components/transcription-panel";
import { VoiceSelector } from "@/components/voice-selector";
import { CallSummary } from "@/components/call-summary";
import { InstructionInput } from "@/components/instruction-input";
import { LiveAudioMonitor } from "@/components/live-audio-monitor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCallSlot } from "@/hooks/use-call-slot";
import type { TranscriptMessage } from "@shared/schema";
import { Phone, ChartBar as BarChart2, FileText, PhoneCall } from "lucide-react";
import { Link } from "wouter";
import { supabase, EDGE_FUNCTIONS_URL } from "@/lib/supabase";
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

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState(0);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<Voice[]>([]);
  const [selectedElevenLabsVoice, setSelectedElevenLabsVoice] = useState("");
  const [callHistoryRefresh, setCallHistoryRefresh] = useState(0);
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
          if (voices.length > 0) setSelectedElevenLabsVoice(voices[0].voiceId);
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
          elevenLabsVoice: selectedElevenLabsVoice,
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

  const isCallActive = slot.callStatus === "ringing" || slot.callStatus === "connected";

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
              <h2 className="text-xl font-semibold mb-6">Call Controls</h2>
              <div className="space-y-6">
                <VoiceSelector
                  selectedElevenLabsVoice={selectedElevenLabsVoice}
                  onElevenLabsVoiceChange={setSelectedElevenLabsVoice}
                  elevenLabsVoices={elevenLabsVoices}
                  disabled={isCallActive}
                />
                <PhoneInputForm
                  form={slot.form}
                  onFormChange={slot.setForm}
                  onStartCall={handleStartCall}
                  onHangUp={handleHangUp}
                  onTransfer={handleTransfer}
                  isCallActive={isCallActive}
                />
                <CallStatus status={slot.callStatus} duration={slot.duration} />
              </div>
            </Card>

            {(slot.callStatus === "connected" || slot.callStatus === "ringing") && (
              <LiveAudioMonitor listenUrl={slot.listenUrl} callStatus={slot.callStatus} />
            )}

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
