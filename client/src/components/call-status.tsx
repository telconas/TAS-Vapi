import { Badge } from "@/components/ui/badge";
import { Phone, PhoneCall, PhoneOff, PhoneForwarded, Timer } from "lucide-react";

interface CallStatusProps {
  status: "idle" | "ringing" | "connected" | "ended" | "transferred" | "transferring";
  duration?: number;
}

export function CallStatus({ status, duration }: CallStatusProps) {
  const statusConfig = {
    idle: {
      label: "Idle",
      icon: Phone,
      color: "bg-muted text-muted-foreground",
      dotColor: "bg-muted-foreground",
    },
    ringing: {
      label: "Ringing...",
      icon: PhoneCall,
      color: "bg-chart-3/20 text-chart-3 border-chart-3/30",
      dotColor: "bg-chart-3",
    },
    connected: {
      label: "Connected",
      icon: PhoneCall,
      color: "bg-chart-2/20 text-chart-2 border-chart-2/30",
      dotColor: "bg-chart-2",
    },
    transferring: {
      label: "Transferring...",
      icon: PhoneForwarded,
      color: "bg-chart-5/20 text-chart-5 border-chart-5/30",
      dotColor: "bg-chart-5",
    },
    ended: {
      label: "Call Ended",
      icon: PhoneOff,
      color: "bg-destructive/20 text-destructive border-destructive/30",
      dotColor: "bg-destructive",
    },
    transferred: {
      label: "Call Transferred",
      icon: PhoneForwarded,
      color: "bg-primary/20 text-primary border-primary/30",
      dotColor: "bg-primary",
    },
  };

  const config = statusConfig[status] || statusConfig.ended;
  const Icon = config.icon;

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const showTimer = status === "connected" || status === "ringing" || status === "transferring";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Badge
          variant="outline"
          className={`px-4 py-2 text-base font-medium border ${config.color}`}
          data-testid={`status-${status}`}
        >
          <span className={`w-2 h-2 rounded-full mr-2 ${config.dotColor} ${status === "ringing" || status === "connected" || status === "transferring" ? "animate-pulse" : ""}`} />
          <Icon className="w-4 h-4 mr-2" />
          {config.label}
        </Badge>
      </div>

      {showTimer && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/50 border border-border">
          <Timer className={`w-5 h-5 ${status === "connected" ? "text-chart-2" : "text-muted-foreground"}`} />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide leading-none mb-1">
              {status === "connected" ? "Call Duration" : "Elapsed"}
            </p>
            <span
              className={`text-2xl font-mono font-semibold tabular-nums ${status === "connected" ? "text-foreground" : "text-muted-foreground"}`}
              data-testid="text-call-duration"
            >
              {formatDuration(duration ?? 0)}
            </span>
          </div>
        </div>
      )}

      {status === "ended" && duration !== undefined && duration > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/30 border border-border">
          <Timer className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide leading-none mb-1">Total Duration</p>
            <span className="text-2xl font-mono font-semibold tabular-nums text-muted-foreground" data-testid="text-call-duration">
              {formatDuration(duration)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
