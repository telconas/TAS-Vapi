import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PollyVoiceSelectorProps {
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
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

export function PollyVoiceSelector({ selectedVoice, onVoiceChange, disabled }: PollyVoiceSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">
          Voice (Amazon Polly)
        </Label>
        <span className="text-xs font-mono text-green-500 dark:text-green-400 bg-green-500/10 px-2 py-1 rounded">
          FREE
        </span>
      </div>
      <Select
        value={selectedVoice}
        onValueChange={onVoiceChange}
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
        Amazon Polly voices are completely free (included in Twilio call costs)
      </p>
    </div>
  );
}
