import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Phone, Clock, DollarSign, ArrowLeft, FileText, ChevronLeft, ChevronRight, Download, Pencil, Star, CircleCheck as CheckCircle2, Circle as XCircle } from "lucide-react";
import CallEditModal, { type CallDetail } from "@/components/call-edit-modal";

const HOURLY_RATE = 35;

interface CallRecord {
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
  pinned: boolean;
  outcome: string | null;
}

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

function getWeekRange(offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek + offset * 7);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const label =
    offset === 0
      ? `This Week (${fmt(startOfWeek)} – ${fmt(endOfWeek)})`
      : offset === -1
      ? `Last Week (${fmt(startOfWeek)} – ${fmt(endOfWeek)})`
      : `${fmt(startOfWeek)} – ${fmt(endOfWeek)}`;

  return { start: startOfWeek, end: endOfWeek, label };
}

function getMonthRange(offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999);
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { start, end, label };
}

interface ProviderSummary {
  name: string;
  calls: number;
  totalSeconds: number;
  totalCost: number;
  callList: CallRecord[];
}

function buildProviderSummaries(calls: CallRecord[]): ProviderSummary[] {
  const map: Record<string, ProviderSummary> = {};
  for (const call of calls) {
    const key = call.provider_name || "Unknown";
    const dur = call.duration ?? 0;
    const cost = call.cost_usd != null ? Number(call.cost_usd) : calcCost(dur);
    if (!map[key]) {
      map[key] = { name: key, calls: 0, totalSeconds: 0, totalCost: 0, callList: [] };
    }
    map[key].calls += 1;
    map[key].totalSeconds += dur;
    map[key].totalCost += cost;
    map[key].callList.push(call);
  }
  return Object.values(map).sort((a, b) => b.calls - a.calls);
}

