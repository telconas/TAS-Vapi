import { useState, useEffect, useRef } from "react";
import { PhoneInputForm } from "@/components/phone-input-form";
import { CallStatus } from "@/components/call-status";
import { TranscriptionPanel } from "@/components/transcription-panel";
import { AudioPlayer } from "@/components/audio-player";
import { VoiceSelector } from "@/components/voice-selector";
import { CallSummary } from "@/components/call-summary";
import { InstructionInput } from "@/components/instruction-input";
import { LiveAudioMonitor } from "@/components/live-audio-monitor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { TranscriptMessage } from "@shared/schema";
import { Phone, ChartBar as BarChart2 } from "lucide-react";
import { Link } from "wouter";
import { supabase, EDGE_FUNCTIONS_URL } from "@/lib/supabase";
import { playDtmfTone } from "@/lib/dtmf-tones";

type CallStatus = "idle" | "ringing" | "connected" | "ended" | "transferred";

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

export default function Dashboard() {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [selectedElevenLabsVoice, setSelectedElevenLabsVoice] = useState("");
  const [elevenLabsVoices, setElevenLabsVoices] = useState<Voice[]>([]);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [listenUrl, setListenUrl] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [callSummary, setCallSummary] = useState<string | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callActiveRef = useRef(false);
  const currentCallIdRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const response = await edgeFetch("/api-voices/voices");
        if (response.ok) {
          const voices = await response.json();
          setElevenLabsVoices(voices);
          if (voices.length > 0) {
            setSelectedElevenLabsVoice(voices[0].voiceId);
          }
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
        const status = payload.status;
        setCallStatus(status);
        if (status === "connected") {
          callActiveRef.current = true;
          setIsAudioPlaying(true);
        } else if (status === "ended" || status === "transferred") {
          callActiveRef.current = false;
          stopDurationCounter();
          setIsAudioPlaying(false);
          setListenUrl(null);
          if (payload.callId) fetchCallDetails(payload.callId);
        }
      })
      .on("broadcast", { event: "transcription" }, ({ payload }) => {
        if (!callActiveRef.current) return;
        if (currentCallIdRef.current && payload.callId !== currentCallIdRef.current) return;
        const newMessage: TranscriptMessage = {
          id: Math.random().toString(36).substr(2, 9),
          callId: payload.callId,
          speaker: payload.speaker,
          text: payload.text,
          timestamp: new Date(payload.timestamp || Date.now()),
        };
        setTranscript((prev) => [...prev, newMessage]);
      })
      .on("broadcast", { event: "call_summary" }, ({ payload }) => {
        if (payload.summary) setCallSummary(payload.summary);
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

  const fetchCallDetails = async (callId: string) => {
    setTimeout(async () => {
      try {
        const response = await edgeFetch(`/api-calls/calls/${callId}`);
        if (response.ok) {
          const call = await response.json();
          if (call.recordingUrl) setRecordingUrl(call.recordingUrl);
          if (call.summary) {
            setCallSummary(call.summary);
          } else {
            pollForSummary(callId);
          }
        }
      } catch (error) {
        console.error("Error fetching call details:", error);
      }
    }, 3000);
  };

  const pollForSummary = async (callId: string) => {
    let attempts = 0;
    const maxAttempts = 10;

    const poll = async () => {
      attempts++;
      try {
        const response = await edgeFetch(`/api-calls/calls/${callId}`);
        if (response.ok) {
          const call = await response.json();
          if (call.summary) {
            setCallSummary(call.summary);
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

  const startDurationCounter = () => {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  };

  const stopDurationCounter = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  };

  const handleStartCall = async (phone: string, prompt: string, callerName: string, email?: string) => {
    try {
      callActiveRef.current = true;
      currentCallIdRef.current = null;
      setPhoneNumber(phone);
      setCallStatus("ringing");
      setDuration(0);
      startDurationCounter();
      setTranscript([]);
      setRecordingUrl(null);
      setCallSummary(null);
      setListenUrl(null);

      const response = await edgeFetch("/api-calls/calls/start", {
        method: "POST",
        body: JSON.stringify({
          phoneNumber: phone,
          prompt,
          callerName,
          emailRecipient: email,
          voiceProvider: "elevenlabs",
          elevenLabsVoice: selectedElevenLabsVoice,
        }),
      });

      if (!response.ok) throw new Error("Failed to start call");

      const data = await response.json();
      setCurrentCallId(data.callId);
      currentCallIdRef.current = data.callId;
      if (data.listenUrl) setListenUrl(data.listenUrl);

      toast({ title: "Call Initiated", description: `Calling ${phone}...` });
    } catch (error) {
      console.error("Error starting call:", error);
      setCallStatus("idle");
      toast({
        title: "Call Failed",
        description: "Failed to initiate the call. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadTranscript = () => {
    const text = transcript
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
    a.download = `transcript-${phoneNumber}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: "Transcript Downloaded", description: "The call transcript has been saved to your device." });
  };

  const handleHangUp = async () => {
    stopDurationCounter();
    setIsAudioPlaying(false);
    callActiveRef.current = false;

    if (currentCallId) {
      try {
        const response = await edgeFetch(`/api-calls/calls/${currentCallId}/hangup`, { method: "POST" });
        if (!response.ok) {
          console.error("Hangup request failed:", response.status);
        }
      } catch (error) {
        console.error("Error hanging up call:", error);
      }
    }

    setCallStatus("ended");
    setListenUrl(null);
    toast({ title: "Call Ended", description: "The call has been disconnected." });
  };

  const handleTransfer = async () => {
    if (!currentCallId) return;
    try {
      const response = await edgeFetch(`/api-calls/calls/${currentCallId}/transfer`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to transfer call");
      const data = await response.json();
      toast({ title: "Call Transferred", description: `The call has been transferred to ${data.transferredTo}` });
      setCallStatus("ended");
      stopDurationCounter();
      setIsAudioPlaying(false);
    } catch (error) {
      console.error("Error transferring call:", error);
      toast({ title: "Error", description: "Failed to transfer the call. Please try again.", variant: "destructive" });
    }
  };

  const handleSendInstruction = async (instruction: string) => {
    if (!currentCallId) {
      toast({ title: "Connection Error", description: "No active call to send instruction to", variant: "destructive" });
      return;
    }
    try {
      const response = await edgeFetch(`/api-calls/calls/${currentCallId}/instruction`, {
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

  const isCallActive = callStatus === "ringing" || callStatus === "connected";

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
              <p className="text-sm text-muted-foreground">
                Powered by Vapi and ElevenLabs
              </p>
            </div>
            <div className="ml-auto">
              <Link href="/analytics">
                <Button variant="outline" size="sm">
                  <BarChart2 className="w-4 h-4 mr-2" />
                  Analytics
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-7xl">
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
                  onStartCall={handleStartCall}
                  onHangUp={handleHangUp}
                  onTransfer={handleTransfer}
                  isCallActive={isCallActive}
                />
                <CallStatus status={callStatus} duration={duration} />
              </div>
            </Card>

            {(callStatus === "connected" || callStatus === "ringing") && (
              <LiveAudioMonitor
                listenUrl={listenUrl}
                callStatus={callStatus}
              />
            )}

          </div>

          <div className="lg:col-span-3 space-y-6">
            <TranscriptionPanel
              messages={transcript}
              isActive={callStatus === "connected"}
            />

            {callStatus === "connected" && (
              <InstructionInput onSendInstruction={handleSendInstruction} />
            )}

            {callStatus === "ended" && transcript.length > 0 && (
              <CallSummary
                duration={duration}
                transcript={transcript}
                onDownloadTranscript={handleDownloadTranscript}
                recordingUrl={recordingUrl || undefined}
                summary={callSummary || undefined}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
