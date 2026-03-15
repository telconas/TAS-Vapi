import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase, EDGE_FUNCTIONS_URL } from "@/lib/supabase";
import { Phone, Clock, DollarSign, ChevronLeft, ChevronRight, ArrowLeft, ChartBar as BarChart2, FileText } from "lucide-react";

const HOURLY_RATE = 35;

interface DayData {
  date: string;
  calls: number;
  totalSeconds: number;
  totalCost: number;
}

interface CallRecord {
  id: string;
  phone_number: string;
  duration: number | null;
  cost_usd: number | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  summary: string | null;
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

export default function Analytics() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [allCalls, setAllCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    const fetchCalls = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("calls")
          .select("id, phone_number, duration, cost_usd, status, started_at, ended_at, summary")
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <BarChart2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Call Analytics</h1>
              <p className="text-sm text-muted-foreground">Cost tracking at $35/hour</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
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
                  const isSelected = dateStr === selectedDate;

                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
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

            {selectedDate && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "long", year: "numeric", month: "long", day: "numeric",
                  })}
                </h3>

                {selectedDayCalls.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No completed calls on this day.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedDayCalls.map((call) => {
                      const dur = call.duration ?? 0;
                      const cost = call.cost_usd != null ? Number(call.cost_usd) : calcCost(dur);
                      return (
                        <div key={call.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium font-mono">{call.phone_number}</p>
                            {call.started_at && (
                              <p className="text-xs text-muted-foreground">
                                {new Date(call.started_at).toLocaleTimeString("en-US", {
                                  hour: "numeric", minute: "2-digit",
                                })}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Duration</p>
                              <p className="font-mono font-medium">{formatDuration(dur)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Cost</p>
                              <p className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{formatCost(cost)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {(() => {
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
              <p className="text-xs text-muted-foreground mt-1">vs. $35/hr live agent</p>
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
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
