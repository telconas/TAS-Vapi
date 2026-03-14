import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2, VolumeX, Radio } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const SOURCE_SAMPLE_RATE = 8000;
const BUFFER_AHEAD_SECONDS = 0.05;

interface LiveAudioMonitorProps {
  listenUrl: string | null | undefined;
  callStatus: string;
  onClose?: () => void;
}

// Mu-law (G.711) decode table - standard ITU-T implementation
const MULAW_DECODE_TABLE: Int16Array = (() => {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    let b = ~i & 0xFF;
    const sign = b & 0x80;
    const exponent = (b >> 4) & 0x07;
    const mantissa = b & 0x0F;
    let sample = ((mantissa << 1) + 33) << exponent;
    sample -= 33;
    table[i] = sign ? -sample : sample;
  }
  return table;
})();

function decodeMulaw(buffer: ArrayBuffer): Float32Array {
  const bytes = new Uint8Array(buffer);
  const float32 = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    float32[i] = MULAW_DECODE_TABLE[bytes[i]] / 32768.0;
  }
  return float32;
}

function decodePCMS16LE(buffer: ArrayBuffer): Float32Array {
  const int16 = new Int16Array(buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

function linearResample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = srcIdx - lo;
    output[i] = input[lo] * (1 - frac) + input[hi] * frac;
  }
  return output;
}

export function LiveAudioMonitor({ listenUrl, callStatus, onClose }: LiveAudioMonitorProps) {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioFormat, setAudioFormat] = useState<'mulaw' | 'pcm' | 'unknown'>('unknown');

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const chunkCountRef = useRef<number>(0);
  const detectedFormatRef = useRef<'mulaw' | 'pcm'>('mulaw');

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

  function detectAndDecodeAudio(buffer: ArrayBuffer): Float32Array {
    // Vapi phone calls use Twilio PSTN which sends mu-law 8-bit at 8000Hz
    // First few chunks: try to detect format by checking byte size patterns
    // Mu-law: 1 byte per sample, PCM S16LE: 2 bytes per sample
    // Typical chunk from Vapi phone: 160 bytes (20ms at 8kHz mulaw)
    chunkCountRef.current++;

    if (chunkCountRef.current <= 3) {
      // Heuristic: if bytes are all high values with lots of 0xFF patterns, likely mulaw
      // Standard phone call from Twilio is always mulaw 8000Hz
      const bytes = new Uint8Array(buffer);
      let highByteCount = 0;
      for (let i = 0; i < Math.min(bytes.length, 50); i++) {
        if (bytes[i] > 127) highByteCount++;
      }
      // Mu-law silence byte is 0xFF (255). PCM silence is 0x00 0x00.
      // If many bytes are in high range, likely mulaw
      const highRatio = highByteCount / Math.min(bytes.length, 50);
      if (highRatio > 0.3) {
        detectedFormatRef.current = 'mulaw';
      } else {
        detectedFormatRef.current = 'pcm';
      }
      setAudioFormat(detectedFormatRef.current);
    }

    if (detectedFormatRef.current === 'mulaw') {
      return decodeMulaw(buffer);
    } else {
      return decodePCMS16LE(buffer);
    }
  }

  const scheduleChunk = (audioData: Float32Array) => {
    const ctx = audioContextRef.current;
    const gain = gainNodeRef.current;
    if (!ctx || !gain) return;
    if (ctx.state === 'suspended') {
      ctx.resume();
      return;
    }

    const ctxRate = ctx.sampleRate;
    const resampled = linearResample(audioData, SOURCE_SAMPLE_RATE, ctxRate);

    const audioBuffer = ctx.createBuffer(1, resampled.length, ctxRate);
    audioBuffer.copyToChannel(resampled, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gain);

    const chunkDuration = resampled.length / ctxRate;
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
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;

      gainNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);

      await ctx.resume();

      nextPlayTimeRef.current = 0;
      chunkCountRef.current = 0;
      detectedFormatRef.current = 'mulaw';

      wsRef.current = new WebSocket(listenUrl);
      wsRef.current.binaryType = 'arraybuffer';

      wsRef.current.onopen = () => {
        console.log('[LIVE MONITOR] Connected, ctx rate:', audioContextRef.current?.sampleRate);
        setIsMonitoring(true);
        setError(null);
      };

      wsRef.current.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (event.data.byteLength === 0) return;
          const audioData = detectAndDecodeAudio(event.data);
          scheduleChunk(audioData);
        } else if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            console.log('[LIVE MONITOR] Control msg:', msg.type || msg);
          } catch {
            // ignore
          }
        }
      };

      wsRef.current.onerror = (e) => {
        console.error('[LIVE MONITOR] WS error', e);
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
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const norm = (dataArray[i] - 128) / 128;
        sumSquares += norm * norm;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
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
    chunkCountRef.current = 0;
    setIsMonitoring(false);
    setVolumeLevel(0);
    setAudioFormat('unknown');
  };

  const toggleMute = () => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 1 : 0;
      setIsMuted(!isMuted);
    }
  };

  if (!listenUrl) return null;

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

        {isMonitoring && audioFormat !== 'unknown' && (
          <div className="text-xs text-muted-foreground text-center">
            Format: {audioFormat === 'mulaw' ? 'G.711 μ-law 8kHz' : 'PCM 16-bit 8kHz'}
          </div>
        )}

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
            Monitoring live audio stream
          </div>
        )}
      </CardContent>
    </Card>
  );
}
