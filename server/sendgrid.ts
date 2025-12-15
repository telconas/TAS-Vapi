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
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #219ebc; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .summary { background: white; padding: 15px; border-left: 4px solid #219ebc; margin: 20px 0; }
          .summary ul { margin: 0; padding-left: 20px; }
          .summary li { margin: 8px 0; }
          .meta { color: #666; font-size: 14px; margin: 10px 0; }
          .footer { text-align: center; margin-top: 20px; color: #999; font-size: 12px; }
          .recording-link { display: inline-block; background: #219ebc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📞 TAS Call Summary</h1>
          </div>
          <div class="content">
            <p class="meta"><strong>Phone Number:</strong> ${phoneNumber}</p>
            <p class="meta"><strong>Duration:</strong> ${formatDuration(duration)}</p>

            <h2>Summary of TAS Call</h2>
            <div class="summary">
              <ul>
                ${bulletListHtml}
              </ul>
            </div>

            ${
              hasRecording
                ? `
              <p>
                <a href="${recordingUrl}" class="recording-link">🎧 Listen to Recording</a>
              </p>
            `
                : `
              <p style="color: #999; font-style: italic; margin-top: 15px;">
                Recording not available
              </p>
            `
            }
          </div>
          <div class="footer">
            <p>TAS AI Agent</p>
          </div>
        </div>
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
