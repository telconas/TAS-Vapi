import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") || "";
const SENDGRID_FROM_EMAIL = Deno.env.get("SENDGRID_FROM_EMAIL") || "avb@telconassociates.com";
const NOTIFICATION_EMAIL = "jpm@telconassociates.com";

const COST_PER_MINUTE = 0.12;

interface NotificationPayload {
  event: "completed" | "failed" | "transferred";
  phoneNumber: string;
  providerName?: string;
  callerName?: string;
  duration?: number;
  summary?: string;
  costUsd?: number;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function getEventLabel(event: string): string {
  switch (event) {
    case "completed": return "Call Completed";
    case "failed": return "Scheduled Call Failed";
    case "transferred": return "Call Transferred";
    default: return "Call Event";
  }
}

function getEventColor(event: string): { bg: string; text: string; accent: string } {
  switch (event) {
    case "completed":
      return { bg: "#f0fdf4", text: "#15803d", accent: "#16a34a" };
    case "failed":
      return { bg: "#fef2f2", text: "#dc2626", accent: "#ef4444" };
    case "transferred":
      return { bg: "#eff6ff", text: "#1d4ed8", accent: "#2563eb" };
    default:
      return { bg: "#f8fafc", text: "#475569", accent: "#64748b" };
  }
}

function buildNotificationHtml(payload: NotificationPayload): string {
  const colors = getEventColor(payload.event);
  const label = getEventLabel(payload.event);
  const duration = payload.duration ?? 0;
  const cost = payload.costUsd ?? (duration / 60) * COST_PER_MINUTE;

  const detailRows: string[] = [];
  detailRows.push(`<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Phone</td><td style="padding:8px 12px;font-weight:600;font-size:13px;font-family:'SF Mono',monospace;">${payload.phoneNumber}</td></tr>`);
  if (payload.providerName) {
    detailRows.push(`<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Provider</td><td style="padding:8px 12px;font-weight:600;font-size:13px;">${payload.providerName}</td></tr>`);
  }
  if (payload.callerName) {
    detailRows.push(`<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Caller</td><td style="padding:8px 12px;font-weight:600;font-size:13px;">${payload.callerName}</td></tr>`);
  }
  if (duration > 0) {
    detailRows.push(`<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Duration</td><td style="padding:8px 12px;font-weight:600;font-size:13px;font-family:'SF Mono',monospace;">${formatDuration(duration)}</td></tr>`);
    detailRows.push(`<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Cost</td><td style="padding:8px 12px;font-weight:700;font-size:13px;color:#059669;font-family:'SF Mono',monospace;">${formatCost(cost)}</td></tr>`);
  }

  const summaryBlock = payload.summary
    ? `<div style="margin-top:20px;padding:16px;background:#f8fafc;border-left:3px solid #0891b2;border-radius:4px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:8px;">Summary</div>
        <div style="font-size:13px;color:#334155;line-height:1.6;">${payload.summary.replace(/\n/g, "<br/>")}</div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:linear-gradient(135deg,#023047 0%,#0891b2 100%);padding:24px 28px 18px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#7dd3e8;margin-bottom:6px;">TAS AI Agent</div>
            <div style="font-size:22px;font-weight:800;color:#fff;">${label}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px;">
            <div style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:${colors.bg};color:${colors.text};margin-bottom:16px;">${label.toUpperCase()}</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              ${detailRows.join("")}
            </table>
            ${summaryBlock}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #f1f5f9;text-align:center;">
            <div style="font-size:11px;color:#94a3b8;">Automated notification from TAS AI Agent</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!SENDGRID_API_KEY) {
      return new Response(JSON.stringify({ error: "SendGrid not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: NotificationPayload = await req.json();

    if (!payload.event || !payload.phoneNumber) {
      return new Response(JSON.stringify({ error: "event and phoneNumber required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const label = getEventLabel(payload.event);
    const subject = `${label}: ${payload.phoneNumber}${payload.providerName ? ` (${payload.providerName})` : ""}`;
    const html = buildNotificationHtml(payload);

    const sgResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: NOTIFICATION_EMAIL }] }],
        from: { email: SENDGRID_FROM_EMAIL },
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });

    if (!sgResponse.ok) {
      const errText = await sgResponse.text();
      console.error("[NOTIFICATION] SendGrid error:", errText);
      return new Response(JSON.stringify({ error: "Failed to send notification", details: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[NOTIFICATION] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
