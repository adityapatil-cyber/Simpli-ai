import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceOption } from '../types/simpli';
import { sanitizeForSpeech } from '../utils/simpliLogic';

export interface SpeechState {
  activeId: string | null;
  status: 'idle' | 'loading' | 'playing' | 'paused';
  speed: number;
  voice: VoiceOption;
  progress: number;
  error: string | null;
}

export function useSpeechPlayer() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [speed, setSpeed] = useState<number>(1.0);
  const [voice, setVoice] = useState<VoiceOption>('Kore');
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const usingWebSpeechRef = useRef(false);

  const cleanupAudio = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    usingWebSpeechRef.current = false;
    setProgress(0);
  }, []);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  const stop = useCallback(() => {
    cleanupAudio();
    setActiveId(null);
    setStatus('idle');
    setError(null);
  }, [cleanupAudio]);

  const togglePause = useCallback(() => {
    if (usingWebSpeechRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (status === 'playing') {
        window.speechSynthesis.pause();
        setStatus('paused');
      } else if (status === 'paused') {
        window.speechSynthesis.resume();
        setStatus('playing');
      }
      return;
    }

    const el = audioRef.current;
    if (!el) return;
    if (status === 'playing') {
      el.pause();
      setStatus('paused');
    } else if (status === 'paused') {
      el.play().catch(() => {});
      setStatus('playing');
    }
  }, [status]);

  const speakWithBrowserFallback = useCallback(
    (id: string, cleanText: string, rate: number) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setStatus('idle');
        setActiveId(null);
        setProgress(0);
        setError('Audio playback is not supported in this browser.');
        return;
      }
      usingWebSpeechRef.current = true;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = rate;
      utterance.onboundary = (event) => {
        if (cleanText.length > 0 && typeof event.charIndex === 'number') {
          setProgress(Math.min(1, Math.max(0, event.charIndex / cleanText.length)));
        }
      };
      utterance.onend = () => {
        setStatus('idle');
        setActiveId(null);
        setProgress(0);
        usingWebSpeechRef.current = false;
      };
      utterance.onerror = () => {
        setStatus('idle');
        setActiveId(null);
        setProgress(0);
        usingWebSpeechRef.current = false;
      };
      setActiveId(id);
      setStatus('playing');
      setProgress(0);
      window.speechSynthesis.speak(utterance);
    },
    []
  );

  const speak = useCallback(
    async (id: string, rawText: string) => {
      const cleanText = sanitizeForSpeech(rawText);
      if (!cleanText) return;

      // Toggle off if already playing same clip
      if (activeId === id && (status === 'playing' || status === 'paused')) {
        togglePause();
        return;
      }

      cleanupAudio();
      setError(null);
      setActiveId(id);
      setStatus('loading');

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText, voiceName: voice }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error('TTS service unavailable');
        }

        const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
        if (!data.audioBase64) {
          throw new Error('Empty audio payload');
        }

        const binary = atob(data.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: data.mimeType || 'audio/wav' });
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;

        const audio = new Audio(url);
        audio.playbackRate = speed;
        audioRef.current = audio;

        audio.ontimeupdate = () => {
          if (audio.duration > 0 && Number.isFinite(audio.duration)) {
            setProgress(Math.min(1, Math.max(0, audio.currentTime / audio.duration)));
          }
        };
        audio.onended = () => {
          setStatus('idle');
          setActiveId(null);
          setProgress(0);
        };
        audio.onerror = () => {
          speakWithBrowserFallback(id, cleanText, speed);
        };

        setStatus('playing');
        await audio.play();
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        // Seamless fallback to Web Speech API so Hearing option works reliably
        speakWithBrowserFallback(id, cleanText, speed);
      }
    },
    [activeId, cleanupAudio, speakWithBrowserFallback, speed, status, togglePause, voice]
  );

  const fetchTtsAudioClip = useCallback(
    async (rawText: string): Promise<{ blob: Blob; filenameExt: string }> => {
      const cleanText = sanitizeForSpeech(rawText);
      if (!cleanText) {
        throw new Error('Nothing to synthesize.');
      }
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, voiceName: voice }),
      });
      const data = (await res.json()) as {
        audioBase64?: string;
        mimeType?: string;
        error?: string;
      };
      if (!res.ok || !data.audioBase64) {
        throw new Error(
          data.error ||
            'Audio file export needs Gemini TTS availability. You can still play aloud or download the study script.'
        );
      }
      const binary = atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return {
        blob: new Blob([bytes], { type: data.mimeType || 'audio/wav' }),
        filenameExt: 'wav',
      };
    },
    [voice]
  );

  return {
    activeId,
    status,
    speed,
    setSpeed,
    voice,
    setVoice,
    progress,
    error,
    speak,
    stop,
    togglePause,
    fetchTtsAudioClip,
  };
}
