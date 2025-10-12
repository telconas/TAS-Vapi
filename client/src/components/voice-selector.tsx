import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface VoiceSelectorProps {
  voiceProvider: "polly" | "openai";
  onVoiceProviderChange: (provider: "polly" | "openai") => void;
  selectedPollyVoice: string;
  onPollyVoiceChange: (voice: string) => void;
  selectedOpenAIVoice: string;
  onOpenAIVoiceChange: (voice: string) => void;
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
  disabled,
}: VoiceSelectorProps) {
  return (
    <div className="space-y-3">
      <Label className="text-base font-medium">Voice</Label>
      
      <Tabs
        value={voiceProvider}
        onValueChange={(value) => onVoiceProviderChange(value as "polly" | "openai")}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger 
            value="polly" 
            disabled={disabled}
            data-testid="tab-polly"
          >
            Amazon Polly
            <span className="ml-2 text-xs font-mono text-green-500 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
              FREE
            </span>
          </TabsTrigger>
          <TabsTrigger 
            value="openai" 
            disabled={disabled}
            data-testid="tab-openai"
          >
            OpenAI TTS
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {voiceProvider === "polly" ? (
        <>
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
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
