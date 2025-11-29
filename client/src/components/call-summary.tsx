import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Clock, MessageSquare, Copy, Check } from "lucide-react";
import type { TranscriptMessage } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { RecordingPlayer } from "./recording-player";

interface CallSummaryProps {
  duration: number;
  transcript: TranscriptMessage[];
  onDownloadTranscript: () => void;
  recordingUrl?: string;
  summary?: string;
}

export function CallSummary({ duration, transcript, onDownloadTranscript, recordingUrl, summary }: CallSummaryProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const handleCopySummary = async () => {
    if (!summary) return;
    
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      toast({
        title: "Summary Copied",
        description: "Call summary copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy summary to clipboard",
        variant: "destructive",
      });
    }
  };

  const messageCount = transcript.length;
  const aiMessages = transcript.filter((m) => m.speaker === "ai").length;
  const callerMessages = transcript.filter((m) => m.speaker === "caller").length;

  return (
    <Card className="p-6 border-t-2 border-t-primary" data-testid="card-call-summary">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Call Summary</h3>
          <Button
            variant="outline"
            onClick={onDownloadTranscript}
            data-testid="button-download-transcript"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Transcript
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">Duration</span>
            </div>
            <p className="text-2xl font-semibold" data-testid="text-summary-duration">
              {formatDuration(duration)}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageSquare className="w-4 h-4" />
              <span className="text-sm font-medium">Total Messages</span>
            </div>
            <p className="text-2xl font-semibold" data-testid="text-summary-messages">
              {messageCount}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageSquare className="w-4 h-4" />
              <span className="text-sm font-medium">AI / Caller</span>
            </div>
            <p className="text-2xl font-semibold font-mono" data-testid="text-summary-breakdown">
              {aiMessages} / {callerMessages}
            </p>
          </div>
        </div>

        {summary && (
          <div className="space-y-3 pt-4 border-t border-card-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm font-medium">AI-Generated Summary</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopySummary}
                data-testid="button-copy-summary"
              >
                {copied ? (
                  <Check className="w-4 h-4 mr-2" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <div 
              className="bg-muted/30 p-4 rounded-md whitespace-pre-wrap text-sm"
              data-testid="text-call-summary"
            >
              {summary}
            </div>
          </div>
        )}

        {recordingUrl && (
          <div className="pt-4 border-t border-card-border">
            <RecordingPlayer recordingUrl={recordingUrl} />
          </div>
        )}

        <div className="pt-4 border-t border-card-border">
          <p className="text-sm text-muted-foreground">
            Call completed successfully. Full transcript available above.
          </p>
        </div>
      </div>
    </Card>
  );
}
