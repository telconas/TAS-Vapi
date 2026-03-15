import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Link } from "wouter";
import {
  Phone,
  Clock,
  ChevronRight,
  CircleCheck as CheckCircle2,
  Circle as XCircle,
  Star,
} from "lucide-react";

const HOURLY_RATE = 35;

interface RecentCall {
  id: string;
  phone_number: string;
  provider_name: string | null;
  caller_name: string | null;
  duration: number | null;
  cost_usd: number | null;
  status: string;
  started_at: string | null;
  summary: string | null;
  pinned: boolean;
  outcome: string | null;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function calcCost(seconds: number): number {
  return (seconds / 3600) * HOURLY_RATE;
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (outcome === "resolved") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5">
        <CheckCircle2 className="w-2.5 h-2.5" /> Resolved
      </span>
    );
  }
  if (outcome === "unresolved") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 bg-red-500/10 border border-red-500/30 rounded px-1.5 py-0.5">
        <XCircle className="w-2.5 h-2.5" /> Unresolved
      </span>
    );
  }
  return null;
}

interface RecentCallsProps {
  refreshTrigger?: number;
}

export function RecentCalls({ refreshTrigger }: RecentCallsProps) {
  const [calls, setCalls] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCalls = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("calls")
        .select("id, phone_number, provider_name, caller_name, duration, cost_usd, status, started_at, summary, pinned, outcome")
        .in("status", ["ended", "transferred"])
        .order("started_at", { ascending: false })
        .limit(8);
      setCalls(data ?? []);
      setLoading(false);
    };
    fetchCalls();
  }, [refreshTrigger]);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-base font-semibold">Recent Calls</h3>
        </div>
        <Link href="/analytics">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-7 px-2">
            View all <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : calls.length === 0 ? (
        <div className="py-8 text-center">
          <Phone className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No calls yet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {calls.map((call) => {
            const dur = call.duration ?? 0;
            const cost = call.cost_usd != null ? Number(call.cost_usd) : calcCost(dur);
            const timeAgo = call.started_at
              ? (() => {
                  const diff = (Date.now() - new Date(call.started_at).getTime()) / 1000;
                  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
                  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
                  const d = new Date(call.started_at);
                  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                })()
              : null;

            return (
              <div
                key={call.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium font-mono truncate">
                      {call.phone_number}
                    </span>
                    {call.pinned && <Star className="w-3 h-3 fill-amber-500 text-amber-500 shrink-0" />}
                    <OutcomeBadge outcome={call.outcome} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {call.caller_name && <span className="truncate max-w-[100px]">{call.caller_name}</span>}
                    {call.caller_name && call.provider_name && <span>&bull;</span>}
                    {call.provider_name && <span className="truncate max-w-[100px]">{call.provider_name}</span>}
                  </div>
                </div>

                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-xs font-mono text-muted-foreground">{formatDuration(dur)}</p>
                  <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">${cost.toFixed(2)}</p>
                </div>

                {timeAgo && (
                  <div className="text-xs text-muted-foreground/60 shrink-0 w-12 text-right">
                    {timeAgo}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
