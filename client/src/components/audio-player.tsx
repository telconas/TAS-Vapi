import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

interface AudioPlayerProps {
  isPlaying: boolean;
  audioUrl?: string;
  onPlayPause: () => void;
}

export function AudioPlayer({ isPlaying, audioUrl, onPlayPause }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (audioRef.current && audioUrl) {
      audioRef.current.src = audioUrl;
      if (isPlaying) {
        audioRef.current.play();
      } else {
        audioRef.current.pause();
      }
    }
  }, [audioUrl, isPlaying]);

  // Generate random waveform data for visualization
  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(() => {
        const data = Array.from({ length: 50 }, () => Math.random() * 100);
        setWaveformData(data);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setWaveformData(Array(50).fill(20));
    }
  }, [isPlaying]);

  return (
    <Card className="p-6" data-testid="card-audio-player">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Live Audio Stream</h3>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMuted(!isMuted)}
              data-testid="button-toggle-mute"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </Button>
            <div className="w-24">
              <Slider
                value={[volume]}
                onValueChange={(value) => setVolume(value[0])}
                max={100}
                step={1}
                className="cursor-pointer"
                data-testid="slider-volume"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button
            size="icon"
            variant="outline"
            onClick={onPlayPause}
            className="rounded-full"
            data-testid="button-play-pause"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </Button>

          <div className="flex-1 h-16 flex items-end gap-1" data-testid="waveform-visualization">
            {waveformData.map((height, i) => (
              <div
                key={i}
                className="flex-1 bg-primary rounded-t transition-all duration-100"
                style={{
                  height: `${isPlaying ? height : 20}%`,
                  opacity: isPlaying ? 0.8 : 0.3,
                }}
              />
            ))}
          </div>
        </div>

        <audio ref={audioRef} className="hidden" />
      </div>
    </Card>
  );
}
