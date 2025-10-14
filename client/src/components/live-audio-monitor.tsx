import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2, VolumeX, Radio } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface LiveAudioMonitorProps {
  listenUrl: string | null | undefined;
  callStatus: string;
  onClose?: () => void;
}

export function LiveAudioMonitor({ listenUrl, callStatus, onClose }: LiveAudioMonitorProps) {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    // Auto-start monitoring when listenUrl is available and call is active
    if (listenUrl && (callStatus === 'connected' || callStatus === 'ringing')) {
      startMonitoring();
    }

    return () => {
      stopMonitoring();
    };
  }, [listenUrl, callStatus]);

  const startMonitoring = async () => {
    if (!listenUrl || isMonitoring) return;

    try {
      // Initialize Web Audio API
      audioContextRef.current = new AudioContext({ sampleRate: 16000 }); // Vapi uses 16kHz
      gainNodeRef.current = audioContextRef.current.createGain();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      gainNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);

      // Connect to WebSocket
      wsRef.current = new WebSocket(listenUrl);
      wsRef.current.binaryType = 'arraybuffer';

      wsRef.current.onopen = () => {
        console.log('[LIVE MONITOR] Connected to audio stream');
        setIsMonitoring(true);
        setError(null);
      };

      wsRef.current.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const audioData = new Float32Array(event.data.byteLength / 4);
          const view = new DataView(event.data);
          
          // Convert Int16 PCM to Float32
          for (let i = 0; i < audioData.length; i++) {
            audioData[i] = view.getInt16(i * 2, true) / 32768.0;
          }

          // Add to queue
          audioQueueRef.current.push(audioData);

          // Start playback if not already playing
          if (!isPlayingRef.current) {
            playNextChunk();
          }

          // Update volume visualization
          updateVolumeLevel();
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[LIVE MONITOR] WebSocket error:', error);
        setError('Failed to connect to audio stream');
      };

      wsRef.current.onclose = () => {
        console.log('[LIVE MONITOR] Disconnected from audio stream');
        setIsMonitoring(false);
      };
    } catch (err) {
      console.error('[LIVE MONITOR] Error starting monitor:', err);
      setError(err instanceof Error ? err.message : 'Failed to start monitoring');
    }
  };

  const playNextChunk = async () => {
    if (!audioContextRef.current || !gainNodeRef.current || audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const audioData = audioQueueRef.current.shift()!;

    const audioBuffer = audioContextRef.current.createBuffer(
      1,
      audioData.length,
      audioContextRef.current.sampleRate
    );
    
    audioBuffer.copyToChannel(audioData, 0);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNodeRef.current);

    source.onended = () => {
      playNextChunk();
    };

    source.start();
  };

  const updateVolumeLevel = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    setVolumeLevel(Math.min(100, (average / 255) * 100));
  };

  const stopMonitoring = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsMonitoring(false);
    setVolumeLevel(0);
  };

  const toggleMute = () => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 1 : 0;
      setIsMuted(!isMuted);
    }
  };

  if (!listenUrl) {
    return null;
  }

  return (
    <Card className="border-primary/20" data-testid="card-live-monitor">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className={`h-4 w-4 ${isMonitoring ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
          Live Call Monitor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="text-sm text-destructive" data-testid="text-monitor-error">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Audio Level</span>
            {isMonitoring && (
              <span className="text-xs text-primary font-mono">
                {Math.round(volumeLevel)}%
              </span>
            )}
          </div>
          <Progress value={volumeLevel} className="h-2" data-testid="progress-volume" />
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={isMonitoring ? "destructive" : "default"}
            onClick={isMonitoring ? stopMonitoring : startMonitoring}
            disabled={!listenUrl || callStatus === 'ended'}
            className="flex-1"
            data-testid={isMonitoring ? "button-stop-monitor" : "button-start-monitor"}
          >
            {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
          </Button>

          {isMonitoring && (
            <Button
              size="sm"
              variant="outline"
              onClick={toggleMute}
              data-testid="button-toggle-mute"
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {isMonitoring && (
          <div className="text-xs text-muted-foreground text-center" data-testid="text-monitoring-status">
            Monitoring live audio stream...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
