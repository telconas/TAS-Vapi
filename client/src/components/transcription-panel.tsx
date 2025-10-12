import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User } from "lucide-react";
import type { TranscriptMessage } from "@shared/schema";

interface TranscriptionPanelProps {
  messages: TranscriptMessage[];
  isActive: boolean;
}

export function TranscriptionPanel({ messages, isActive }: TranscriptionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const formatTime = (timestamp: Date | number) => {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <Card className="h-[500px] flex flex-col" data-testid="card-transcription-panel">
      <div className="p-6 border-b border-card-border">
        <h3 className="text-lg font-semibold">Live Transcription</h3>
        {isActive && (
          <p className="text-sm text-muted-foreground mt-1">
            Conversation in progress...
          </p>
        )}
      </div>
      
      <ScrollArea className="flex-1 p-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Phone className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-medium text-muted-foreground">
                No active conversation
              </p>
              <p className="text-sm text-muted-foreground/70">
                Start a call to see the transcription appear here
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.speaker === "caller" ? "flex-row-reverse" : ""}`}
                data-testid={`message-${message.speaker}-${message.id}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.speaker === "ai"
                      ? "bg-primary/20 text-primary"
                      : "bg-card text-card-foreground"
                  }`}
                >
                  {message.speaker === "ai" ? (
                    <Bot className="w-4 h-4" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </div>
                <div
                  className={`flex-1 max-w-[80%] ${message.speaker === "caller" ? "text-right" : ""}`}
                >
                  <div
                    className={`inline-block p-4 rounded-lg ${
                      message.speaker === "ai"
                        ? "bg-primary/10 text-foreground"
                        : "bg-card text-card-foreground"
                    }`}
                  >
                    <p className="text-base">{message.text}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 px-1">
                    {formatTime(message.timestamp)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}

function Phone(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
