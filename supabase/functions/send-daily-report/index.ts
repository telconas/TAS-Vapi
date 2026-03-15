import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const HOURLY_RATE = 30;
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") || "";
const SENDGRID_FROM_EMAIL = Deno.env.get("SENDGRID_FROM_EMAIL") || "avb@telconassociates.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

function buildCsvAttachment(calls: any[]): string {
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const rows: string[][] = [
    ["Date", "Time", "Phone Number", "Provider", "Caller", "Duration (s)", "Duration", "Cost", "Outcome", "Summary", "Notes"],
  ];
  for (const c of calls) {
    const dur = c.duration ?? 0;
    const cost = c.cost_usd != null ? Number(c.cost_usd) : calcCost(dur);
    const dt = c.started_at ? new Date(c.started_at) : null;
    rows.push([
      dt ? dt.toLocaleDateString("en-US") : "",
      dt ? dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "",
      c.phone_number,
      c.provider_name || "",
      c.caller_name || "",
      String(dur),
      formatDuration(dur),
      formatCost(cost),
      c.outcome || "",
      c.summary || "",
      c.notes || "",
    ]);
  }
  const csv = rows.map((r) => r.map(escape).join(",")).join("\r\n");
  return btoa(unescape(encodeURIComponent(csv)));
}

function buildHtmlAttachment(calls: any[], periodLabel: string, reportType: string, totals: { calls: number; totalSeconds: number; totalCost: number }): string {
  const avgSeconds = totals.calls > 0 ? Math.round(totals.totalSeconds / totals.calls) : 0;

  const resolvedCount = calls.filter((c) => c.outcome === "resolved").length;
  const unresolvedCount = calls.filter((c) => c.outcome === "unresolved").length;
  const resolutionRate = totals.calls > 0 ? Math.round((resolvedCount / totals.calls) * 100) : 0;

  const providerMap: Record<string, { calls: number; seconds: number; cost: number }> = {};
  for (const c of calls) {
    const key = c.provider_name || "Unknown";
    const dur = c.duration ?? 0;
    const cost = c.cost_usd != null ? Number(c.cost_usd) : calcCost(dur);
    if (!providerMap[key]) providerMap[key] = { calls: 0, seconds: 0, cost: 0 };
    providerMap[key].calls += 1;
    providerMap[key].seconds += dur;
    providerMap[key].cost += cost;
  }
  const providers = Object.entries(providerMap).sort((a, b) => b[1].calls - a[1].calls);

  const providerRows = providers.map(([name, stats]) => `
    <tr>
      <td>${name}</td>
      <td>${stats.calls}</td>
      <td>${formatDuration(stats.seconds)}</td>
      <td>${formatCost(stats.cost)}</td>
    </tr>
  `).join("");

  const callRows = calls.map((call, i) => {
    const dur = call.duration ?? 0;
    const cost = call.cost_usd != null ? Number(call.cost_usd) : calcCost(dur);
    const dt = call.started_at ? new Date(call.started_at) : call.created_at ? new Date(call.created_at) : null;
    const dateStr = dt ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
    const timeStr = dt ? dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "—";
    const outcomeClass = call.outcome === "resolved" ? "badge-resolved" : call.outcome === "unresolved" ? "badge-unresolved" : "badge-none";
    const outcomeLabel = call.outcome === "resolved" ? "Resolved" : call.outcome === "unresolved" ? "Unresolved" : "—";
    const rowClass = i % 2 === 0 ? "row-even" : "row-odd";
    const summaryText = call.summary ? call.summary.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
    const notesText = call.notes ? call.notes.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";

    return `
      <tr class="${rowClass}">
        <td>${dateStr}</td>
        <td>${timeStr}</td>
        <td class="mono">${call.phone_number}</td>
        <td>${call.provider_name || "—"}</td>
        <td>${call.caller_name || "—"}</td>
        <td class="mono">${formatDuration(dur)}</td>
        <td class="mono cost">${formatCost(cost)}</td>
        <td><span class="badge ${outcomeClass}">${outcomeLabel}</span></td>
        <td class="summary-cell">${summaryText}</td>
        <td class="notes-cell">${notesText}</td>
      </tr>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TAS Call Report — ${periodLabel}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f0f4f8;
      color: #1e293b;
      min-height: 100vh;
      padding: 32px 16px;
    }

    .page { max-width: 1200px; margin: 0 auto; }

    /* Header */
    .report-header {
      background: linear-gradient(135deg, #023047 0%, #0e7490 60%, #0891b2 100%);
      border-radius: 16px 16px 0 0;
      padding: 36px 40px 28px;
      color: #fff;
      position: relative;
      overflow: hidden;
    }
    .report-header::before {
      content: "";
      position: absolute;
      top: -60px; right: -60px;
      width: 240px; height: 240px;
      border-radius: 50%;
      background: rgba(255,255,255,0.05);
    }
    .report-header::after {
      content: "";
      position: absolute;
      bottom: -40px; left: 40%;
      width: 160px; height: 160px;
      border-radius: 50%;
      background: rgba(255,255,255,0.04);
    }
    .header-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #7dd3e8;
      margin-bottom: 10px;
    }
    .header-title {
      font-size: 32px;
      font-weight: 800;
      line-height: 1.15;
      margin-bottom: 8px;
    }
    .header-period {
      font-size: 16px;
      color: #bae6fd;
      font-weight: 500;
    }
    .header-meta {
      font-size: 12px;
      color: #7dd3e8;
      margin-top: 6px;
    }

    /* Stats grid */
    .stats-section {
      background: #fff;
      padding: 28px 40px;
      border-left: 1px solid #e2e8f0;
      border-right: 1px solid #e2e8f0;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
    }
    .stat-card {
      border-radius: 12px;
      padding: 18px 20px;
      text-align: center;
      border: 1px solid transparent;
    }
    .stat-card.blue { background: #eff6ff; border-color: #bfdbfe; }
    .stat-card.green { background: #f0fdf4; border-color: #bbf7d0; }
    .stat-card.amber { background: #fffbeb; border-color: #fde68a; }
    .stat-card.sky { background: #f0f9ff; border-color: #bae6fd; }
    .stat-card.rose { background: #fff1f2; border-color: #fecdd3; }
    .stat-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .stat-card.blue .stat-label { color: #1d4ed8; }
    .stat-card.green .stat-label { color: #15803d; }
    .stat-card.amber .stat-label { color: #92400e; }
    .stat-card.sky .stat-label { color: #0369a1; }
    .stat-card.rose .stat-label { color: #be123c; }
    .stat-value {
      font-size: 28px;
      font-weight: 800;
      line-height: 1;
    }
    .stat-card.blue .stat-value { color: #1e3a8a; }
    .stat-card.green .stat-value { color: #14532d; }
    .stat-card.amber .stat-value { color: #78350f; }
    .stat-card.sky .stat-value { color: #0c4a6e; }
    .stat-card.rose .stat-value { color: #881337; }
    .stat-sub {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }

    /* Provider breakdown */
    .section {
      background: #fff;
      border-left: 1px solid #e2e8f0;
      border-right: 1px solid #e2e8f0;
      padding: 28px 40px;
    }
    .section + .section { border-top: 1px solid #f1f5f9; }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64748b;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title::after {
      content: "";
      flex: 1;
      height: 1px;
      background: #e2e8f0;
    }

    /* Provider table */
    .provider-table, .calls-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .provider-table th, .calls-table th {
      padding: 10px 14px;
      text-align: left;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #94a3b8;
      background: #f8fafc;
      border-bottom: 2px solid #e2e8f0;
    }
    .provider-table td {
      padding: 12px 14px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
    }
    .provider-table tr:last-child td { border-bottom: none; }
    .provider-table tr:hover td { background: #f8fafc; }

    /* Calls table */
    .table-wrap {
      overflow-x: auto;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
    }
    .calls-table td {
      padding: 11px 14px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
      vertical-align: top;
    }
    .row-even td { background: #fff; }
    .row-odd td { background: #f8fafc; }
    .calls-table tr:hover td { background: #eff6ff; }
    .calls-table tr:last-child td { border-bottom: none; }

    .mono { font-family: "SF Mono", "Fira Code", "Courier New", monospace; font-size: 12px; }
    .cost { color: #059669; font-weight: 600; }

    .badge {
      display: inline-block;
      padding: 2px 9px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .badge-resolved { background: #dcfce7; color: #15803d; }
    .badge-unresolved { background: #fee2e2; color: #dc2626; }
    .badge-none { background: #f1f5f9; color: #94a3b8; }

    .summary-cell {
      font-size: 12px;
      color: #475569;
      max-width: 280px;
      line-height: 1.5;
    }
    .notes-cell {
      font-size: 12px;
      color: #64748b;
      max-width: 200px;
      font-style: italic;
    }

    /* Footer */
    .report-footer {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-top: none;
      border-radius: 0 0 16px 16px;
      padding: 20px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    .footer-brand { font-size: 13px; font-weight: 700; color: #334155; }
    .footer-note { font-size: 12px; color: #94a3b8; }

    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: #94a3b8;
      font-size: 14px;
    }

    @media (max-width: 640px) {
      body { padding: 12px 8px; }
      .report-header, .stats-section, .section, .report-footer { padding-left: 20px; padding-right: 20px; }
      .header-title { font-size: 22px; }
    }
  </style>
</head>
<body>
<div class="page">

  <div class="report-header">
    <div class="header-label">TAS AI Agent &bull; ${reportType} Report</div>
    <div class="header-title">Call Analytics Report</div>
    <div class="header-period">${periodLabel}</div>
    <div class="header-meta">Generated ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} &bull; $${HOURLY_RATE}/hr vs. live agent</div>
  </div>

  <div class="stats-section">
    <div class="stats-grid">
      <div class="stat-card blue">
        <div class="stat-label">Total Calls</div>
        <div class="stat-value">${totals.calls}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Total Time</div>
        <div class="stat-value" style="font-size:22px;">${formatDuration(totals.totalSeconds)}</div>
        <div class="stat-sub">${(totals.totalSeconds / 60).toFixed(1)} min</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Cost Saved</div>
        <div class="stat-value" style="font-size:22px;">${formatCost(totals.totalCost)}</div>
        <div class="stat-sub">vs. live agent</div>
      </div>
      <div class="stat-card amber">
        <div class="stat-label">Avg Duration</div>
        <div class="stat-value" style="font-size:20px;">${formatDuration(avgSeconds)}</div>
      </div>
      <div class="stat-card sky">
        <div class="stat-label">Resolved</div>
        <div class="stat-value">${resolvedCount}</div>
        <div class="stat-sub">${resolutionRate}% rate</div>
      </div>
      <div class="stat-card rose">
        <div class="stat-label">Unresolved</div>
        <div class="stat-value">${unresolvedCount}</div>
      </div>
    </div>
  </div>

  ${providers.length > 0 ? `
  <div class="section">
    <div class="section-title">Breakdown by Carrier / Provider</div>
    <div class="table-wrap">
      <table class="provider-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Calls</th>
            <th>Total Time</th>
            <th>Cost Saved</th>
          </tr>
        </thead>
        <tbody>
          ${providerRows}
        </tbody>
      </table>
    </div>
  </div>
  ` : ""}

  <div class="section">
    <div class="section-title">All Calls — ${totals.calls} record${totals.calls !== 1 ? "s" : ""}</div>
    ${calls.length === 0 ? `<div class="empty-state">No completed calls for this period.</div>` : `
    <div class="table-wrap">
      <table class="calls-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Phone</th>
            <th>Provider</th>
            <th>Caller</th>
            <th>Duration</th>
            <th>Cost</th>
            <th>Outcome</th>
            <th>Summary</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${callRows}
        </tbody>
      </table>
    </div>
    `}
  </div>

  <div class="report-footer">
    <span class="footer-brand">TAS AI Agent</span>
    <span class="footer-note">Automated ${reportType.toLowerCase()} report &bull; ${periodLabel}</span>
  </div>

</div>
</body>
</html>`;
}

function buildEmailText(periodLabel: string, reportType: string, totals: { calls: number; totalSeconds: number; totalCost: number }, resolvedCount: number, unresolvedCount: number): string {
  const avgSeconds = totals.calls > 0 ? Math.round(totals.totalSeconds / totals.calls) : 0;
  const resolutionRate = totals.calls > 0 ? Math.round((resolvedCount / totals.calls) * 100) : 0;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

        <tr>
          <td style="background:linear-gradient(135deg,#023047 0%,#0891b2 100%);padding:32px 36px 24px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#7dd3e8;margin-bottom:8px;">TAS AI Agent &bull; ${reportType} Report</div>
            <div style="font-size:26px;font-weight:800;color:#fff;margin-bottom:6px;">Call Analytics Report</div>
            <div style="font-size:15px;color:#bae6fd;">${periodLabel}</div>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="50%" style="padding:0 8px 16px 0;">
                  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;text-align:center;">
                    <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1d4ed8;margin-bottom:6px;">Total Calls</div>
                    <div style="font-size:30px;font-weight:800;color:#1e3a8a;">${totals.calls}</div>
                  </div>
                </td>
                <td width="50%" style="padding:0 0 16px 8px;">
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;text-align:center;">
                    <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#15803d;margin-bottom:6px;">Cost Saved</div>
                    <div style="font-size:26px;font-weight:800;color:#14532d;">${formatCost(totals.totalCost)}</div>
                    <div style="font-size:11px;color:#4ade80;margin-top:3px;">vs. $${HOURLY_RATE}/hr live agent</div>
                  </div>
                </td>
              </tr>
              <tr>
                <td width="50%" style="padding:0 8px 0 0;">
                  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;text-align:center;">
                    <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#92400e;margin-bottom:6px;">Total Time</div>
                    <div style="font-size:22px;font-weight:800;color:#78350f;">${formatDuration(totals.totalSeconds)}</div>
                    <div style="font-size:11px;color:#d97706;margin-top:3px;">avg ${formatDuration(avgSeconds)} / call</div>
                  </div>
                </td>
                <td width="50%" style="padding:0 0 0 8px;">
                  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;text-align:center;">
                    <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#0369a1;margin-bottom:6px;">Resolution Rate</div>
                    <div style="font-size:26px;font-weight:800;color:#0c4a6e;">${resolutionRate}%</div>
                    <div style="font-size:11px;color:#38bdf8;margin-top:3px;">${resolvedCount} resolved &bull; ${unresolvedCount} unresolved</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 28px;">
            <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;border:1px solid #e2e8f0;">
              <div style="font-size:12px;color:#475569;line-height:1.7;">
                <strong style="color:#0f172a;">Attachments included:</strong><br/>
                &bull; <strong>CSV file</strong> — open in Excel or Google Sheets for data analysis<br/>
                &bull; <strong>HTML file</strong> — open in your browser for a full interactive report
              </div>
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 36px 28px;text-align:center;border-top:1px solid #f1f5f9;">
            <div style="font-size:12px;color:#94a3b8;">Generated by <strong style="color:#475569;">TAS AI Agent</strong> &bull; Automated ${reportType.toLowerCase()} report</div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function getDateRange(reportType: string, dateStr: string): { start: Date; end: Date; periodLabel: string } {
  if (reportType === "weekly") {
    const ref = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? new Date(dateStr + "T00:00:00")
      : new Date();
    const day = ref.getDay();
    const start = new Date(ref);
    start.setDate(ref.getDate() - day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return { start, end, periodLabel: `${fmt(start)} – ${fmt(end)}` };
  }

  if (reportType === "monthly") {
    const ref = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? new Date(dateStr + "T00:00:00")
      : new Date();
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
    const periodLabel = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    return { start, end, periodLabel };
  }

  const ref = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? (() => { const [y, m, d] = dateStr.split("-").map(Number); return new Date(y, m - 1, d); })()
    : new Date();
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
  const periodLabel = ref.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return { start, end, periodLabel };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { toEmail, date, reportType = "daily" } = body;

    if (!toEmail) {
      return new Response(JSON.stringify({ error: "toEmail is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!SENDGRID_API_KEY) {
      return new Response(JSON.stringify({ error: "SendGrid not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabase();
    const { start, end, periodLabel } = getDateRange(reportType, date || "");
    const reportTypeLabel = reportType === "weekly" ? "Weekly" : reportType === "monthly" ? "Monthly" : "Daily";

    const { data: calls, error } = await supabase
      .from("calls")
      .select("id, phone_number, provider_name, caller_name, duration, cost_usd, status, started_at, ended_at, summary, notes, outcome")
      .in("status", ["ended", "transferred"])
      .gte("started_at", start.toISOString())
      .lte("started_at", end.toISOString())
      .order("started_at", { ascending: true });

    if (error) {
      return new Response(JSON.stringify({ error: "Failed to fetch calls" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callList = calls || [];

    const totals = callList.reduce(
      (acc: { calls: number; totalSeconds: number; totalCost: number }, c: any) => {
        const dur = c.duration ?? 0;
        const cost = c.cost_usd != null ? Number(c.cost_usd) : calcCost(dur);
        acc.calls += 1;
        acc.totalSeconds += dur;
        acc.totalCost += cost;
        return acc;
      },
      { calls: 0, totalSeconds: 0, totalCost: 0 }
    );

    const resolvedCount = callList.filter((c: any) => c.outcome === "resolved").length;
    const unresolvedCount = callList.filter((c: any) => c.outcome === "unresolved").length;

    const emailHtmlBody = buildEmailText(periodLabel, reportTypeLabel, totals, resolvedCount, unresolvedCount);
    const csvBase64 = buildCsvAttachment(callList);
    const htmlAttachment = buildHtmlAttachment(callList, periodLabel, reportTypeLabel, totals);
    const htmlBase64 = btoa(unescape(encodeURIComponent(htmlAttachment)));

    const fileSlug = periodLabel.replace(/[^a-z0-9]/gi, "-").toLowerCase().replace(/-+/g, "-");
    const csvFilename = `tas-calls-${fileSlug}.csv`;
    const htmlFilename = `tas-report-${fileSlug}.html`;

    const subject = `TAS ${reportTypeLabel} Call Report — ${periodLabel} (${totals.calls} call${totals.calls !== 1 ? "s" : ""})`;

    const sgResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: SENDGRID_FROM_EMAIL },
        subject,
        content: [{ type: "text/html", value: emailHtmlBody }],
        attachments: [
          {
            content: csvBase64,
            filename: csvFilename,
            type: "text/csv",
            disposition: "attachment",
          },
          {
            content: htmlBase64,
            filename: htmlFilename,
            type: "text/html",
            disposition: "attachment",
          },
        ],
      }),
    });

    if (!sgResponse.ok) {
      const errText = await sgResponse.text();
      return new Response(JSON.stringify({ error: "Failed to send email", details: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, callCount: totals.calls, periodLabel }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
