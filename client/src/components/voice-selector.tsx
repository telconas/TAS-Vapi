import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Voice } from "@shared/schema";

interface VoiceSelectorProps {
  selectedVoiceId: string;
  onVoiceChange: (voiceId: string, voiceName: string) => void;
  disabled?: boolean;
}

export function VoiceSelector({ selectedVoiceId, onVoiceChange, disabled }: VoiceSelectorProps) {
  const { data: voices, isLoading } = useQuery<Voice[]>({
    queryKey: ["/api/voices"],
    enabled: true,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Label>Voice Selection</Label>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const handleValueChange = (voiceId: string) => {
    const voice = voices?.find((v) => v.voiceId === voiceId);
    if (voice) {
      onVoiceChange(voiceId, voice.name);
    }
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="voice-select" className="text-base font-medium">
        Voice Selection
      </Label>
      <Select
        value={selectedVoiceId}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger
          id="voice-select"
          className="bg-card border-card-border"
          data-testid="select-voice"
        >
          <SelectValue placeholder="Select a voice" />
        </SelectTrigger>
        <SelectContent>
          {voices?.map((voice) => (
            <SelectItem 
              key={voice.voiceId} 
              value={voice.voiceId}
              data-testid={`option-voice-${voice.voiceId}`}
            >
              {voice.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
