import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Phone, Clock, DollarSign, ChevronLeft, ChevronRight, ArrowLeft, ChartBar as BarChart2, FileText, Pencil, Trash2, Star, CircleCheck as CheckCircle2, Circle as XCircle, TrendingUp, Search, X } from "lucide-react";
import CallEditModal, { type CallDetail } from "@/components/call-edit-modal";
import CallDetailModal from "@/components/call-detail-modal";

const HOURLY_RATE = 30;

interface DayData {
  date: string;
  calls: number;
  totalSeconds: number;
  totalCost: number;
}

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

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (outcome === "resolved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5">
        <CheckCircle2 className="w-3 h-3" /> Resolved
      </span>
    );
  }
  if (outcome === "unresolved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 bg-red-500/10 border border-red-500/30 rounded px-1.5 py-0.5">
        <XCircle className="w-3 h-3" /> Unresolved
      </span>
    );
  }
  return null;
}

export default function Analytics() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [allCalls, setAllCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCall, setEditingCall] = useState<CallDetail | null>(null);
  const [viewingCall, setViewingCall] = useState<CallDetail | null>(null);
  const [deletingCallId, setDeletingCallId] = useState<string | null>(null);
  const [togglingPinId, setTogglingPinId] = useState<string | null>(null);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleDeleteCall = async (callId: string) => {
    setDeletingCallId(callId);
    const { error } = await supabase.from("calls").delete().eq("id", callId);
    if (error) {
      console.error("Error deleting call:", error);
    } else {
      setAllCalls((prev) => prev.filter((c) => c.id !== callId));
    }
    setDeletingCallId(null);
  };

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

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    const fetchCalls = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("calls")
          .select("id, phone_number, provider_name, caller_name, duration, cost_usd, status, started_at, ended_at, summary, notes, pinned, outcome")
          .in("status", ["ended", "transferred"])
          .order("started_at", { ascending: false });

        if (!error && data) {
          setAllCalls(data as CallRecord[]);
        }
      } catch (err) {
        console.error("Error fetching calls:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCalls();
  }, []);

  const dayDataMap = useMemo(() => {
    const map: Record<string, DayData> = {};
    for (const call of allCalls) {
      const dateStr = call.started_at
        ? new Date(call.started_at).toISOString().split("T")[0]
        : null;
      if (!dateStr) continue;
      const dur = call.duration ?? 0;
      const cost = call.cost_usd != null ? Number(call.cost_usd) : calcCost(dur);
      if (!map[dateStr]) {
        map[dateStr] = { date: dateStr, calls: 0, totalSeconds: 0, totalCost: 0 };
      }
      map[dateStr].calls += 1;
      map[dateStr].totalSeconds += dur;
      map[dateStr].totalCost += cost;
    }
    return map;
  }, [allCalls]);

  const monthSummary = useMemo(() => {
    let calls = 0;
    let totalSeconds = 0;
    let totalCost = 0;
    for (const [dateStr, data] of Object.entries(dayDataMap)) {
      const d = new Date(dateStr);
      if (d.getFullYear() === year && d.getMonth() === month) {
        calls += data.calls;
        totalSeconds += data.totalSeconds;
        totalCost += data.totalCost;
      }
    }
    return { calls, totalSeconds, totalCost };
  }, [dayDataMap, year, month]);

  const selectedDayCalls = useMemo(() => {
    if (!selectedDate) return [];
    return allCalls.filter((c) => {
      if (!c.started_at) return false;
      return new Date(c.started_at).toISOString().split("T")[0] === selectedDate;
    });
  }, [allCalls, selectedDate]);

  const pinnedCalls = useMemo(() => allCalls.filter((c) => c.pinned), [allCalls]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allCalls.filter((c) => {
      return (
        c.phone_number.toLowerCase().includes(q) ||
        (c.caller_name?.toLowerCase().includes(q)) ||
        (c.provider_name?.toLowerCase().includes(q)) ||
        (c.summary?.toLowerCase().includes(q)) ||
        (c.notes?.toLowerCase().includes(q)) ||
        (c.outcome?.toLowerCase().includes(q))
      );
    });
  }, [allCalls, searchQuery]);

  const providerDurationData = useMemo(() => {
    const map: Record<string, { totalSeconds: number; count: number }> = {};
    for (const call of allCalls) {
      const key = call.provider_name || "Unknown";
      const dur = call.duration ?? 0;
      if (!map[key]) map[key] = { totalSeconds: 0, count: 0 };
      map[key].totalSeconds += dur;
      map[key].count += 1;
    }
    return Object.entries(map)
      .map(([name, d]) => ({ name, avgSeconds: Math.round(d.totalSeconds / d.count), count: d.count }))
      .filter((d) => d.count >= 1)
      .sort((a, b) => b.avgSeconds - a.avgSeconds)
      .slice(0, 8);
  }, [allCalls]);

  const successStats = useMemo(() => {
    const withOutcome = allCalls.filter((c) => c.outcome !== null);
    const resolved = withOutcome.filter((c) => c.outcome === "resolved").length;
    const unresolved = withOutcome.filter((c) => c.outcome === "unresolved").length;
    const rate = withOutcome.length > 0 ? Math.round((resolved / withOutcome.length) * 100) : null;
    return { resolved, unresolved, withOutcome: withOutcome.length, rate };
  }, [allCalls]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = Array(firstDay).fill(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [year, month]);

  const todayStr = new Date().toISOString().split("T")[0];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const intensityClass = (calls: number) => {
    if (calls === 0) return "";
    if (calls === 1) return "bg-primary/20 border-primary/30";
    if (calls <= 3) return "bg-primary/40 border-primary/50";
    return "bg-primary/70 border-primary/80";
  };

  const maxAvgSeconds = providerDurationData.length > 0 ? providerDurationData[0].avgSeconds : 1;

  const displayedDayCalls = showPinnedOnly ? pinnedCalls : selectedDayCalls;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <BarChart2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-2xl font-bold">Call Analytics</h1>
              <p className="text-sm text-muted-foreground">Cost tracking at $30/hour</p>
            </div>
            <div className="flex-1 max-w-sm ml-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search calls..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSelectedDate(null); setShowPinnedOnly(false); }}
                  className="pl-8 pr-8 h-9 text-sm"
                />
                {searchQuery && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant={showPinnedOnly ? "default" : "outline"}
                size="sm"
                onClick={() => { setShowPinnedOnly((v) => !v); setSelectedDate(null); setSearchQuery(""); }}
              >
                <Star className={`w-4 h-4 mr-2 ${showPinnedOnly ? "fill-current" : ""}`} />
                Pinned {pinnedCalls.length > 0 && `(${pinnedCalls.length})`}
              </Button>
              <Link href="/reports">
                <Button variant="outline" size="sm">
                  <FileText className="w-4 h-4 mr-2" />
                  Reports
                </Button>
              </Link>
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

      <main className="container mx-auto px-6 py-8 max-w-6xl">
        {searchQuery.trim() && (
          <div className="mb-8">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  Search results
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {searchResults.length} {searchResults.length === 1 ? "call" : "calls"} matching &ldquo;{searchQuery.trim()}&rdquo;
                  </span>
                </h3>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              </div>
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No calls found matching your search.</p>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((call) => {
                    const dur = call.duration ?? 0;
                    const cost = call.cost_usd != null ? Number(call.cost_usd) : calcCost(dur);
                    return (
                      <div
                        key={call.id}
                        className="p-3 rounded-lg bg-muted/30 border border-border space-y-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setViewingCall(call as CallDetail)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5 min-w-0 flex-1 mr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium font-mono">{call.phone_number}</p>
                              <OutcomeBadge outcome={call.outcome} />
                              {call.pinned && <Star className="w-3 h-3 fill-amber-500 text-amber-500" />}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {call.started_at && (
                                <span>
                                  {new Date(call.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  {" · "}
                                  {new Date(call.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                </span>
                              )}
                              {call.provider_name && <span>&bull; {call.provider_name}</span>}
                              {call.caller_name && <span>&bull; {call.caller_name}</span>}
                            </div>
                            {call.summary && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{call.summary}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm shrink-0" onClick={(e) => e.stopPropagation()}>
                            <div className="text-right hidden sm:block">
                              <p className="text-xs text-muted-foreground">Duration</p>
                              <p className="font-mono font-medium">{formatDuration(dur)}</p>
                            </div>
                            <div className="text-right hidden sm:block">
                              <p className="text-xs text-muted-foreground">Cost</p>
                              <p className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{formatCost(cost)}</p>
                            </div>
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
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">{MONTHS[month]} {year}</h2>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={prevMonth}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={nextMonth}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS_OF_WEEK.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                  if (day === null) {
                    return <div key={`empty-${i}`} className="aspect-square" />;
                  }
                  const dateStr = getDateStr(day);
                  const data = dayDataMap[dateStr];
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate && !showPinnedOnly;

                  return (
                    <button
                      key={dateStr}
                      onClick={() => { setShowPinnedOnly(false); setSelectedDate(isSelected ? null : dateStr); }}
                      className={[
                        "aspect-square rounded-lg border text-sm flex flex-col items-center justify-center gap-0.5 transition-all hover:border-primary/60",
                        data ? intensityClass(data.calls) : "border-border/40 hover:bg-muted/30",
                        isToday && !isSelected ? "ring-2 ring-primary ring-offset-1" : "",
                        isSelected ? "ring-2 ring-primary ring-offset-2 bg-primary/20 border-primary" : "",
                      ].join(" ")}
                    >
                      <span className={`font-medium leading-none ${isToday ? "text-primary" : ""}`}>
                        {day}
                      </span>
                      {data && (
                        <span className="text-[9px] leading-none text-muted-foreground font-mono">
                          {data.calls}c
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-border flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-primary/20 border border-primary/30" />
                  <span>1 call</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-primary/40 border border-primary/50" />
                  <span>2–3 calls</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-primary/70 border border-primary/80" />
                  <span>4+ calls</span>
                </div>
              </div>
            </Card>

            {(showPinnedOnly || selectedDate) && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">
                  {showPinnedOnly
                    ? "Pinned Calls"
                    : new Date(selectedDate! + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "long", year: "numeric", month: "long", day: "numeric",
                      })}
                </h3>

                {displayedDayCalls.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {showPinnedOnly ? "No pinned calls yet. Pin a call by clicking the star icon." : "No completed calls on this day."}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {displayedDayCalls.map((call) => {
                      const dur = call.duration ?? 0;
                      const cost = call.cost_usd != null ? Number(call.cost_usd) : calcCost(dur);
                      return (
                        <div
                          key={call.id}
                          className="p-3 rounded-lg bg-muted/30 border border-border space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setViewingCall(call as CallDetail)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5 min-w-0 flex-1 mr-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium font-mono">{call.phone_number}</p>
                                <OutcomeBadge outcome={call.outcome} />
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {call.started_at && (
                                  <span>{new Date(call.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                                )}
                                {call.provider_name && <span>&bull; {call.provider_name}</span>}
                                {call.caller_name && <span>&bull; {call.caller_name}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm shrink-0" onClick={(e) => e.stopPropagation()}>
                              <div className="text-right hidden sm:block">
                                <p className="text-xs text-muted-foreground">Duration</p>
                                <p className="font-mono font-medium">{formatDuration(dur)}</p>
                              </div>
                              <div className="text-right hidden sm:block">
                                <p className="text-xs text-muted-foreground">Cost</p>
                                <p className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{formatCost(cost)}</p>
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
                              {!showPinnedOnly && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  disabled={deletingCallId === call.id}
                                  onClick={() => handleDeleteCall(call.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
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

                    {!showPinnedOnly && selectedDate && (() => {
                      const dayData = dayDataMap[selectedDate];
                      if (!dayData) return null;
                      return (
                        <div className="pt-3 mt-3 border-t border-border flex items-center justify-between text-sm">
                          <span className="text-muted-foreground font-medium">Day Total</span>
                          <div className="flex items-center gap-4">
                            <span className="font-mono">{formatDuration(dayData.totalSeconds)}</span>
                            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatCost(dayData.totalCost)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </Card>
            )}

            {providerDurationData.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Avg. Call Duration by Provider</h3>
                </div>
                <div className="space-y-3">
                  {providerDurationData.map((d) => {
                    const pct = maxAvgSeconds > 0 ? (d.avgSeconds / maxAvgSeconds) * 100 : 0;
                    return (
                      <div key={d.name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate max-w-[200px]">{d.name}</span>
                          <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                            <span className="text-xs">{d.count} {d.count === 1 ? "call" : "calls"}</span>
                            <span className="font-mono font-semibold text-foreground">{formatDuration(d.avgSeconds)}</span>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/70 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {MONTHS[month]} Summary
            </h2>

            <Card className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">Total Calls</p>
              </div>
              <p className="text-3xl font-bold">{monthSummary.calls}</p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-500" />
                </div>
                <p className="text-sm text-muted-foreground">Total Time</p>
              </div>
              <p className="text-3xl font-bold">{formatDuration(monthSummary.totalSeconds)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(monthSummary.totalSeconds / 60).toFixed(1)} minutes
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
                {formatCost(monthSummary.totalCost)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">vs. $30/hr live agent</p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-sky-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-sky-500" />
                </div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
              </div>
              {successStats.withOutcome === 0 ? (
                <p className="text-sm text-muted-foreground">No outcomes tracked yet. Edit a call to set resolved / unresolved.</p>
              ) : (
                <>
                  <p className="text-3xl font-bold">
                    {successStats.rate !== null ? `${successStats.rate}%` : "—"}
                  </p>
                  <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${successStats.rate ?? 0}%` }}
                    />
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
                      </span>
                      <span className="font-semibold">{successStats.resolved}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-red-500">
                        <XCircle className="w-3.5 h-3.5" /> Unresolved
                      </span>
                      <span className="font-semibold">{successStats.unresolved}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Total tracked</span>
                      <span className="font-semibold">{successStats.withOutcome}</span>
                    </div>
                  </div>
                </>
              )}
            </Card>

            <Card className="p-5 bg-muted/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-3">All-Time</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total calls</span>
                  <span className="font-semibold">{allCalls.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total minutes</span>
                  <span className="font-semibold font-mono">
                    {(allCalls.reduce((s, c) => s + (c.duration ?? 0), 0) / 60).toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total cost</span>
                  <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatCost(
                      allCalls.reduce((s, c) => {
                        const dur = c.duration ?? 0;
                        return s + (c.cost_usd != null ? Number(c.cost_usd) : calcCost(dur));
                      }, 0)
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Pinned calls</span>
                  <span className="font-semibold text-amber-500">{pinnedCalls.length}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>

      <CallDetailModal
        call={viewingCall}
        open={viewingCall !== null}
        onClose={() => setViewingCall(null)}
        onEdit={(call) => { setViewingCall(null); setEditingCall(call); }}
      />

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
