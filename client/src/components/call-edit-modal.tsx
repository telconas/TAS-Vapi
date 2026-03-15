import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader as Loader2 } from "lucide-react";

export interface CallDetail {
  id: string;
  phone_number: string;
  provider_name: string | null;
  caller_name: string | null;
  duration: number | null;
  cost_usd: number | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  summary: string | null;
  notes: string | null;
}

interface CallEditModalProps {
  call: CallDetail | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: CallDetail) => void;
}

function formatDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CallEditModal({ call, open, onClose, onSaved }: CallEditModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [providerName, setProviderName] = useState("");
  const [callerName, setCallerName] = useState("");
  const [duration, setDuration] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (call) {
      setProviderName(call.provider_name || "");
      setCallerName(call.caller_name || "");
      setDuration(call.duration != null ? String(call.duration) : "");
      setStartedAt(formatDateTimeLocal(call.started_at));
      setNotes(call.notes || "");
    }
  }, [call]);

  const handleSave = async () => {
    if (!call) return;
    setSaving(true);
    try {
      const durVal = duration.trim() !== "" ? parseInt(duration, 10) : null;
      const startedVal = startedAt ? new Date(startedAt).toISOString() : call.started_at;

      const updates: Record<string, unknown> = {
        provider_name: providerName.trim() || null,
        caller_name: callerName.trim() || null,
        duration: durVal,
        started_at: startedVal,
        notes: notes.trim() || null,
        notes_updated_at: notes.trim() ? new Date().toISOString() : null,
      };

      const { error } = await supabase.from("calls").update(updates).eq("id", call.id);

      if (error) throw error;

      toast({ title: "Call updated", description: "Changes have been saved." });
      onSaved({ ...call, ...updates, duration: durVal, started_at: startedVal as string } as CallDetail);
      onClose();
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!call) return null;

  const dt = call.started_at ? new Date(call.started_at) : null;
  const dateLabel = dt
    ? dt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "Unknown date";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Call Details</DialogTitle>
          <p className="text-sm text-muted-foreground">{dateLabel} &mdash; {call.phone_number}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ce-provider">Carrier / Provider</Label>
              <Input
                id="ce-provider"
                placeholder="e.g. ATT, Comcast West"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ce-caller">Caller Name</Label>
              <Input
                id="ce-caller"
                placeholder="e.g. James Martin"
                value={callerName}
                onChange={(e) => setCallerName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ce-duration">Duration (seconds)</Label>
              <Input
                id="ce-duration"
                type="number"
                min="0"
                placeholder="e.g. 180"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ce-started">Start Time</Label>
              <Input
                id="ce-started"
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
              />
            </div>
          </div>

          {call.summary && (
            <div className="space-y-1.5">
              <Label>AI Summary</Label>
              <div className="text-sm text-muted-foreground bg-muted/30 rounded-md p-3 border border-border leading-relaxed max-h-32 overflow-y-auto">
                {call.summary}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ce-notes">Notes</Label>
            <Textarea
              id="ce-notes"
              placeholder="Add any notes about this call — outcome, follow-up needed, issues encountered..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
