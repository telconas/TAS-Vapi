import { useState, useEffect, useCallback, useRef } from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Phone, 
  PhoneOff, 
  Delete, 
  Mic, 
  MicOff,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const providers = [
  { name: "All Stream", number: "800-360-4467" },
  { name: "Astound", number: "800-427-8686" },
  { name: "ATT", number: "800-321-2000" },
  { name: "Century Link", number: "800-777-9594" },
  { name: "Comcast Business", number: "800-391-3000" },
  { name: "Comcast Premier Central", number: "866-925-9635" },
  { name: "Comcast Premier East", number: "833-847-4249" },
  { name: "Comcast Scheduling", number: "866-347-7357" },
  { name: "Comcast West", number: "866-950-3231" },
  { name: "Cox", number: "866-272-5777" },
  { name: "Direct TV", number: "888-342-7288" },
  { name: "Frontier", number: "800-921-8102" },
  { name: "GoTo Communications", number: "833-851-8340" },
  { name: "Grande Communications", number: "877-881-7575" },
  { name: "Granite", number: "866-847-5500" },
  { name: "Lumen", number: "877-453-8353" },
  { name: "MetTel", number: "800-876-9823" },
  { name: "Mood Media", number: "800-345-5000" },
  { name: "Optimum (CableVision)", number: "866-251-4435" },
  { name: "RCN", number: "877-726-7000" },
  { name: "Spectrum Business", number: "866-772-4948" },
  { name: "Spectrum Disconnects", number: "866-833-4292" },
  { name: "Spectrum Enterprise", number: "555-812-2591" },
  { name: "Spectrum Residential", number: "888-892-2253" },
  { name: "Spectrum Scheduling", number: "888-681-8943" },
  { name: "ATT U-verse", number: "888-288-8339" },
  { name: "Verizon Enterprise", number: "888-622-0255" },
];

interface ManualCallPanelProps {
  sessionId: string | null;
  onCallStarted?: (callId: string) => void;
  onCallEnded?: (callId: string, duration: number) => void;
}

