import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Volume2, Check, Loader2 } from "lucide-react";
import { Voice } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface VoiceSelectorProps {
  selectedVoiceId: string;
  onVoiceChange: (voiceId: string, voiceName: string) => void;
  disabled?: boolean;
}

export function VoiceSelector({ selectedVoiceId, onVoiceChange, disabled }: VoiceSelectorProps) {
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const { data: voices, isLoading } = useQuery<Voice[]>({
    queryKey: ["/api/voices"],
    enabled: true,
  });

  const handlePlayPreview = async (voiceId: string) => {
    // Stop currently playing audio
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
    }

    // If clicking the same voice, just stop
    if (playingVoiceId === voiceId) {
      setPlayingVoiceId(null);
      setAudioElement(null);
      return;
    }

    try {
      setPlayingVoiceId(voiceId);
      
      // Create new audio element
      const audio = new Audio(`/api/voices/${voiceId}/preview`);
      setAudioElement(audio);

      audio.onended = () => {
        setPlayingVoiceId(null);
        setAudioElement(null);
      };

      audio.onerror = () => {
        setPlayingVoiceId(null);
        setAudioElement(null);
        toast({
          title: "Preview Failed",
          description: "Failed to load voice preview",
          variant: "destructive",
        });
      };

      await audio.play();
    } catch (error) {
      console.error('Error playing preview:', error);
      setPlayingVoiceId(null);
      setAudioElement(null);
      toast({
        title: "Preview Failed",
        description: "Failed to play voice preview",
        variant: "destructive",
      });
    }
  };

  const handleSelectVoice = (voiceId: string, voiceName: string) => {
    if (!disabled) {
      onVoiceChange(voiceId, voiceName);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Label>Voice Selection</Label>
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Label className="text-base font-medium">
        Voice Selection
      </Label>
      <Card className="p-2">
        <ScrollArea className="h-[200px] pr-3">
          <div className="space-y-1">
            {voices?.map((voice) => {
              const isSelected = selectedVoiceId === voice.voiceId;
              const isPlaying = playingVoiceId === voice.voiceId;

              return (
                <div
                  key={voice.voiceId}
                  className={`flex items-center gap-2 p-2 rounded-md transition-colors ${
                    isSelected
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover-elevate'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  onClick={() => handleSelectVoice(voice.voiceId, voice.name)}
                  data-testid={`voice-option-${voice.voiceId}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      isSelected ? 'text-primary' : 'text-foreground'
                    }`}>
                      {voice.name}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {isSelected && (
                      <Check className="w-4 h-4 text-primary" data-testid={`check-${voice.voiceId}`} />
                    )}
                    
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayPreview(voice.voiceId);
                      }}
                      disabled={disabled}
                      data-testid={`button-preview-${voice.voiceId}`}
                    >
                      {isPlaying ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </Card>
      <p className="text-xs text-muted-foreground">
        Click a voice to select it, or use the preview button to hear it first.
      </p>
    </div>
  );
}
