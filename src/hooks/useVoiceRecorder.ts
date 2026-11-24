import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pickSupportedAudioMimeType,
  prepareAudioForTranscription,
} from '../utils/audioUtils';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface UseVoiceRecorderOptions {
  onTranscript: (text: string) => void | Promise<void>;
}

export function useVoiceRecorder({ onTranscript }: UseVoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micError, setMicError] = useState<string | null>(null);

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isRecordingRef = useRef(false);
  const finalSpeechRef = useRef('');
  const interimSpeechRef = useRef('');
  const latestLiveRef = useRef('');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const hasMeterRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const maxPeakRef = useRef(0);

  const cleanupHardware = useCallback(() => {
    isRecordingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // already stopped
      }
      recognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        try {
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      cleanupHardware();
    };
  }, [cleanupHardware]);

  const startRecording = useCallback(async () => {
    setMicError(null);
    setLiveTranscript('');
    finalSpeechRef.current = '';
    interimSpeechRef.current = '';
    latestLiveRef.current = '';
    maxPeakRef.current = 0;
    hasMeterRef.current = false;
    setDurationSec(0);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setMicError(
        'Microphone is unavailable in this browser. Type your message below.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      isRecordingRef.current = true;

      const supportedMime = pickSupportedAudioMimeType();
      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      // Start parallel live SpeechRecognition if supported (instant visual captions + fallback)
      try {
        const win = window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionInstance;
          webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
        };
        const RecognitionCtor =
          win.SpeechRecognition || win.webkitSpeechRecognition;
        if (RecognitionCtor) {
          let committedPrefix = '';
          const rec = new RecognitionCtor();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = navigator.language || 'en-US';
          rec.onresult = (ev) => {
            let sessionFinal = '';
            let sessionInterim = '';
            for (let i = 0; i < ev.results.length; i++) {
              const res = ev.results[i];
              const chunk = res[0]?.transcript ?? '';
              if (res.isFinal) {
                sessionFinal += chunk + ' ';
              } else {
                sessionInterim += chunk;
              }
            }
            finalSpeechRef.current = `${committedPrefix} ${sessionFinal}`.trim();
            interimSpeechRef.current = sessionInterim.trim();
            const combined = `${finalSpeechRef.current} ${interimSpeechRef.current}`.trim();
            if (combined) {
              latestLiveRef.current = combined;
              setLiveTranscript(combined);
            }
          };
          rec.onend = () => {
            if (isRecordingRef.current) {
              committedPrefix = latestLiveRef.current;
              try {
                rec.start();
              } catch {
                // ignore restart race
              }
            }
          };
          rec.onerror = () => {
            // Non-fatal: MediaRecorder + Gemini transcription handles audio cleanly
          };
          rec.start();
          recognitionRef.current = rec;
        }
      } catch {
        // Live speech recognition unavailable in this browser/sandbox; proceed with MediaRecorder
      }

      // Start real-time mic volume meter
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          audioCtxRef.current = ctx;
          hasMeterRef.current = true;

          const data = new Uint8Array(analyser.fftSize);
          const sampleLevel = () => {
            analyser.getByteTimeDomainData(data);
            let peak = 0;
            for (let i = 0; i < data.length; i++) {
              const amp = Math.abs(data[i] - 128) / 128;
              if (amp > peak) peak = amp;
            }
            if (peak > maxPeakRef.current) maxPeakRef.current = peak;
            setAudioLevel(Math.min(100, Math.round(peak * 180)));
            rafRef.current = requestAnimationFrame(sampleLevel);
          };
          rafRef.current = requestAnimationFrame(sampleLevel);
        }
      } catch {
        // Meter unavailable; recording continues normally
      }

      const startTime = Date.now();
      timerRef.current = window.setInterval(() => {
        setDurationSec(Math.floor((Date.now() - startTime) / 1000));
      }, 500);

      recorder.onstop = async () => {
        isRecordingRef.current = false;
        if (recognitionRef.current) {
          try {
            recognitionRef.current.onend = null;
            recognitionRef.current.stop();
          } catch {
            // already stopped
          }
          await new Promise((r) => setTimeout(r, 150));
          recognitionRef.current = null;
        }

        const liveCaptured =
          latestLiveRef.current ||
          `${finalSpeechRef.current} ${interimSpeechRef.current}`.trim();
        const peakObserved = maxPeakRef.current;
        const meterActive = hasMeterRef.current;
        cleanupHardware();

        const blobMime =
          recorder.mimeType || supportedMime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: blobMime });

        if (blob.size < 100 && !liveCaptured) {
          setMicError(
            'Recording was too short — hold or speak for at least a second before stopping.'
          );
          setLiveTranscript('');
          return;
        }

        if (meterActive && peakObserved === 0 && !liveCaptured) {
          setMicError(
            'No sound was picked up by your microphone — check your mic mute switch or browser input device.'
          );
          setLiveTranscript('');
          return;
        }

        setIsTranscribing(true);
        try {
          let finalText = '';
          if (blob.size >= 100) {
            const { audioBase64, mimeType } =
              await prepareAudioForTranscription(blob);

            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64, mimeType }),
            });
            const data = (await res.json()) as {
              text?: string;
              error?: string;
            };
            if (res.ok && data.text?.trim()) {
              finalText = data.text.trim();
            } else if (!res.ok && !liveCaptured) {
              throw new Error(data.error || 'Transcription failed');
            }
          }

          if (!finalText && liveCaptured) {
            finalText = liveCaptured;
          }

          if (finalText) {
            await onTranscriptRef.current(finalText);
          } else {
            setMicError(
              'No speech detected — check your selected microphone or try speaking a bit louder.'
            );
          }
          setLiveTranscript('');
        } catch (err) {
          if (liveCaptured) {
            await onTranscriptRef.current(liveCaptured);
            setLiveTranscript('');
          } else {
            setLiveTranscript('');
            setMicError(
              err instanceof Error
                ? err.message
                : 'Could not transcribe recorded audio.'
            );
          }
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      cleanupHardware();
      setIsRecording(false);
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setMicError(
          'No microphone detected on this device. Plug in a mic or type below.'
        );
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setMicError(
          'Your microphone is busy in another app. Close it or type below.'
        );
      } else {
        setMicError(
          'Microphone access denied. Allow mic permission in your browser bar or type below.'
        );
      }
    }
  }, [cleanupHardware]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  return {
    isRecording,
    isTranscribing,
    audioLevel,
    durationSec,
    liveTranscript,
    micError,
    setMicError,
    startRecording,
    stopRecording,
  };
}
