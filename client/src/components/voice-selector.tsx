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
  voiceProvider: "polly" | "openai" | "elevenlabs";
  onVoiceProviderChange: (provider: "polly" | "openai" | "elevenlabs") => void;
  selectedPollyVoice: string;
  onPollyVoiceChange: (voice: string) => void;
  selectedOpenAIVoice: string;
  onOpenAIVoiceChange: (voice: string) => void;
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

const openaiVoices = [
  { value: "alloy", label: "Alloy (Neutral)" },
  { value: "echo", label: "Echo (Male)" },
  { value: "fable", label: "Fable (Male, British)" },
  { value: "onyx", label: "Onyx (Male, Deep)" },
  { value: "nova", label: "Nova (Female)" },
  { value: "shimmer", label: "Shimmer (Female, Soft)" },
];

export function VoiceSelector({
  voiceProvider,
  onVoiceProviderChange,
  selectedPollyVoice,
  onPollyVoiceChange,
  selectedOpenAIVoice,
  onOpenAIVoiceChange,
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
          onVoiceProviderChange(value as "polly" | "openai" | "elevenlabs")
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
            <span className="ml-2 text-xs font-mono text-green-500 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
              FREE
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="openai"
            disabled={disabled}
            data-testid="tab-openai"
          >
            OpenAI
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

        <TabsContent value="openai" className="space-y-3 mt-3">
          <Select
            value={selectedOpenAIVoice}
            onValueChange={onOpenAIVoiceChange}
            disabled={disabled}
          >
            <SelectTrigger data-testid="select-openai-voice" className="w-full">
              <SelectValue placeholder="Select a voice" />
            </SelectTrigger>
            <SelectContent>
              {openaiVoices.map((voice) => (
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
            OpenAI TTS provides premium voices with natural prosody (6 voices)
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
