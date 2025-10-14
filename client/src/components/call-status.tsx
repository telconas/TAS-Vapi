import { Badge } from "@/components/ui/badge";
import { Phone, PhoneCall, PhoneOff, PhoneForwarded } from "lucide-react";

interface CallStatusProps {
  status: "idle" | "ringing" | "connected" | "ended" | "transferred";
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

  const config = statusConfig[status];
  const Icon = config.icon;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Badge
          variant="outline"
          className={`px-4 py-2 text-base font-medium border ${config.color}`}
          data-testid={`status-${status}`}
        >
          <span className={`w-2 h-2 rounded-full mr-2 ${config.dotColor} ${status === "ringing" || status === "connected" ? "animate-pulse" : ""}`} />
          <Icon className="w-4 h-4 mr-2" />
          {config.label}
        </Badge>
        {duration !== undefined && duration > 0 && (
          <span className="text-lg font-mono text-muted-foreground" data-testid="text-call-duration">
            {formatDuration(duration)}
          </span>
        )}
      </div>
    </div>
  );
}
