import sgMail from "@sendgrid/mail";

// Get SendGrid client with fresh API key each time (no caching)
async function getUncachableSendGridClient() {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail =
    process.env.SENDGRID_FROM_EMAIL || "avb@telconassociates.com";

  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY environment variable is not set");
  }

  sgMail.setApiKey(apiKey);
  return { client: sgMail, fromEmail };
}

// Helper function to send call summary email
export async function sendCallSummaryEmail(
  toEmail: string,
  phoneNumber: string,
  summary: string,
  duration: number,
  recordingUrl?: string,
) {
  try {
    // DEBUG: Log what we received
    console.error("[EMAIL DEBUG] recordingUrl received:", recordingUrl);
    console.error("[EMAIL DEBUG] recordingUrl type:", typeof recordingUrl);
    console.error("[EMAIL DEBUG] recordingUrl truthiness:", !!recordingUrl);

    const { client, fromEmail } = await getUncachableSendGridClient();

    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    };

    // Split summary into sentences for bullet points
    const formatSummaryAsBullets = (text: string) => {
      if (!text || text.trim().length === 0) {
        return [];
      }

      // First check if the text already has natural line breaks (likely from AI formatting)
      if (text.includes("\n")) {
        return text
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }

      // Common abbreviations to avoid splitting on
      const abbreviations = [
        "Mr",
        "Mrs",
        "Ms",
        "Dr",
        "Prof",
        "Sr",
        "Jr",
        "St",
        "Ave",
        "Blvd",
        "Rd",
        "Inc",
        "Ltd",
        "Co",
        "Corp",
        "etc",
        "vs",
        "e.g",
        "i.e",
        "U.S",
        "U.K",
        "p.m",
        "a.m",
        "Ph.D",
        "M.D",
      ];

      // Protect abbreviations by replacing them temporarily
      let protectedText = text;
      abbreviations.forEach((abbr) => {
        const regex = new RegExp(`\\b${abbr.replace(/\./g, "\\.")}\\.`, "gi");
        protectedText = protectedText.replace(regex, `${abbr}<!PERIOD!>`);
      });

      // Also protect single-letter abbreviations (like initials: A.B.C.)
      protectedText = protectedText.replace(/\b([A-Z])\./g, "$1<!PERIOD!>");

      // Split on sentence-ending punctuation [.!?] followed by space and capital letter, or end of string
      const sentences = protectedText
        .replace(/([.!?])\s+(?=[A-Z])/g, "$1|SPLIT|")
        .replace(/([.!?])$/g, "$1|SPLIT|")
        .split("|SPLIT|")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => s.replace(/<!PERIOD!>/g, ".")); // Restore periods

      return sentences;
    };

    const sentences = formatSummaryAsBullets(summary);
    const bulletListHtml = sentences.map((s) => `<li>${s}</li>`).join("");
    const bulletListText = sentences.map((s) => `• ${s}`).join("\n");

    // More robust check for recording URL
    const hasRecording = recordingUrl && recordingUrl.trim().length > 0;
    console.error("[EMAIL DEBUG] hasRecording:", hasRecording);

    const emailHtml = `
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TAS Call Summary</title>
</head>
<body style="margin:0; padding:0; background-color:#eef3f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef3f8; margin:0; padding:0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 6px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #023047 0%, #219ebc 100%); padding:28px 32px 22px 32px;">
              <div style="font-size:12px; line-height:12px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; color:#bfeaf3; margin-bottom:10px;">
                TAS AI Agent
              </div>
              <div style="font-size:30px; line-height:36px; font-weight:bold; color:#ffffff; margin:0;">
                📞 Call Summary
              </div>
              <div style="font-size:15px; line-height:22px; color:#d8f3f8; margin-top:8px;">
                Automated summary of your recent TAS call activity
              </div>
            </td>
          </tr>

          <!-- Meta Row -->
          <tr>
            <td style="padding:24px 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td valign="top" width="50%" style="padding:0 8px 16px 0;">
                    <div style="background-color:#f8fafc; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
                      <div style="font-size:12px; line-height:16px; text-transform:uppercase; letter-spacing:0.8px; color:#6b7280; font-weight:bold; margin-bottom:6px;">
                        Phone Number
                      </div>
                      <div style="font-size:16px; line-height:22px; color:#111827; font-weight:bold;">
                        ${phoneNumber}
                      </div>
                    </div>
                  </td>
                  <td valign="top" width="50%" style="padding:0 0 16px 8px;">
                    <div style="background-color:#f8fafc; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
                      <div style="font-size:12px; line-height:16px; text-transform:uppercase; letter-spacing:0.8px; color:#6b7280; font-weight:bold; margin-bottom:6px;">
                        Duration
                      </div>
                      <div style="font-size:16px; line-height:22px; color:#111827; font-weight:bold;">
                        ${formatDuration(duration)}
                      </div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Summary Title -->
          <tr>
            <td style="padding:8px 32px 0 32px;">
              <div style="font-size:22px; line-height:28px; font-weight:bold; color:#111827; margin:0 0 14px 0;">
                Summary of TAS Call
              </div>
            </td>
          </tr>

          <!-- Summary Box -->
          <tr>
            <td style="padding:0 32px 8px 32px;">
              <div style="background:linear-gradient(180deg, #ffffff 0%, #f9fbfc 100%); border:1px solid #dbe7ee; border-left:5px solid #219ebc; border-radius:14px; padding:20px 22px;">
                <ul style="margin:0; padding-left:20px; color:#374151; font-size:15px; line-height:24px;">
                  ${bulletListHtml}
                </ul>
              </div>
            </td>
          </tr>

          <!-- Recording -->
          <tr>
            <td style="padding:16px 32px 8px 32px;">
              ${
                hasRecording
                  ? `
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:10px; background-color:#219ebc;">
                      <a href="${recordingUrl}" target="_blank" style="display:inline-block; padding:14px 22px; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:10px;">
                        🎧 Listen to Recording
                      </a>
                    </td>
                  </tr>
                </table>
              `
                  : `
                <div style="font-size:14px; line-height:20px; color:#9ca3af; font-style:italic; padding-top:4px;">
                  Recording not available
                </div>
              `
              }
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:18px 32px 0 32px;">
              <div style="height:1px; background-color:#e5e7eb; line-height:1px; font-size:1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 32px 28px 32px; text-align:center;">
              <div style="font-size:13px; line-height:20px; color:#6b7280;">
                Generated by <strong style="color:#374151;">TAS AI Agent</strong>
              </div>
              <div style="font-size:12px; line-height:18px; color:#9ca3af; margin-top:4px;">
                This is an automated call summary email.
              </div>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const msg = {
      to: toEmail,
      from: fromEmail,
      subject: `Call Summary: ${phoneNumber} (${formatDuration(duration)})`,
      html: emailHtml,
      text: `Call Summary\n\nPhone: ${phoneNumber}\nDuration: ${formatDuration(duration)}\n\n${bulletListText}${hasRecording ? `\n\nRecording: ${recordingUrl}` : "\n\nRecording not available"}`,
    };

    await client.send(msg);
    console.error(`[EMAIL SUCCESS] ✓ Summary sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error("[EMAIL ERROR] Failed to send summary email:", error);
    return false;
  }
}
