import sgMail from '@sendgrid/mail';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key || !connectionSettings.settings.from_email)) {
    throw new Error('SendGrid not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email};
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableSendGridClient() {
  const {apiKey, email} = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email
  };
}

// Helper function to send call summary email
export async function sendCallSummaryEmail(
  toEmail: string,
  phoneNumber: string,
  summary: string,
  duration: number,
  recordingUrl?: string
) {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();

    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    };

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #219ebc; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .summary { background: white; padding: 15px; border-left: 4px solid #219ebc; margin: 20px 0; white-space: pre-wrap; }
          .meta { color: #666; font-size: 14px; margin: 10px 0; }
          .footer { text-align: center; margin-top: 20px; color: #999; font-size: 12px; }
          .recording-link { display: inline-block; background: #219ebc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📞 Call Summary</h1>
          </div>
          <div class="content">
            <p class="meta"><strong>Phone Number:</strong> ${phoneNumber}</p>
            <p class="meta"><strong>Duration:</strong> ${formatDuration(duration)}</p>
            
            <h2>AI-Generated Summary</h2>
            <div class="summary">${summary}</div>
            
            ${recordingUrl ? `
              <p>
                <a href="${recordingUrl}" class="recording-link">🎧 Listen to Recording</a>
              </p>
            ` : ''}
          </div>
          <div class="footer">
            <p>TAS AI Agent - Powered by Twilio, OpenAI & Deepgram</p>
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
      text: `Call Summary\n\nPhone: ${phoneNumber}\nDuration: ${formatDuration(duration)}\n\n${summary}${recordingUrl ? `\n\nRecording: ${recordingUrl}` : ''}`,
    };

    await client.send(msg);
    console.error(`[EMAIL SUCCESS] ✓ Summary sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error('[EMAIL ERROR] Failed to send summary email:', error);
    return false;
  }
}
