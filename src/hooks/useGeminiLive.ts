import { useCallback, useEffect, useRef, useState } from 'react';
import {
  float32ToPcm16Base64,
  pcm16Base64ToFloat32,
} from '../utils/audioUtils';
import type { BrainModeId } from '../types/simpli';

export type LiveSessionStatus = 'idle' | 'connecting' | 'live' | 'error';

interface UseGeminiLiveOptions {
  voiceName: string;
  brainMode: BrainModeId;
  topicContext?: string;
  historySummary?: string;
  onCommitTurn: (role: 'user' | 'assistant', text: string) => void;
}

export function useGeminiLive({
  voiceName,
  brainMode,
  topicContext,
  historySummary,
  onCommitTurn,
}: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<LiveSessionStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [liveUserDraft, setLiveUserDraft] = useState('');
  const [liveAssistantDraft, setLiveAssistantDraft] = useState('');
  const [liveError, setLiveError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<LiveSessionStatus>('idle');
  const mutedRef = useRef(false);
  const onCommitTurnRef = useRef(onCommitTurn);
  onCommitTurnRef.current = onCommitTurn;

  const streamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const userDraftRef = useRef('');
  const assistantDraftRef = useRef('');

  const updateStatus = useCallback((next: LiveSessionStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const stopPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setIsModelSpeaking(false);
  }, []);

  const flushDrafts = useCallback(() => {
    const u = userDraftRef.current.trim();
    if (u) {
      userDraftRef.current = '';
      setLiveUserDraft('');
      onCommitTurnRef.current('user', u);
    }
    const a = assistantDraftRef.current.trim();
    if (a) {
      assistantDraftRef.current = '';
      setLiveAssistantDraft('');
      onCommitTurnRef.current('assistant', a);
    }
  }, []);

  const teardown = useCallback(() => {
    flushDrafts();
    stopPlayback();

    if (processorRef.current) {
      try {
        processorRef.current.onaudioprocess = null;
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (inputCtxRef.current && inputCtxRef.current.state !== 'closed') {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }

    if (outputCtxRef.current && outputCtxRef.current.state !== 'closed') {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'stop' }));
        }
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    setMicLevel(0);
    setIsMuted(false);
    mutedRef.current = false;
  }, [flushDrafts, stopPlayback]);

  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  const playPcm24kChunk = useCallback((base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const float32 = pcm16Base64ToFloat32(base64Audio);
    if (!float32.length) return;

    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime + 0.015, nextStartTimeRef.current);
    nextStartTimeRef.current = startAt + audioBuffer.duration;

    activeSourcesRef.current.add(source);
    setIsModelSpeaking(true);

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setIsModelSpeaking(false);
      }
    };

    source.start(startAt);
  }, []);

  const startSession = useCallback(async () => {
    if (statusRef.current === 'connecting' || statusRef.current === 'live') {
      return;
    }

    setLiveError(null);
    userDraftRef.current = '';
    assistantDraftRef.current = '';
    setLiveUserDraft('');
    setLiveAssistantDraft('');
    updateStatus('connecting');

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setLiveError('Microphone is not supported in this browser.');
      updateStatus('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;

      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live-voice`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'start',
            voiceName,
            brainMode,
            topicContext,
            historySummary,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type?: string;
            data?: string;
            text?: string;
            message?: string;
          };

          if (msg.type === 'ready') {
            updateStatus('live');
            return;
          }

          if (msg.type === 'inputTranscript' && msg.text) {
            userDraftRef.current = userDraftRef.current
              ? `${userDraftRef.current}${msg.text}`
              : msg.text;
            setLiveUserDraft(userDraftRef.current);
            return;
          }

          if (msg.type === 'outputTranscript' && msg.text) {
            // Once model starts replying, commit any pending user speech as a saved turn
            const pendingUser = userDraftRef.current.trim();
            if (pendingUser) {
              userDraftRef.current = '';
              setLiveUserDraft('');
              onCommitTurnRef.current('user', pendingUser);
            }
            assistantDraftRef.current = assistantDraftRef.current
              ? `${assistantDraftRef.current}${msg.text}`
              : msg.text;
            setLiveAssistantDraft(assistantDraftRef.current);
            return;
          }

          if (msg.type === 'audio' && msg.data) {
            playPcm24kChunk(msg.data);
            return;
          }

          if (msg.type === 'interrupted') {
            stopPlayback();
            return;
          }

          if (msg.type === 'turnComplete') {
            flushDrafts();
            return;
          }

          if (msg.type === 'error') {
            setLiveError(msg.message || 'Live voice connection failed.');
            teardown();
            updateStatus('error');
            return;
          }

          if (msg.type === 'closed') {
            teardown();
            updateStatus('idle');
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        setLiveError('Could not connect to Gemini Live Voice server.');
        teardown();
        updateStatus('error');
      };

      ws.onclose = () => {
        if (statusRef.current === 'live' || statusRef.current === 'connecting') {
          teardown();
          updateStatus('idle');
        }
      };

      // Stream 16kHz mono PCM mic audio via ScriptProcessorNode
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      const zeroGain = inputCtx.createGain();
      zeroGain.gain.value = 0;

      processor.onaudioprocess = (e) => {
        const samples = e.inputBuffer.getChannelData(0);
        if (mutedRef.current) {
          setMicLevel(0);
          return;
        }

        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
          const abs = Math.abs(samples[i]);
          if (abs > peak) peak = abs;
        }
        setMicLevel(Math.min(100, Math.round(peak * 180)));

        if (
          wsRef.current?.readyState === WebSocket.OPEN &&
          statusRef.current === 'live'
        ) {
          const base64Pcm = float32ToPcm16Base64(
            samples,
            inputCtx.sampleRate,
            16000
          );
          wsRef.current.send(
            JSON.stringify({ type: 'audio', data: base64Pcm })
          );
        }
      };

      source.connect(processor);
      processor.connect(zeroGain);
      zeroGain.connect(inputCtx.destination);
      processorRef.current = processor;
    } catch (err) {
      teardown();
      updateStatus('error');
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setLiveError('No microphone detected on this device.');
      } else {
        setLiveError(
          err instanceof Error
            ? err.message
            : 'Microphone permission denied for Live Voice.'
        );
      }
    }
  }, [
    brainMode,
    flushDrafts,
    historySummary,
    playPcm24kChunk,
    stopPlayback,
    teardown,
    topicContext,
    updateStatus,
    voiceName,
  ]);

  const stopSession = useCallback(() => {
    teardown();
    updateStatus('idle');
  }, [teardown, updateStatus]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      return next;
    });
  }, []);

  const sendLiveText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || wsRef.current?.readyState !== WebSocket.OPEN) return false;
    onCommitTurnRef.current('user', trimmed);
    wsRef.current.send(JSON.stringify({ type: 'text', text: trimmed }));
    return true;
  }, []);

  return {
    status,
    isMuted,
    isModelSpeaking,
    micLevel,
    liveUserDraft,
    liveAssistantDraft,
    liveError,
    startSession,
    stopSession,
    toggleMute,
    sendLiveText,
  };
}
