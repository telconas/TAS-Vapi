import { useRef, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Download, Volume2, VolumeX, RotateCcw } from "lucide-react";

interface RecordingPlayerProps {
  recordingUrl: string;
  title?: string;
}

export function RecordingPlayer({ recordingUrl, title = "Call Recording" }: RecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("canplay", handleCanPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("canplay", handleCanPlay);
    };
  }, [recordingUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = value[0];
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleRestart = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = 0;
    setCurrentTime(0);
    if (!isPlaying) {
      audio.play();
      setIsPlaying(true);
    }
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = recordingUrl;
    link.download = `call-recording-${new Date().toISOString().slice(0, 10)}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Card className="p-6" data-testid="card-recording-player">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            {title}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            data-testid="button-download-recording"
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <Button
            size="icon"
            onClick={togglePlayPause}
            disabled={isLoading}
            className="h-12 w-12 rounded-full"
            data-testid="button-play-pause-recording"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={handleRestart}
            disabled={isLoading}
            data-testid="button-restart-recording"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>

          <div className="flex-1 space-y-1">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              disabled={isLoading}
              className="cursor-pointer"
              data-testid="slider-recording-progress"
            />
            <div className="flex justify-between text-xs text-muted-foreground font-mono">
              <span data-testid="text-current-time">{formatTime(currentTime)}</span>
              <span data-testid="text-duration">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMuted(!isMuted)}
              data-testid="button-mute-recording"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>
            <div className="w-20">
              <Slider
                value={[isMuted ? 0 : volume]}
                max={100}
                step={1}
                onValueChange={(value) => {
                  setVolume(value[0]);
                  if (isMuted && value[0] > 0) setIsMuted(false);
                }}
                className="cursor-pointer"
                data-testid="slider-volume-recording"
              />
            </div>
          </div>
        </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground text-center">
            Loading recording...
          </p>
        )}

        <audio ref={audioRef} src={recordingUrl} preload="metadata" className="hidden" />
      </div>
    </Card>
  );
}