type CallStatus = "idle" | "initializing" | "ready" | "ringing" | "connected" | "ended";

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
  const [selectedProvider, setSelectedProvider] = useState("");
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleProviderSelect = (value: string) => {
    setSelectedProvider(value);
    setPhoneNumber(value);
  };
  
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (deviceRef.current) {
        deviceRef.current.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (callStatus === "connected") {
      callStartTimeRef.current = Date.now();
      durationIntervalRef.current = setInterval(() => {
        if (callStartTimeRef.current) {
          setDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [callStatus]);

  const initializeDevice = async (): Promise<Device> => {
    return new Promise(async (resolve, reject) => {
      try {
        setCallStatus("initializing");
        setDeviceError(null);
        
        const response = await fetch("/api/manual-call/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identity: sessionId || "manual-caller" }),
        });
        
        if (!response.ok) {
          throw new Error("Failed to get access token");
        }
        
        const data = await response.json();
        
        if (deviceRef.current) {
          deviceRef.current.destroy();
          deviceRef.current = null;
        }
        
        const device = new Device(data.token, {
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
          logLevel: 1,
        });
        
        device.on("registered", () => {
          console.log("Twilio Device registered, state:", device.state);
          setCallStatus("ready");
          deviceRef.current = device;
          resolve(device);
        });
        
        device.on("error", (error) => {
          console.error("Twilio Device error:", error);
          setDeviceError(error.message);
          toast({
            title: "Device Error",
            description: error.message,
            variant: "destructive",
          });
          reject(error);
        });
        
        device.on("incoming", (call) => {
          console.log("Incoming call:", call);
        });
        
        device.on("unregistered", () => {
          console.log("Twilio Device unregistered");
          setCallStatus("idle");
        });
        
        await device.register();
        
      } catch (error) {
        console.error("Failed to initialize Twilio Device:", error);
        setCallStatus("idle");
        setDeviceError(error instanceof Error ? error.message : "Failed to initialize");
        toast({
          title: "Initialization Failed",
          description: "Could not initialize the calling device. Please try again.",
          variant: "destructive",
        });
        reject(error);
      }
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleDialPadPress = useCallback((digit: string) => {
    if (callStatus === "idle" || callStatus === "ready") {
      setPhoneNumber((prev) => prev + digit);
    } else if ((callStatus === "connected" || callStatus === "ringing") && callRef.current) {
      callRef.current.sendDigits(digit);
      toast({
        title: "DTMF Sent",
        description: `Sent digit: ${digit}`,
      });
    }
  }, [callStatus, toast]);

  const handleBackspace = () => {
    if (callStatus === "idle" || callStatus === "ready") {
      setPhoneNumber((prev) => prev.slice(0, -1));
    }
  };

  const formatPhoneNumber = (number: string): string => {
    const cleaned = number.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
      return `+${cleaned}`;
    } else if (number.startsWith("+")) {
      return number;
    }
    return `+1${cleaned}`;
  };

  const startCall = async () => {
    if (!phoneNumber) {
      toast({
        title: "Error",
        description: "Please enter a phone number",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Initialize device if needed - this now returns a Promise that resolves when registered
      let device = deviceRef.current;
      if (!device || device.state !== "registered") {
        device = await initializeDevice();
      }
      
      console.log("Device ready, state:", device.state);
      
      if (!device || device.state !== "registered") {
        throw new Error("Device not ready. Please try again.");
      }

      const formattedNumber = formatPhoneNumber(phoneNumber);
      
      const callIdResponse = await fetch("/api/manual-call/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: formattedNumber,
          callerName: "Manual Caller",
          emailRecipient: "jpm@telconassociates.com",
          sessionId,
        }),
      });
      
      if (!callIdResponse.ok) {
        throw new Error("Failed to register call");
      }
      
      const callIdData = await callIdResponse.json();
      const callId = callIdData.callId;
      setCurrentCallId(callId);
      
      const call = await device.connect({
        params: {
          To: formattedNumber,
          CallId: callId,
        },
      });
      
      callRef.current = call;
      setCallStatus("ringing");
      setDuration(0);
      setIsMuted(false);
      
      call.on("accept", () => {
        console.log("Call accepted");
        setCallStatus("connected");
        onCallStarted?.(callId);
        toast({
          title: "Connected",
          description: `Call connected to ${formattedNumber}`,
        });
      });
      
      call.on("disconnect", () => {
        console.log("Call disconnected");
        const finalDuration = callStartTimeRef.current 
          ? Math.floor((Date.now() - callStartTimeRef.current) / 1000)
          : duration;
        
        setCallStatus("ended");
        onCallEnded?.(callId, finalDuration);
        
        toast({
          title: "Call Ended",
          description: `Duration: ${formatDuration(finalDuration)}`,
        });
        
        setTimeout(() => {
          setCallStatus("ready");
          setCurrentCallId(null);
          setDuration(0);
          callRef.current = null;
          callStartTimeRef.current = null;
        }, 2000);
      });
      
      call.on("cancel", () => {
        console.log("Call cancelled");
        setCallStatus("ready");
        setCurrentCallId(null);
        callRef.current = null;
      });
      
      call.on("reject", () => {
        console.log("Call rejected");
        setCallStatus("ready");
        setCurrentCallId(null);
        callRef.current = null;
        toast({
          title: "Call Rejected",
          description: "The call was rejected",
          variant: "destructive",
        });
      });
      
      call.on("error", (error) => {
        console.error("Call error:", error);
        setCallStatus("ready");
        setCurrentCallId(null);
        callRef.current = null;
        toast({
          title: "Call Error",
          description: error.message || "An error occurred during the call",
          variant: "destructive",
        });
      });
      
      toast({
        title: "Calling...",
        description: `Dialing ${formattedNumber}`,
      });
      
    } catch (error) {
      console.error("Failed to start call:", error);
      setCallStatus(deviceRef.current ? "ready" : "idle");
      toast({
        title: "Call Failed",
        description: error instanceof Error ? error.message : "Could not start the call",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const endCall = () => {
    console.log("End call clicked, callRef:", callRef.current, "deviceRef:", deviceRef.current);
    
    if (callRef.current) {
      try {
        callRef.current.disconnect();
      } catch (error) {
        console.error("Error disconnecting call:", error);
      }
    }
    
    // Force reset state if disconnect doesn't work
    if (callStatus === "ringing" || callStatus === "connected") {
      const finalDuration = callStartTimeRef.current 
        ? Math.floor((Date.now() - callStartTimeRef.current) / 1000)
        : duration;
      
      setCallStatus("ended");
      if (currentCallId) {
        onCallEnded?.(currentCallId, finalDuration);
      }
      
      setTimeout(() => {
        setCallStatus("ready");
        setCurrentCallId(null);
        setDuration(0);
        callRef.current = null;
        callStartTimeRef.current = null;
      }, 1000);
    }
  };

  const toggleMute = () => {
    if (callRef.current) {
      const newMuteState = !isMuted;
      callRef.current.mute(newMuteState);
      setIsMuted(newMuteState);
      toast({
        title: newMuteState ? "Muted" : "Unmuted",
        description: newMuteState ? "Microphone muted" : "Microphone unmuted",
      });
    }
  };

  const getStatusColor = () => {
    switch (callStatus) {
      case "initializing":
        return "bg-blue-500";
      case "ready":
        return "bg-green-600";
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
      case "initializing":
        return "Initializing...";
      case "ready":
        return "Ready";
      case "ringing":
        return "Ringing...";
      case "connected":
        return `Connected - ${formatDuration(duration)}`;
      case "ended":
        return "Call Ended";
      default:
        return "Click Call to Start";
    }
  };

  const isCallActive = callStatus === "ringing" || callStatus === "connected";
  const canDial = callStatus === "idle" || callStatus === "ready";

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2">
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

        {deviceError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{deviceError}</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manual-provider">Provider (Quick Select)</Label>
            <Select
              value={selectedProvider}
              onValueChange={handleProviderSelect}
              disabled={isCallActive}
            >
              <SelectTrigger
                className="w-full bg-card border-card-border"
                data-testid="select-manual-provider"
              >
                <SelectValue placeholder="Select a Provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem
                    key={provider.number}
                    value={provider.number}
                    data-testid={`manual-option-provider-${provider.name.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {provider.name} - {provider.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-phone">Phone Number</Label>
            <div className="flex gap-2">
              <Input
                id="manual-phone"
                data-testid="input-manual-phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  setSelectedProvider("");
                }}
                placeholder="+1 (555) 123-4567"
                className="font-mono text-lg"
                disabled={isCallActive}
              />
              <Button
                data-testid="button-backspace"
                variant="outline"
                size="icon"
                onClick={handleBackspace}
                disabled={isCallActive || !phoneNumber}
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
                disabled={isLoading || callStatus === "initializing"}
              >
                {key}
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            {!isCallActive ? (
              <Button
                data-testid="button-start-manual-call"
                className="flex-1 h-14 bg-green-600 hover:bg-green-700"
                onClick={startCall}
                disabled={!phoneNumber || isLoading || callStatus === "initializing"}
              >
                {isLoading || callStatus === "initializing" ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Phone className="w-5 h-5 mr-2" />
                )}
                {callStatus === "initializing" ? "Initializing..." : "Call"}
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
                onClick={toggleMute}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>
            </div>
          )}

          <p className="text-sm text-muted-foreground text-center">
            {isCallActive 
              ? "Press dial pad keys to send DTMF tones" 
              : "Calls will be recorded and summaries emailed"}
          </p>
        </div>
      </div>
    </Card>
  );
}
