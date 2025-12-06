import { useState, useEffect, useRef } from "react";
import { PhoneInputForm } from "@/components/phone-input-form";
import { CallStatus } from "@/components/call-status";
import { TranscriptionPanel } from "@/components/transcription-panel";
import { AudioPlayer } from "@/components/audio-player";
import { VoiceSelector } from "@/components/voice-selector";
import { CallSummary } from "@/components/call-summary";
import { InstructionInput } from "@/components/instruction-input";
import { LiveAudioMonitor } from "@/components/live-audio-monitor";
import { ManualCallPanel } from "@/components/manual-call-panel";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { TranscriptMessage } from "@shared/schema";
import { Phone } from "lucide-react";

type CallStatus = "idle" | "ringing" | "connected" | "ended" | "transferred";

interface Voice {
  voiceId: string;
  name: string;
  previewUrl?: string;
}

export default function Dashboard() {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState<
    "polly" | "deepgram" | "elevenlabs"
  >("deepgram");
  const [selectedPollyVoice, setSelectedPollyVoice] = useState("Polly.Joanna");
  const [selectedDeepgramVoice, setSelectedDeepgramVoice] =
    useState("aura-2-asteria-en");
  const [selectedElevenLabsVoice, setSelectedElevenLabsVoice] = useState("");
  const [elevenLabsVoices, setElevenLabsVoices] = useState<Voice[]>([]);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [callSummary, setCallSummary] = useState<string | null>(null);
  const [listenUrl, setListenUrl] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Fetch ElevenLabs voices on mount
  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const response = await fetch("/api/voices");
        if (response.ok) {
          const voices = await response.json();
          setElevenLabsVoices(voices);
          // Set first voice as default if available
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

  // Initialize WebSocket connection with auto-reconnect
  useEffect(() => {
    let isComponentMounted = true;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        // Handle session ID
        if (message.type === "session") {
          setSessionId(message.data.sessionId);
          console.log("Session ID received:", message.data.sessionId);
          return;
        }

        handleWebSocketMessage(message);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        wsRef.current = null;
        setSessionId(null);

        // Auto-reconnect after 2 seconds if component is still mounted
        if (isComponentMounted) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("Attempting to reconnect WebSocket...");
            connectWebSocket();
          }, 2000);
        }
      };
    };

    connectWebSocket();

    return () => {
      isComponentMounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case "call_status":
        setCallStatus(message.data.status);
        if (message.data.status === "connected") {
          startDurationCounter();
          setIsAudioPlaying(true);
        } else if (message.data.status === "ended" || message.data.status === "transferred") {
          stopDurationCounter();
          setIsAudioPlaying(false);
          // Fetch call details to get recording URL
          if (currentCallId) {
            fetchRecordingUrl(currentCallId);
          }
        }
        break;

      case "transcription":
        const newMessage: Partial<TranscriptMessage> = {
          id: Math.random().toString(36).substr(2, 9),
          speaker: message.data.speaker,
          text: message.data.text,
          timestamp: new Date(message.data.timestamp || Date.now()),
        };
        setTranscript((prev) => [...prev, newMessage as TranscriptMessage]);
        break;

      case "instruction_response":
        if (message.data.success) {
          toast({
            title: "Instruction Sent",
            description: "The AI agent has received your guidance.",
          });
        } else {
          toast({
            title: "Instruction Failed",
            description:
              message.data.message || "Failed to send instruction to AI agent",
            variant: "destructive",
          });
        }
        break;

      case "audio_chunk":
        // Audio chunks would be handled here for playback
        break;

      case "error":
        toast({
          title: "Error",
          description:
            message.data.message || "An error occurred during the call",
          variant: "destructive",
        });
        break;
    }
  };

  const fetchRecordingUrl = async (callId: string) => {
    try {
      // Wait a bit for Twilio to process and send the recording callback
      setTimeout(async () => {
        const response = await fetch(`/api/calls/${callId}`);
        if (response.ok) {
          const call = await response.json();
          if (call.recordingUrl) {
            setRecordingUrl(call.recordingUrl);
          }
          // Also fetch summary (may take a few seconds to generate)
          if (call.summary) {
            setCallSummary(call.summary);
          } else {
            // If summary not ready yet, poll for it
            pollForSummary(callId);
          }
        }
      }, 3000); // Wait 3 seconds for recording to be processed
    } catch (error) {
      console.error("Error fetching recording URL:", error);
    }
  };

  const pollForSummary = async (callId: string) => {
    // Poll for summary up to 30 seconds (10 attempts at 3 second intervals)
    let attempts = 0;
    const maxAttempts = 10;
    
    const poll = async () => {
      attempts++;
      try {
        const response = await fetch(`/api/calls/${callId}`);
        if (response.ok) {
          const call = await response.json();
          if (call.summary) {
            setCallSummary(call.summary);
            return; // Stop polling
          }
        }
        
        if (attempts < maxAttempts) {
          setTimeout(poll, 3000); // Try again in 3 seconds
        }
      } catch (error) {
        console.error("Error polling for summary:", error);
      }
    };
    
    // Start first poll after 5 seconds (give OpenAI time to generate)
    setTimeout(poll, 5000);
  };

  const startDurationCounter = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
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
      if (!sessionId) {
        toast({
          title: "Connection Error",
          description:
            "WebSocket session not ready. Please wait and try again.",
          variant: "destructive",
        });
        return;
      }

      setPhoneNumber(phone);
      setCallStatus("ringing");
      setDuration(0);
      setTranscript([]);
      setRecordingUrl(null);
      setCallSummary(null);
      setListenUrl(null);

      const response = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: phone,
          prompt,
          callerName,
          emailRecipient: email,
          voiceProvider,
          pollyVoice: selectedPollyVoice,
          deepgramVoice: selectedDeepgramVoice,
          elevenLabsVoice: selectedElevenLabsVoice,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start call");
      }

      const data = await response.json();
      setCurrentCallId(data.callId);

      // Fetch call details to get listenUrl for live monitoring
      const callDetailsResponse = await fetch(`/api/calls/${data.callId}`);
      if (callDetailsResponse.ok) {
        const callDetails = await callDetailsResponse.json();
        if (callDetails.listenUrl) {
          setListenUrl(callDetails.listenUrl);
          console.log('Live monitoring URL available:', callDetails.listenUrl);
        }
      }

      toast({
        title: "Call Initiated",
        description: `Calling ${phone}...`,
      });
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
        const date =
          msg.timestamp instanceof Date
            ? msg.timestamp
            : new Date(msg.timestamp as any);
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

    toast({
      title: "Transcript Downloaded",
      description: "The call transcript has been saved to your device.",
    });
  };

  const handleHangUp = async () => {
    if (!currentCallId) {
      return;
    }

    try {
      const response = await fetch(`/api/calls/${currentCallId}/hangup`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to hang up call");
      }

      toast({
        title: "Call Ended",
        description: "The call has been disconnected.",
      });

      setCallStatus("ended");
      stopDurationCounter();
      setIsAudioPlaying(false);
    } catch (error) {
      console.error("Error hanging up call:", error);
      toast({
        title: "Error",
        description: "Failed to hang up the call. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleTransfer = async () => {
    if (!currentCallId) {
      return;
    }

    try {
      const response = await fetch(`/api/calls/${currentCallId}/transfer`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to transfer call");
      }

      const data = await response.json();

      toast({
        title: "Call Transferred",
        description: `The call has been transferred to ${data.transferredTo}`,
      });

      setCallStatus("ended");
      stopDurationCounter();
      setIsAudioPlaying(false);
    } catch (error) {
      console.error("Error transferring call:", error);
      toast({
        title: "Error",
        description: "Failed to transfer the call. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSendInstruction = (instruction: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && currentCallId) {
      wsRef.current.send(
        JSON.stringify({
          type: "instruction",
          data: {
            callId: currentCallId,
            instruction,
          },
        }),
      );
    } else {
      toast({
        title: "Connection Error",
        description: "Cannot send instruction - no active connection",
        variant: "destructive",
      });
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
                Powered by Twilio, DeepGram, Vapi and ElevenLabs
              </p>
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
                  voiceProvider={voiceProvider}
                  onVoiceProviderChange={setVoiceProvider}
                  selectedPollyVoice={selectedPollyVoice}
                  onPollyVoiceChange={setSelectedPollyVoice}
                  selectedDeepgramVoice={selectedDeepgramVoice}
                  onDeepgramVoiceChange={setSelectedDeepgramVoice}
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

            {callStatus === "connected" && (
              <AudioPlayer
                isPlaying={isAudioPlaying}
                onPlayPause={() => setIsAudioPlaying(!isAudioPlaying)}
              />
            )}

            {/* Live audio monitoring disabled due to Vapi WebSocket issues
            {(callStatus === "connected" || callStatus === "ringing") && listenUrl && (
              <LiveAudioMonitor
                listenUrl={listenUrl}
                callStatus={callStatus}
              />
            )}
            */}

            {/* Manual Dialer - for direct browser-to-phone calls */}
            {!isCallActive && (
              <ManualCallPanel
                sessionId={sessionId}
                onCallStarted={(callId) => {
                  console.log("Manual call started:", callId);
                }}
                onCallEnded={(callId, duration) => {
                  console.log("Manual call ended:", callId, duration);
                }}
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
