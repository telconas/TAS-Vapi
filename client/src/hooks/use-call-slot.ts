import { useState, useRef, useCallback } from "react";
import type { TranscriptMessage } from "@shared/schema";

export type CallStatus = "idle" | "ringing" | "connected" | "ended" | "transferred";

export interface CallSlotState {
  callStatus: CallStatus;
  phoneNumber: string;
  duration: number;
  transcript: TranscriptMessage[];
  isAudioPlaying: boolean;
  currentCallId: string | null;
  listenUrl: string | null;
  recordingUrl: string | null;
  callSummary: string | null;
}

export interface CallSlotActions {
  setCallStatus: (s: CallStatus) => void;
  setPhoneNumber: (v: string) => void;
  setDuration: (v: number | ((prev: number) => number)) => void;
  setTranscript: (v: TranscriptMessage[] | ((prev: TranscriptMessage[]) => TranscriptMessage[])) => void;
  setIsAudioPlaying: (v: boolean) => void;
  setCurrentCallId: (v: string | null) => void;
  setListenUrl: (v: string | null) => void;
  setRecordingUrl: (v: string | null) => void;
  setCallSummary: (v: string | null) => void;
  callActiveRef: React.MutableRefObject<boolean>;
  currentCallIdRef: React.MutableRefObject<string | null>;
  durationIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
  startDurationCounter: () => void;
  stopDurationCounter: () => void;
  reset: () => void;
}

export type CallSlot = CallSlotState & CallSlotActions;

const defaultState = (): CallSlotState => ({
  callStatus: "idle",
  phoneNumber: "",
  duration: 0,
  transcript: [],
  isAudioPlaying: false,
  currentCallId: null,
  listenUrl: null,
  recordingUrl: null,
  callSummary: null,
});

export function useCallSlot(): CallSlot {
  const [state, setState] = useState<CallSlotState>(defaultState());
  const callActiveRef = useRef(false);
  const currentCallIdRef = useRef<string | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const setCallStatus = useCallback((s: CallStatus) => setState((p) => ({ ...p, callStatus: s })), []);
  const setPhoneNumber = useCallback((v: string) => setState((p) => ({ ...p, phoneNumber: v })), []);
  const setDuration = useCallback((v: number | ((prev: number) => number)) =>
    setState((p) => ({ ...p, duration: typeof v === "function" ? v(p.duration) : v })), []);
  const setTranscript = useCallback((v: TranscriptMessage[] | ((prev: TranscriptMessage[]) => TranscriptMessage[])) =>
    setState((p) => ({ ...p, transcript: typeof v === "function" ? v(p.transcript) : v })), []);
  const setIsAudioPlaying = useCallback((v: boolean) => setState((p) => ({ ...p, isAudioPlaying: v })), []);
  const setCurrentCallId = useCallback((v: string | null) => setState((p) => ({ ...p, currentCallId: v })), []);
  const setListenUrl = useCallback((v: string | null) => setState((p) => ({ ...p, listenUrl: v })), []);
  const setRecordingUrl = useCallback((v: string | null) => setState((p) => ({ ...p, recordingUrl: v })), []);
  const setCallSummary = useCallback((v: string | null) => setState((p) => ({ ...p, callSummary: v })), []);

  const startDurationCounter = useCallback(() => {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = setInterval(() => {
      setState((p) => ({ ...p, duration: p.duration + 1 }));
    }, 1000);
  }, []);

  const stopDurationCounter = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopDurationCounter();
    callActiveRef.current = false;
    currentCallIdRef.current = null;
    setState(defaultState());
  }, [stopDurationCounter]);

  return {
    ...state,
    setCallStatus,
    setPhoneNumber,
    setDuration,
    setTranscript,
    setIsAudioPlaying,
    setCurrentCallId,
    setListenUrl,
    setRecordingUrl,
    setCallSummary,
    callActiveRef,
    currentCallIdRef,
    durationIntervalRef,
    startDurationCounter,
    stopDurationCounter,
    reset,
  };
}
