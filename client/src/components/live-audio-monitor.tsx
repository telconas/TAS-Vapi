import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2, VolumeX, Radio } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const VAPI_INPUT_SAMPLE_RATE = 8000;

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
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
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

  const startMonitoring = async () => {
    if (!listenUrl) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      await ctx.resume();

      await ctx.audioWorklet.addModule('/pcm-player-processor.js');

      const workletNode = new AudioWorkletNode(ctx, 'pcm-player-processor', {
        processorOptions: { inputSampleRate: VAPI_INPUT_SAMPLE_RATE },
      });
      workletNodeRef.current = workletNode;

      const gain = ctx.createGain();
      gain.gain.value = 1;
      gainNodeRef.current = gain;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      workletNode.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);

      const ws = new WebSocket(listenUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[LIVE MONITOR] WS connected. AudioContext sampleRate=${ctx.sampleRate}, input=${VAPI_INPUT_SAMPLE_RATE}Hz, ratio=${(VAPI_INPUT_SAMPLE_RATE / ctx.sampleRate).toFixed(4)}`);
        setIsMonitoring(true);
        setError(null);
        startVolumeMeter();
      };

      ws.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer) || event.data.byteLength === 0) return;
        const node = workletNodeRef.current;
        if (!node) return;

        const int16 = new Int16Array(event.data);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 32768.0;
        }
        node.port.postMessage(float32, [float32.buffer]);
      };

      ws.onerror = () => {
        setError('Failed to connect to audio stream');
        stopVolumeMeter();
      };

      ws.onclose = () => {
        setIsMonitoring(false);
        stopVolumeMeter();
        setVolumeLevel(0);
      };
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
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    gainNodeRef.current = null;
    analyserRef.current = null;
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
            Live — real-time PCM stream
          </div>
        )}
      </CardContent>
    </Card>
  );
}
