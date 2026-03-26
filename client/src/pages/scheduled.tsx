import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Calendar, ArrowLeft, Phone, Clock, Trash2, CircleCheck as CheckCircle2, CircleAlert as AlertCircle, Loader as Loader2 } from "lucide-react";

interface ScheduledCall {
  id: string;
  phone_number: string;
  prompt: string;
  caller_name: string | null;
  provider_name: string | null;
  voice_id: string | null;
  email_recipient: string | null;
  scheduled_at: string;
  status: string;
  call_id: string | null;
  notes: string | null;
  created_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: {
    label: "Pending",
    color: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    icon: Clock,
  },
  in_progress: {
    label: "In Progress",
    color: "text-blue-600 bg-blue-500/10 border-blue-500/30",
    icon: Loader2,
  },
  completed: {
    label: "Completed",
    color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    color: "text-red-500 bg-red-500/10 border-red-500/30",
    icon: AlertCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium rounded px-1.5 py-0.5 border ${config.color}`}
    >
      <Icon className={`w-3 h-3 ${status === "in_progress" ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}

function formatScheduledTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Scheduled() {
  const [calls, setCalls] = useState<ScheduledCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchScheduled = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("scheduled_calls")
        .select("*")
        .order("scheduled_at", { ascending: true });
      if (!error && data) setCalls(data as ScheduledCall[]);
      setLoading(false);
    };
    fetchScheduled();
  }, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("scheduled_calls").delete().eq("id", id);
    if (!error) {
      setCalls((prev) => prev.filter((c) => c.id !== id));
    }
    setDeletingId(null);
  };

  const pendingCalls = calls.filter((c) => c.status === "pending" || c.status === "in_progress");
  const pastCalls = calls.filter((c) => c.status === "completed" || c.status === "failed");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Scheduled Calls</h1>
              <p className="text-sm text-muted-foreground">
                {pendingCalls.length} upcoming
              </p>
            </div>
            <div className="ml-auto">
              <Link href="/">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-3xl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : calls.length === 0 ? (
          <Card className="p-12 text-center">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <h2 className="text-lg font-semibold mb-1">No scheduled calls</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Schedule a call from the dashboard to see it here.
            </p>
            <Link href="/">
              <Button variant="outline" size="sm">
                Go to Dashboard
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-8">
            {pendingCalls.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Upcoming
                </h2>
                <div className="space-y-3">
                  {pendingCalls.map((call) => (
                    <Card key={call.id} className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium font-mono">
                              {call.phone_number}
                            </span>
                            <StatusBadge status={call.status} />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {formatScheduledTime(call.scheduled_at)}
                          </div>
                          {call.provider_name && (
                            <p className="text-xs text-muted-foreground">
                              Provider: {call.provider_name}
                            </p>
                          )}
                          {call.caller_name && (
                            <p className="text-xs text-muted-foreground">
                              Caller: {call.caller_name}
                            </p>
                          )}
                          {call.notes && (
                            <p className="text-xs text-muted-foreground mt-1 bg-muted/40 rounded px-2 py-1 border border-border/60">
                              {call.notes}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {call.prompt}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                          disabled={deletingId === call.id}
                          onClick={() => handleDelete(call.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {pastCalls.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Past
                </h2>
                <div className="space-y-3">
                  {pastCalls.map((call) => (
                    <Card key={call.id} className="p-4 opacity-70">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium font-mono">
                              {call.phone_number}
                            </span>
                            <StatusBadge status={call.status} />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {formatScheduledTime(call.scheduled_at)}
                          </div>
                          {call.provider_name && (
                            <p className="text-xs text-muted-foreground">
                              Provider: {call.provider_name}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                          disabled={deletingId === call.id}
                          onClick={() => handleDelete(call.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
