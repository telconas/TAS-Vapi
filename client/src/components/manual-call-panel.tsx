import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Phone, 
  PhoneOff, 
  Delete, 
  Mic, 
  MicOff,
  Volume2,
  VolumeX
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ManualCallPanelProps {
  sessionId: string | null;
  onCallStarted?: (callId: string) => void;
  onCallEnded?: (callId: string, duration: number) => void;
}

type CallStatus = "idle" | "ringing" | "connected" | "ended";

const DIAL_PAD_KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

export function ManualCallPanel({ 
  sessionId, 
  onCallStarted, 
  onCallEnded 
}: ManualCallPanelProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (callStatus === "connected") {
      interval = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStatus]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleDialPadPress = useCallback(async (digit: string) => {
    if (callStatus === "idle") {
      setPhoneNumber((prev) => prev + digit);
    } else if (callStatus === "connected" && currentCallId) {
      try {
        await apiRequest("POST", `/api/manual-call/${currentCallId}/dtmf`, { digits: digit });
        toast({
          title: "DTMF Sent",
          description: `Sent digit: ${digit}`,
        });
      } catch (error) {
        console.error("Failed to send DTMF:", error);
      }
    }
  }, [callStatus, currentCallId, toast]);

  const handleBackspace = () => {
    if (callStatus === "idle") {
      setPhoneNumber((prev) => prev.slice(0, -1));
    }
  };

  const startCall = async () => {
    if (!phoneNumber || !sessionId) {
      toast({
        title: "Error",
        description: "Please enter a phone number",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/manual-call/start", {
        phoneNumber,
        callerName: "Manual Caller",
        emailRecipient: "jpm@telconassociates.com",
        sessionId,
      });

      const data = await response.json();
      setCurrentCallId(data.callId);
      setCallStatus("ringing");
      setDuration(0);
      onCallStarted?.(data.callId);

      toast({
        title: "Calling...",
        description: `Dialing ${phoneNumber}`,
      });
    } catch (error) {
      console.error("Failed to start call:", error);
      toast({
        title: "Call Failed",
        description: "Could not start the call. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const endCall = async () => {
    if (!currentCallId) return;

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", `/api/manual-call/${currentCallId}/hangup`);
      const data = await response.json();
      
      setCallStatus("ended");
      onCallEnded?.(currentCallId, data.duration || duration);

      toast({
        title: "Call Ended",
        description: `Duration: ${formatDuration(data.duration || duration)}`,
      });

      setTimeout(() => {
        setCallStatus("idle");
        setCurrentCallId(null);
        setDuration(0);
      }, 2000);
    } catch (error) {
      console.error("Failed to end call:", error);
      toast({
        title: "Error",
        description: "Could not end the call",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = () => {
    switch (callStatus) {
      case "ringing":
        return "bg-yellow-500";
      case "connected":
        return "bg-green-500";
      case "ended":
        return "bg-red-500";
      default:
        return "bg-muted";
    }
  };

  const getStatusText = () => {
    switch (callStatus) {
      case "ringing":
        return "Ringing...";
      case "connected":
        return `Connected - ${formatDuration(duration)}`;
      case "ended":
        return "Call Ended";
      default:
        return "Ready";
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Phone className="w-5 h-5 text-[#219ebc]" />
            Manual Dialer
          </h2>
          <Badge 
            data-testid="badge-manual-call-status"
            className={`${getStatusColor()} text-white`}
          >
            {getStatusText()}
          </Badge>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manual-phone">Phone Number</Label>
            <div className="flex gap-2">
              <Input
                id="manual-phone"
                data-testid="input-manual-phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="font-mono text-lg"
                disabled={callStatus !== "idle"}
              />
              <Button
                data-testid="button-backspace"
                variant="outline"
                size="icon"
                onClick={handleBackspace}
                disabled={callStatus !== "idle" || !phoneNumber}
              >
                <Delete className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {DIAL_PAD_KEYS.flat().map((key) => (
              <Button
                key={key}
                data-testid={`button-dial-${key === "*" ? "star" : key === "#" ? "hash" : key}`}
                variant="outline"
                className="h-14 text-xl font-semibold hover-elevate"
                onClick={() => handleDialPadPress(key)}
                disabled={isLoading}
              >
                {key}
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            {callStatus === "idle" ? (
              <Button
                data-testid="button-start-manual-call"
                className="flex-1 h-14 bg-green-600 hover:bg-green-700"
                onClick={startCall}
                disabled={!phoneNumber || isLoading || !sessionId}
              >
                <Phone className="w-5 h-5 mr-2" />
                Call
              </Button>
            ) : (
              <Button
                data-testid="button-end-manual-call"
                className="flex-1 h-14 bg-red-600 hover:bg-red-700"
                onClick={endCall}
                disabled={isLoading}
              >
                <PhoneOff className="w-5 h-5 mr-2" />
                End Call
              </Button>
            )}
          </div>

          {callStatus === "connected" && (
            <div className="flex justify-center gap-4">
              <Button
                data-testid="button-mute"
                variant={isMuted ? "destructive" : "outline"}
                size="icon"
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>
              <Button
                data-testid="button-speaker"
                variant={!isSpeakerOn ? "destructive" : "outline"}
                size="icon"
                onClick={() => setIsSpeakerOn(!isSpeakerOn)}
              >
                {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </Button>
            </div>
          )}

          <p className="text-sm text-muted-foreground text-center">
            {callStatus === "connected" 
              ? "Press dial pad keys to send DTMF tones" 
              : "Calls will be recorded and summaries emailed"}
          </p>
        </div>
      </div>
    </Card>
  );
}
