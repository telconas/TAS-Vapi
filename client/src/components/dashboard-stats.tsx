import { useState, useEffect } from "react";
import { Phone, Clock, DollarSign, CircleCheck as CheckCircle2, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";

const COST_PER_MINUTE = 0.12;

interface TodayStats {
  callsToday: number;
  totalSecondsToday: number;
  costToday: number;
  resolved: number;
  unresolved: number;
  loading: boolean;
}

function calcCost(seconds: number): number {
  return (seconds / 60) * COST_PER_MINUTE;
}

function getCallCost(c: { duration: number | null; cost_usd: number | null; vapi_cost_usd: number | null; status: string }): number {
  const dur = c.duration ?? 0;
  if (c.status === "transferred" && c.vapi_cost_usd != null) return Number(c.vapi_cost_usd);
  return c.cost_usd != null ? Number(c.cost_usd) : calcCost(dur);
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function DashboardStats({ refreshTrigger }: { refreshTrigger?: number }) {
  const [stats, setStats] = useState<TodayStats>({
    callsToday: 0,
    totalSecondsToday: 0,
    costToday: 0,
    resolved: 0,
    unresolved: 0,
    loading: true,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

      const { data, error } = await supabase
        .from("calls")
        .select("duration, cost_usd, vapi_cost_usd, status, outcome")
        .in("status", ["ended", "transferred"])
        .gte("started_at", startOfDay.toISOString());

      if (error || !data) {
        setStats((s) => ({ ...s, loading: false }));
        return;
      }

      const callsToday = data.length;
      let totalSecondsToday = 0;
      let costToday = 0;
      let resolved = 0;
      let unresolved = 0;

      for (const c of data) {
        totalSecondsToday += c.duration ?? 0;
        costToday += getCallCost(c as any);
        if (c.outcome === "resolved") resolved++;
        if (c.outcome === "unresolved") unresolved++;
      }

      setStats({ callsToday, totalSecondsToday, costToday, resolved, unresolved, loading: false });
    };

    fetchStats();
  }, [refreshTrigger]);

  if (stats.loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[72px] rounded-xl bg-muted/50 border border-border" />
        ))}
      </div>
    );
  }

  const successRate =
    stats.resolved + stats.unresolved > 0
      ? Math.round((stats.resolved / (stats.resolved + stats.unresolved)) * 100)
      : null;

  const items = [
    {
      label: "Calls Today",
      value: String(stats.callsToday),
      icon: Phone,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      label: "Time Today",
      value: stats.totalSecondsToday > 0 ? formatDuration(stats.totalSecondsToday) : "0s",
      icon: Clock,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
    },
    {
      label: "Cost Today",
      value: `$${stats.costToday.toFixed(2)}`,
      icon: DollarSign,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
      valueColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Success Rate",
      value: successRate !== null ? `${successRate}%` : "--",
      sub: successRate !== null ? `${stats.resolved}/${stats.resolved + stats.unresolved}` : undefined,
      icon: successRate !== null && successRate >= 50 ? TrendingUp : CheckCircle2,
      iconBg: "bg-sky-500/10",
      iconColor: "text-sky-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border transition-colors hover:bg-muted/30"
        >
          <div className={`w-9 h-9 rounded-lg ${item.iconBg} flex items-center justify-center shrink-0`}>
            <item.icon className={`w-4.5 h-4.5 ${item.iconColor}`} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide leading-none mb-1">
              {item.label}
            </p>
            <p className={`text-lg font-bold font-mono leading-none tabular-nums ${item.valueColor || ""}`}>
              {item.value}
            </p>
            {item.sub && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
