let alertAudioCtx: AudioContext | null = null;

function getAlertAudioContext(): AudioContext {
  if (!alertAudioCtx || alertAudioCtx.state === "closed") {
    alertAudioCtx = new AudioContext();
  }
  return alertAudioCtx;
}

export function playCallAlert(): void {
  try {
    const ctx = getAlertAudioContext();
    const now = ctx.currentTime;

    const beepPattern = [0, 0.3, 0.6];
    beepPattern.forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now + offset);
      osc.frequency.setValueAtTime(1100, now + offset + 0.1);

      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.4, now + offset + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.25);
    });
  } catch {
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function sendCallNotification(phoneNumber: string): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const notification = new Notification("Scheduled Call Started", {
    body: `Calling ${phoneNumber}`,
    icon: "/favicon.ico",
    tag: "call-alert",
    requireInteraction: true,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
