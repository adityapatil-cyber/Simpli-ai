import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, Pause, Play, RotateCcw, Timer, Volume2, X } from 'lucide-react';
import { buildSprintRecapScript, formatSprintClock } from '../utils/simpliLogic';
import type { SavedClarifySession, SimpliAnalysis, VoiceConversation } from '../types/simpli';
import type { useSpeechPlayer } from '../hooks/useSpeechPlayer';

interface StudySprintWidgetProps {
  activeAnalysis: SimpliAnalysis | null;
  clarifySessions: SavedClarifySession[];
  conversations: VoiceConversation[];
  speech: ReturnType<typeof useSpeechPlayer>;
  onOpenQuickReview: () => void;
}

function playGentleChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99]; // calm C major triad
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + idx * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1.45);
    });
  } catch {
    // Audio playback optional if blocked
  }
}

export function StudySprintWidget({
  activeAnalysis,
  clarifySessions,
  conversations,
  speech,
  onOpenQuickReview,
}: StudySprintWidgetProps) {
  const [open, setOpen] = useState(false);
  const [presetMinutes, setPresetMinutes] = useState<10 | 15>(10);
  const [secondsLeft, setSecondsLeft] = useState(10 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [recapReadyText, setRecapReadyText] = useState<string | null>(null);
  const finishedRef = useRef(false);

  const triggerAutoRecap = (manualFinish = false) => {
    setIsRunning(false);
    playGentleChime();
    const script = buildSprintRecapScript({
      activeTopic: activeAnalysis?.detectedTopic,
      activeGist: activeAnalysis?.theGist,
      clarifySessions,
      conversations,
    });
    setRecapReadyText(script);
    setOpen(true);
    if (manualFinish || !finishedRef.current) {
      finishedRef.current = true;
      speech.speak('sprint-auto-recap', script);
    }
  };

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          window.setTimeout(() => triggerAutoRecap(false), 10);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  const handleSelectPreset = (mins: 10 | 15) => {
    finishedRef.current = false;
    setRecapReadyText(null);
    setPresetMinutes(mins);
    setSecondsLeft(mins * 60);
    setIsRunning(false);
  };

  const handleStartPause = () => {
    setRecapReadyText(null);
    if (secondsLeft === 0) {
      setSecondsLeft(presetMinutes * 60);
    }
    finishedRef.current = false;
    setIsRunning((v) => !v);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Toggle gentle study sprint timer"
        className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          isRunning
            ? 'border-[#10B981]/50 bg-[#10B981]/10 text-[#059669] dark:text-[#34D399]'
            : 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 hover:border-[#7C3AED]'
        }`}
      >
        <Timer className="h-3.5 w-3.5" aria-hidden="true" />
        <span className={isRunning ? 'font-mono-tabular' : ''}>
          {isRunning ? formatSprintClock(secondsLeft) : 'Study Sprint'}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Gentle Study Sprint and Auto-Recap"
          className="absolute right-0 top-11 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 shadow-xl space-y-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Bell className="h-4 w-4 text-[#7C3AED]" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Gentle Study Sprint
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close study sprint timer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Calm timer with a soft chime (no harsh alarms) that plays a 30s audio recap when done.
          </p>

          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-3">
            <span className="font-mono-tabular text-2xl font-extrabold text-slate-900 dark:text-white">
              {formatSprintClock(secondsLeft)}
            </span>

            <div className="flex items-center gap-1.5">
              {([10, 15] as const).map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => handleSelectPreset(mins)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                    presetMinutes === mins
                      ? 'bg-[#7C3AED] text-white'
                      : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300'
                  }`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleStartPause}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-3 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
            >
              {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{isRunning ? 'Pause' : secondsLeft === 0 ? 'Restart' : 'Start Sprint'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsRunning(false);
                setSecondsLeft(presetMinutes * 60);
                setRecapReadyText(null);
              }}
              aria-label="Reset sprint timer"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => triggerAutoRecap(true)}
            className="flex w-full h-9 items-center justify-center gap-1.5 rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 px-3 text-xs font-semibold text-[#059669] dark:text-[#34D399] hover:bg-[#10B981]/15 cursor-pointer"
          >
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Finish Early &amp; Play 30s Recap</span>
          </button>

          {recapReadyText && (
            <div className="rounded-xl border border-[#10B981]/30 bg-[#10B981]/[0.06] p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#059669] dark:text-[#34D399]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Sprint Recap Playing</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-zinc-200">
                {recapReadyText}
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenQuickReview();
                }}
                className="text-xs font-semibold text-[#7C3AED] dark:text-[#A78BFA] hover:underline cursor-pointer"
              >
                Open Flashcards in Quick Review →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
