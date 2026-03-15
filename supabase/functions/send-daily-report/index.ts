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

function buildDailyReportHtml(calls: any[], date: string, totals: { calls: number; totalSeconds: number; totalCost: number }): string {
  const avgSeconds = totals.calls > 0 ? Math.round(totals.totalSeconds / totals.calls) : 0;

  const callRows = calls.map((call, i) => {
    const dur = call.duration ?? 0;
    const cost = call.cost_usd != null ? Number(call.cost_usd) : calcCost(dur);
    const dt = call.started_at ? new Date(call.started_at) : call.created_at ? new Date(call.created_at) : null;
    const timeStr = dt ? dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "—";
    const outcomeColor = call.outcome === "resolved" ? "#059669" : call.outcome === "unresolved" ? "#dc2626" : "#6b7280";
    const outcomeLabel = call.outcome === "resolved" ? "Resolved" : call.outcome === "unresolved" ? "Unresolved" : "—";
    const summaryText = call.summary ? call.summary.replace(/\n/g, " ").substring(0, 200) + (call.summary.length > 200 ? "..." : "") : "";
    const rowBg = i % 2 === 0 ? "#ffffff" : "#f8fafc";

    return `
      <tr style="background-color:${rowBg};">
        <td style="padding:10px 14px; font-size:13px; color:#374151; border-bottom:1px solid #e5e7eb;">${timeStr}</td>
        <td style="padding:10px 14px; font-size:13px; color:#111827; font-weight:500; font-family:monospace; border-bottom:1px solid #e5e7eb;">${call.phone_number}</td>
        <td style="padding:10px 14px; font-size:13px; color:#374151; border-bottom:1px solid #e5e7eb;">${call.provider_name || "—"}</td>
        <td style="padding:10px 14px; font-size:13px; color:#374151; border-bottom:1px solid #e5e7eb;">${call.caller_name || "—"}</td>
        <td style="padding:10px 14px; font-size:13px; color:#374151; font-family:monospace; border-bottom:1px solid #e5e7eb;">${formatDuration(dur)}</td>
        <td style="padding:10px 14px; font-size:13px; color:#059669; font-weight:600; font-family:monospace; border-bottom:1px solid #e5e7eb;">${formatCost(cost)}</td>
        <td style="padding:10px 14px; font-size:12px; color:${outcomeColor}; font-weight:600; border-bottom:1px solid #e5e7eb;">${outcomeLabel}</td>
        <td style="padding:10px 14px; font-size:12px; color:#6b7280; border-bottom:1px solid #e5e7eb; max-width:220px;">${summaryText}</td>
      </tr>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TAS Daily Call Report</title>
</head>
<body style="margin:0; padding:0; background-color:#eef3f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef3f8; margin:0; padding:0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:900px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 6px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #023047 0%, #219ebc 100%); padding:28px 32px 22px 32px;">
              <div style="font-size:12px; line-height:12px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; color:#bfeaf3; margin-bottom:10px;">
                TAS AI Agent
              </div>
              <div style="font-size:28px; line-height:34px; font-weight:bold; color:#ffffff; margin:0;">
                Daily Call Report
              </div>
              <div style="font-size:15px; line-height:22px; color:#d8f3f8; margin-top:8px;">
                ${date}
              </div>
            </td>
          </tr>

          <!-- Summary Stats -->
          <tr>
            <td style="padding:24px 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td valign="top" width="25%" style="padding:0 8px 16px 0;">
                    <div style="background-color:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:16px; text-align:center;">
                      <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#0369a1; font-weight:bold; margin-bottom:6px;">Total Calls</div>
                      <div style="font-size:28px; font-weight:bold; color:#0c4a6e;">${totals.calls}</div>
                    </div>
                  </td>
                  <td valign="top" width="25%" style="padding:0 8px 16px 8px;">
                    <div style="background-color:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; text-align:center;">
                      <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#15803d; font-weight:bold; margin-bottom:6px;">Total Time</div>
                      <div style="font-size:22px; font-weight:bold; color:#14532d;">${formatDuration(totals.totalSeconds)}</div>
                    </div>
                  </td>
                  <td valign="top" width="25%" style="padding:0 8px 16px 8px;">
                    <div style="background-color:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; text-align:center;">
                      <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#15803d; font-weight:bold; margin-bottom:6px;">Cost Saved</div>
                      <div style="font-size:22px; font-weight:bold; color:#14532d;">${formatCost(totals.totalCost)}</div>
                    </div>
                  </td>
                  <td valign="top" width="25%" style="padding:0 0 16px 8px;">
                    <div style="background-color:#fefce8; border:1px solid #fde68a; border-radius:12px; padding:16px; text-align:center;">
                      <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#92400e; font-weight:bold; margin-bottom:6px;">Avg Duration</div>
                      <div style="font-size:22px; font-weight:bold; color:#78350f;">${formatDuration(avgSeconds)}</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Calls Table -->
          <tr>
            <td style="padding:8px 32px 32px 32px;">
              <div style="font-size:16px; font-weight:bold; color:#111827; margin-bottom:12px;">All Calls — ${date}</div>
              ${calls.length === 0 ? `
                <div style="text-align:center; padding:32px; color:#6b7280; font-style:italic;">No completed calls for today.</div>
              ` : `
              <div style="overflow-x:auto; border-radius:10px; border:1px solid #e5e7eb;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                  <thead>
                    <tr style="background-color:#f1f5f9;">
                      <th style="padding:10px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; font-weight:700; border-bottom:2px solid #e2e8f0;">Time</th>
                      <th style="padding:10px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; font-weight:700; border-bottom:2px solid #e2e8f0;">Phone</th>
                      <th style="padding:10px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; font-weight:700; border-bottom:2px solid #e2e8f0;">Provider</th>
                      <th style="padding:10px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; font-weight:700; border-bottom:2px solid #e2e8f0;">Caller</th>
                      <th style="padding:10px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; font-weight:700; border-bottom:2px solid #e2e8f0;">Duration</th>
                      <th style="padding:10px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; font-weight:700; border-bottom:2px solid #e2e8f0;">Cost</th>
                      <th style="padding:10px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; font-weight:700; border-bottom:2px solid #e2e8f0;">Outcome</th>
                      <th style="padding:10px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; font-weight:700; border-bottom:2px solid #e2e8f0;">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${callRows}
                  </tbody>
                </table>
              </div>
              `}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px; background-color:#e5e7eb; line-height:1px; font-size:1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 32px 28px 32px; text-align:center;">
              <div style="font-size:13px; line-height:20px; color:#6b7280;">
                Generated by <strong style="color:#374151;">TAS AI Agent</strong> &mdash; at $${HOURLY_RATE}/hr
              </div>
              <div style="font-size:12px; line-height:18px; color:#9ca3af; margin-top:4px;">
                This is an automated daily call report.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { toEmail } = body;

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

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

    const { data: calls, error } = await supabase
      .from("calls")
      .select("id, phone_number, provider_name, caller_name, duration, cost_usd, status, started_at, ended_at, created_at, summary, notes, outcome")
      .in("status", ["ended", "transferred"])
      .gte("created_at", startOfDay)
      .lte("created_at", endOfDay)
      .order("created_at", { ascending: true });

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

    const dateLabel = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const htmlBody = buildDailyReportHtml(callList, dateLabel, totals);

    const sgResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: SENDGRID_FROM_EMAIL },
        subject: `TAS Daily Call Report — ${dateLabel} (${totals.calls} call${totals.calls !== 1 ? "s" : ""})`,
        content: [{ type: "text/html", value: htmlBody }],
      }),
    });

    if (!sgResponse.ok) {
      const errText = await sgResponse.text();
      return new Response(JSON.stringify({ error: "Failed to send email", details: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, callCount: totals.calls }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