function exportCSV(calls: CallRecord[], periodLabel: string) {
  const rows = [
    ["Date", "Time", "Provider", "Caller", "Phone Number", "Duration (s)", "Duration", "Cost"],
    ...calls.map((c) => {
      const dur = c.duration ?? 0;
      const cost = c.cost_usd != null ? Number(c.cost_usd) : calcCost(dur);
      const dt = c.started_at ? new Date(c.started_at) : null;
      return [
        dt ? dt.toLocaleDateString("en-US") : "",
        dt ? dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "",
        c.provider_name || "Unknown",
        c.caller_name || "",
        c.phone_number,
        dur.toString(),
        formatDuration(dur),
        formatCost(cost),
      ];
    }),
  ];
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `calls-report-${periodLabel.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [allCalls, setAllCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [editingCall, setEditingCall] = useState<CallDetail | null>(null);
  const [togglingPinId, setTogglingPinId] = useState<string | null>(null);

  const handleTogglePin = async (call: CallRecord) => {
    setTogglingPinId(call.id);
    const newPinned = !call.pinned;
    try {
      await supabase.from("calls").update({ pinned: newPinned }).eq("id", call.id);
      setAllCalls((prev) => prev.map((c) => c.id === call.id ? { ...c, pinned: newPinned } : c));
    } catch (err) {
      console.error("Error toggling pin:", err);
    } finally {
      setTogglingPinId(null);
    }
  };

  useEffect(() => {
    const fetchCalls = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("calls")
          .select("id, phone_number, provider_name, caller_name, duration, cost_usd, status, started_at, ended_at, summary, notes, pinned, outcome")
          .in("status", ["ended", "transferred"])
          .order("started_at", { ascending: false });
        if (!error && data) setAllCalls(data as CallRecord[]);
      } catch (err) {
        console.error("Error fetching calls:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCalls();
  }, []);

  const { start, end, label } = useMemo(
    () => (mode === "weekly" ? getWeekRange(weekOffset) : getMonthRange(monthOffset)),
    [mode, weekOffset, monthOffset]
  );

  const periodCalls = useMemo(
    () =>
      allCalls.filter((c) => {
        if (!c.started_at) return false;
        const d = new Date(c.started_at);
        return d >= start && d <= end;
      }),
    [allCalls, start, end]
  );

  const providerSummaries = useMemo(() => buildProviderSummaries(periodCalls), [periodCalls]);

  const totals = useMemo(() => {
    return periodCalls.reduce(
      (acc, c) => {
        const dur = c.duration ?? 0;
        const cost = c.cost_usd != null ? Number(c.cost_usd) : calcCost(dur);
        acc.calls += 1;
        acc.totalSeconds += dur;
        acc.totalCost += cost;
        return acc;
      },
      { calls: 0, totalSeconds: 0, totalCost: 0 }
    );
  }, [periodCalls]);

  const prev = () => {
    if (mode === "weekly") setWeekOffset((o) => o - 1);
    else setMonthOffset((o) => o - 1);
  };

  const next = () => {
    if (mode === "weekly") setWeekOffset((o) => o + 1);
    else setMonthOffset((o) => o + 1);
  };

  const canGoNext = mode === "weekly" ? weekOffset < 0 : monthOffset < 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Call Reports</h1>
              <p className="text-sm text-muted-foreground">Weekly & monthly breakdowns by carrier</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCSV(periodCalls, label)}
                disabled={periodCalls.length === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
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

      <main className="container mx-auto px-6 py-8 max-w-6xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2 bg-muted/40 rounded-lg p-1">
            <Button
              variant={mode === "weekly" ? "default" : "ghost"}
              size="sm"
              onClick={() => { setMode("weekly"); setWeekOffset(0); }}
            >
              Weekly
            </Button>
            <Button
              variant={mode === "monthly" ? "default" : "ghost"}
              size="sm"
              onClick={() => { setMode("monthly"); setMonthOffset(0); }}
            >
              Monthly
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[220px] text-center">{label}</span>
            <Button variant="outline" size="icon" onClick={next} disabled={!canGoNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Phone className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Total Calls</p>
            </div>
            <p className="text-3xl font-bold">{totals.calls}</p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-sm text-muted-foreground">Total Time</p>
            </div>
            <p className="text-3xl font-bold">{formatDuration(totals.totalSeconds)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {(totals.totalSeconds / 60).toFixed(1)} minutes
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-sm text-muted-foreground">Cost Saved</p>
            </div>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCost(totals.totalCost)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">vs. $35/hr live agent</p>
          </Card>
        </div>

        {loading ? (
          <Card className="p-8 text-center text-muted-foreground">Loading...</Card>
        ) : periodCalls.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No completed calls found for this period.
          </Card>
        ) : (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Breakdown by Carrier
            </h2>

            {providerSummaries.map((ps) => {
              const isExpanded = expandedProvider === ps.name;
              return (
                <Card key={ps.name} className="overflow-hidden">
                  <button
                    className="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedProvider(isExpanded ? null : ps.name)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="font-semibold text-base">{ps.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {ps.calls} {ps.calls === 1 ? "call" : "calls"}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-muted-foreground">Duration</p>
                        <p className="font-mono font-medium">{formatDuration(ps.totalSeconds)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Cost</p>
                        <p className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatCost(ps.totalCost)}
                        </p>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border divide-y divide-border">
                      {ps.callList.map((call) => {
                        const dur = call.duration ?? 0;
                        const cost =
                          call.cost_usd != null ? Number(call.cost_usd) : calcCost(dur);
                        const dt = call.started_at ? new Date(call.started_at) : null;
                        return (
                          <div
                            key={call.id}
                            className="px-6 py-3 bg-muted/10 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5 min-w-0 flex-1 mr-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-mono">{call.phone_number}</p>
                                  {call.outcome === "resolved" && (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5">
                                      <CheckCircle2 className="w-3 h-3" /> Resolved
                                    </span>
                                  )}
                                  {call.outcome === "unresolved" && (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 bg-red-500/10 border border-red-500/30 rounded px-1.5 py-0.5">
                                      <XCircle className="w-3 h-3" /> Unresolved
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  {dt && (
                                    <span>
                                      {dt.toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                      })}{" "}
                                      {dt.toLocaleTimeString("en-US", {
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  )}
                                  {call.caller_name && (
                                    <span className="text-muted-foreground/70">
                                      Caller: {call.caller_name}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-sm shrink-0">
                                <div className="text-right hidden sm:block">
                                  <p className="text-xs text-muted-foreground">Duration</p>
                                  <p className="font-mono font-medium">{formatDuration(dur)}</p>
                                </div>
                                <div className="text-right hidden sm:block">
                                  <p className="text-xs text-muted-foreground">Cost</p>
                                  <p className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                                    {formatCost(cost)}
                                  </p>
                                </div>
                                <button
                                  className={`p-1.5 rounded-md transition-colors ${
                                    call.pinned
                                      ? "text-amber-500 bg-amber-500/10"
                                      : "text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
                                  }`}
                                  disabled={togglingPinId === call.id}
                                  onClick={() => handleTogglePin(call)}
                                  title={call.pinned ? "Unpin" : "Pin call"}
                                >
                                  <Star className={`w-3.5 h-3.5 ${call.pinned ? "fill-amber-500" : ""}`} />
                                </button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  onClick={() => setEditingCall(call as CallDetail)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                            {call.notes && (
                              <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5 border border-border/60">
                                <span className="font-medium text-foreground/70">Note:</span> {call.notes}
                              </p>
                            )}
                          </div>
                        );
                      })}
                      <div className="px-6 py-3 flex items-center justify-between bg-muted/30">
                        <span className="text-sm font-semibold text-muted-foreground">
                          {ps.name} Total
                        </span>
                        <div className="flex items-center gap-5 text-sm">
                          <div className="text-right">
                            <p className="font-mono font-semibold">{formatDuration(ps.totalSeconds)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatCost(ps.totalCost)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <CallEditModal
        call={editingCall}
        open={editingCall !== null}
        onClose={() => setEditingCall(null)}
        onSaved={(updated) => {
          setAllCalls((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
        }}
      />
    </div>
  );
}
