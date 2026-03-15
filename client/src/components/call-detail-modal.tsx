import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pencil, Clock, DollarSign, Phone, CircleCheck as CheckCircle2, Circle as XCircle, Star, FileText } from "lucide-react";
import type { CallDetail } from "@/components/call-edit-modal";

const HOURLY_RATE = 30;

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function calcCost(seconds: number): number {
  return (seconds / 3600) * HOURLY_RATE;
}

interface CallDetailModalProps {
  call: CallDetail | null;
  open: boolean;
  onClose: () => void;
  onEdit: (call: CallDetail) => void;
}

export default function CallDetailModal({ call, open, onClose, onEdit }: CallDetailModalProps) {
  if (!call) return null;

  const dur = call.duration ?? 0;
  const cost = call.cost_usd != null ? Number(call.cost_usd) : calcCost(dur);
  const dt = call.started_at ? new Date(call.started_at) : null;
  const dateLabel = dt
    ? dt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "Unknown date";
  const timeLabel = dt
    ? dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span className="font-mono">{call.phone_number}</span>
              {call.pinned && <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => { onClose(); onEdit(call); }}
            >
              <Pencil className="w-3 h-3" />
              Edit
            </Button>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {dateLabel}{timeLabel ? ` at ${timeLabel}` : ""}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-muted/40 border border-border p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                Duration
              </div>
              <p className="font-mono font-semibold text-sm">{formatDuration(dur)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <DollarSign className="w-3.5 h-3.5" />
                Cost
              </div>
              <p className="font-mono font-semibold text-sm text-emerald-600 dark:text-emerald-400">{formatCost(cost)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border p-3 flex flex-col gap-1">
              <div className="text-xs text-muted-foreground mb-0.5">Outcome</div>
              {call.outcome === "resolved" && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
                </span>
              )}
              {call.outcome === "unresolved" && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
                  <XCircle className="w-3.5 h-3.5" /> Unresolved
                </span>
              )}
              {!call.outcome && (
                <span className="text-xs text-muted-foreground">Not set</span>
              )}
            </div>
          </div>

          {(call.caller_name || call.provider_name) && (
            <div className="flex items-center gap-4 text-sm">
              {call.caller_name && (
                <div>
                  <span className="text-xs text-muted-foreground">Caller</span>
                  <p className="font-medium">{call.caller_name}</p>
                </div>
              )}
              {call.provider_name && (
                <div>
                  <span className="text-xs text-muted-foreground">Provider</span>
                  <p className="font-medium">{call.provider_name}</p>
                </div>
              )}
            </div>
          )}

          {call.summary ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <FileText className="w-3.5 h-3.5" />
                AI Summary
              </div>
              <div className="text-sm leading-relaxed bg-muted/30 border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
                {call.summary}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              No summary available for this call.
            </div>
          )}

          {call.notes && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</div>
              <div className="text-sm text-muted-foreground bg-muted/30 border border-border rounded-lg px-3 py-2 leading-relaxed">
                {call.notes}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
