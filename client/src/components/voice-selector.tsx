import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Volume2, Loader as Loader2 } from "lucide-react";
import { useState } from "react";

interface Voice {
  voiceId: string;
  name: string;
  previewUrl?: string;
}

interface VoiceSelectorProps {
  selectedElevenLabsVoice: string;
  onElevenLabsVoiceChange: (voice: string) => void;
  elevenLabsVoices: Voice[];
  disabled?: boolean;
}

export function VoiceSelector({
  selectedElevenLabsVoice,
  onElevenLabsVoiceChange,
  elevenLabsVoices,
  disabled,
}: VoiceSelectorProps) {
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const playVoicePreview = async (voiceId: string) => {
    try {
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }

      setPreviewingVoice(voiceId);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const previewUrl = `${supabaseUrl}/functions/v1/api-voices/voices/${voiceId}/preview`;
      const response = await fetch(previewUrl, {
        headers: { Authorization: `Bearer ${anonKey}`, Apikey: anonKey },
      });
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      setAudioElement(audio);

      audio.onended = () => setPreviewingVoice(null);
      audio.onerror = () => setPreviewingVoice(null);

      await audio.play();
    } catch (error) {
      console.error("Error playing voice preview:", error);
      setPreviewingVoice(null);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-base font-medium">Voice</Label>

      {elevenLabsVoices.length > 0 ? (
        <>
          <div className="space-y-2">
            {elevenLabsVoices.map((voice) => (
              <div
                key={voice.voiceId}
                className="flex items-center gap-2 p-2 rounded-md border bg-card hover-elevate"
              >
                <input
                  type="radio"
                  id={`voice-${voice.voiceId}`}
                  name="elevenlabs-voice"
                  value={voice.voiceId}
                  checked={selectedElevenLabsVoice === voice.voiceId}
                  onChange={() => onElevenLabsVoiceChange(voice.voiceId)}
                  disabled={disabled}
                  className="cursor-pointer"
                  data-testid={`radio-voice-${voice.voiceId}`}
                />
                <label
                  htmlFor={`voice-${voice.voiceId}`}
                  className="flex-1 cursor-pointer text-sm"
                >
                  {voice.name}
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => playVoicePreview(voice.voiceId)}
                  disabled={disabled || previewingVoice === voice.voiceId}
                  data-testid={`button-preview-${voice.voiceId}`}
                >
                  {previewingVoice === voice.voiceId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            ElevenLabs voices with natural intonation and emotion ({elevenLabsVoices.length} voices)
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Loading voices...</p>
      )}
    </div>
  );
}
