import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Volume2, Loader2 } from "lucide-react";
import { useState } from "react";

interface Voice {
  voiceId: string;
  name: string;
  previewUrl?: string;
}

interface VoiceSelectorProps {
  voiceProvider: "polly" | "deepgram" | "elevenlabs";
  onVoiceProviderChange: (
    provider: "polly" | "deepgram" | "elevenlabs",
  ) => void;
  selectedPollyVoice: string;
  onPollyVoiceChange: (voice: string) => void;
  selectedDeepgramVoice: string;
  onDeepgramVoiceChange: (voice: string) => void;
  selectedElevenLabsVoice: string;
  onElevenLabsVoiceChange: (voice: string) => void;
  elevenLabsVoices: Voice[];
  disabled?: boolean;
}

const pollyVoices = [
  { value: "Polly.Joanna", label: "Joanna (Female, US)" },
  { value: "Polly.Matthew", label: "Matthew (Male, US)" },
  { value: "Polly.Salli", label: "Salli (Female, US)" },
  { value: "Polly.Kendra", label: "Kendra (Female, US)" },
  { value: "Polly.Kimberly", label: "Kimberly (Female, US)" },
  { value: "Polly.Ivy", label: "Ivy (Female Child, US)" },
  { value: "Polly.Joey", label: "Joey (Male Child, US)" },
  { value: "Polly.Justin", label: "Justin (Male Child, US)" },
  { value: "Polly.Amy", label: "Amy (Female, British)" },
  { value: "Polly.Brian", label: "Brian (Male, British)" },
  { value: "Polly.Emma", label: "Emma (Female, British)" },
  { value: "Polly.Aditi", label: "Aditi (Female, Indian)" },
  { value: "Polly.Raveena", label: "Raveena (Female, Indian)" },
  { value: "Polly.Nicole", label: "Nicole (Female, Australian)" },
  { value: "Polly.Russell", label: "Russell (Male, Australian)" },
];

const deepgramVoices = [
  { value: "aura-2-asteria-en", label: "Asteria (Female)" },
  { value: "aura-2-luna-en", label: "Luna (Female)" },
  { value: "aura-2-stella-en", label: "Stella (Female)" },
  { value: "aura-2-athena-en", label: "Athena (Female)" },
  { value: "aura-2-hera-en", label: "Hera (Female)" },
  { value: "aura-2-thalia-en", label: "Thalia (Female) - Energetic" },
  { value: "aura-2-andromeda-en", label: "Andromeda (Female) - Casual" },
  { value: "aura-2-helena-en", label: "Helena (Female) - Caring" },
  { value: "aura-2-orion-en", label: "Orion (Male)" },
  { value: "aura-2-arcas-en", label: "Arcas (Male) - Smooth" },
  { value: "aura-2-perseus-en", label: "Perseus (Male)" },
  { value: "aura-2-angus-en", label: "Angus (Male)" },
  { value: "aura-2-orpheus-en", label: "Orpheus (Male)" },
  { value: "aura-2-helios-en", label: "Helios (Male)" },
  { value: "aura-2-zeus-en", label: "Zeus (Male)" },
  { value: "aura-2-apollo-en", label: "Apollo (Male) - Confident" },
  { value: "aura-2-aries-en", label: "Aries (Male)" },
];

export function VoiceSelector({
  voiceProvider,
  onVoiceProviderChange,
  selectedPollyVoice,
  onPollyVoiceChange,
  selectedDeepgramVoice,
  onDeepgramVoiceChange,
  selectedElevenLabsVoice,
  onElevenLabsVoiceChange,
  elevenLabsVoices,
  disabled,
}: VoiceSelectorProps) {
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );

  const playVoicePreview = async (voiceId: string) => {
    try {
      // Stop any currently playing audio
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }

      setPreviewingVoice(voiceId);

      const audio = new Audio(`/api/voices/${voiceId}/preview`);
      setAudioElement(audio);

      audio.onended = () => {
        setPreviewingVoice(null);
      };

      audio.onerror = () => {
        setPreviewingVoice(null);
      };

      await audio.play();
    } catch (error) {
      console.error("Error playing voice preview:", error);
      setPreviewingVoice(null);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-base font-medium">Voice</Label>

      <Tabs
        value={voiceProvider}
        onValueChange={(value) =>
          onVoiceProviderChange(value as "polly" | "deepgram" | "elevenlabs")
        }
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger
            value="polly"
            disabled={disabled}
            data-testid="tab-polly"
          >
            Amazon
            <span className="ml-2 text-xs font-mono text-green-500 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded"></span>
          </TabsTrigger>
          <TabsTrigger
            value="deepgram"
            disabled={disabled}
            data-testid="tab-deepgram"
          >
            Deepgram
            <span className="ml-2 text-xs font-mono text-blue-500 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded"></span>
          </TabsTrigger>
          <TabsTrigger
            value="elevenlabs"
            disabled={disabled}
            data-testid="tab-elevenlabs"
          >
            ElevenLabs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="polly" className="space-y-3 mt-3">
          <Select
            value={selectedPollyVoice}
            onValueChange={onPollyVoiceChange}
            disabled={disabled}
          >
            <SelectTrigger data-testid="select-polly-voice" className="w-full">
              <SelectValue placeholder="Select a voice" />
            </SelectTrigger>
            <SelectContent>
              {pollyVoices.map((voice) => (
                <SelectItem
                  key={voice.value}
                  value={voice.value}
                  data-testid={`voice-option-${voice.value}`}
                >
                  {voice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Amazon Polly voices are included in Twilio call costs (15 voices)
          </p>
        </TabsContent>

        <TabsContent value="deepgram" className="space-y-3 mt-3">
          <Select
            value={selectedDeepgramVoice}
            onValueChange={onDeepgramVoiceChange}
            disabled={disabled}
          >
            <SelectTrigger
              data-testid="select-deepgram-voice"
              className="w-full"
            >
              <SelectValue placeholder="Select a voice" />
            </SelectTrigger>
            <SelectContent>
              {deepgramVoices.map((voice) => (
                <SelectItem
                  key={voice.value}
                  value={voice.value}
                  data-testid={`voice-option-${voice.value}`}
                >
                  {voice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Deepgram Aura-2: Ultra-low latency (~100ms) enterprise TTS (17
            voices)
          </p>
        </TabsContent>

        <TabsContent value="elevenlabs" className="space-y-3 mt-3">
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
                ElevenLabs voices with natural intonation and emotion (
                {elevenLabsVoices.length} voices)
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Loading voices...</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
