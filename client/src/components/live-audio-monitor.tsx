import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2, VolumeX, Radio } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

// Vapi monitor.listenUrl for phone calls always sends PCM S16LE at 16000 Hz
const VAPI_SAMPLE_RATE = 16000;
const BUFFER_AHEAD_SECONDS = 0.1;

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
  const nextPlayTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (callStatus === 'ended') {
      stopMonitoring();
    }
  }, [callStatus]);

  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, []);

  const scheduleChunk = (buffer: ArrayBuffer) => {
    const ctx = audioContextRef.current;
    const gain = gainNodeRef.current;
    if (!ctx || !gain || ctx.state === 'closed') return;

    // PCM S16LE: 2 bytes per sample, little-endian, signed 16-bit
    const int16 = new Int16Array(buffer);
    const numSamples = int16.length;
    if (numSamples === 0) return;

    const ctxRate = ctx.sampleRate;

    // Decode S16LE → Float32
    const float32 = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    // Tell the browser this buffer IS at VAPI_SAMPLE_RATE; it will resample to ctx rate internally
    const audioBuffer = ctx.createBuffer(1, float32.length, VAPI_SAMPLE_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gain);

    const chunkDuration = float32.length / VAPI_SAMPLE_RATE;
    const now = ctx.currentTime;
    const startAt = Math.max(now + BUFFER_AHEAD_SECONDS, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + chunkDuration;
  };

  const startMonitoring = async () => {
    if (!listenUrl) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      gainNodeRef.current = ctx.createGain();
      gainNodeRef.current.gain.value = 1;

      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;

      gainNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);

      await ctx.resume();

      nextPlayTimeRef.current = 0;

      wsRef.current = new WebSocket(listenUrl);
      wsRef.current.binaryType = 'arraybuffer';

      wsRef.current.onopen = () => {
        console.log('[LIVE MONITOR] Connected — PCM S16LE @ 16000 Hz, ctx rate:', ctx.sampleRate);
        setIsMonitoring(true);
        setError(null);
      };

      wsRef.current.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (event.data.byteLength === 0) return;
          scheduleChunk(event.data);
        }
        // ignore text/JSON control frames
      };

      wsRef.current.onerror = () => {
        setError('Failed to connect to audio stream');
      };

      wsRef.current.onclose = () => {
        setIsMonitoring(false);
        stopVolumeMeter();
      };

      startVolumeMeter();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start monitoring');
    }
  };

  const startVolumeMeter = () => {
    const tick = () => {
      if (!analyserRef.current) return;
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setVolumeLevel(Math.min(100, rms * 400));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const stopVolumeMeter = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const stopMonitoring = () => {
    stopVolumeMeter();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    nextPlayTimeRef.current = 0;
    setIsMonitoring(false);
    setVolumeLevel(0);
  };

  const toggleMute = () => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 1 : 0;
      setIsMuted(!isMuted);
    }
  };

  if (!listenUrl) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className={`h-4 w-4 ${isMonitoring ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
          Live Call Monitor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Audio Level</span>
            {isMonitoring && (
              <span className="text-xs text-primary font-mono">{Math.round(volumeLevel)}%</span>
            )}
          </div>
          <Progress value={volumeLevel} className="h-2" />
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={isMonitoring ? "destructive" : "default"}
            onClick={isMonitoring ? stopMonitoring : startMonitoring}
            disabled={!listenUrl || callStatus === 'ended'}
            className="flex-1"
          >
            {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
          </Button>

          {isMonitoring && (
            <Button size="sm" variant="outline" onClick={toggleMute}>
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {isMonitoring && (
          <div className="text-xs text-muted-foreground text-center">
            Monitoring live — PCM 16-bit @ 16kHz
          </div>
        )}
      </CardContent>
    </Card>
  );
}
