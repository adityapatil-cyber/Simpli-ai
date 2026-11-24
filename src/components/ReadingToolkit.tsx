import { useMemo, useState } from 'react';
import {
  AlignJustify,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  HelpCircle,
  Loader2,
  MousePointerClick,
  Sparkles,
  Type as TypeIcon,
  Volume2,
  X,
} from 'lucide-react';
import {
  cleanWordForLookup,
  estimateWordIndexFromProgress,
  splitWordTokens,
  stripDisplayMarkdown,
} from '../utils/simpliLogic';
import { JargonText } from './JargonText';
import type {
  BrainModeId,
  JargonTerm,
  MicroCheckQuestion,
  ReadingPreferences,
  ReadingSurfaceTint,
  WordDefinition,
} from '../types/simpli';
import type { useSpeechPlayer } from '../hooks/useSpeechPlayer';

export function getReadingSurfaceClasses(tint: ReadingSurfaceTint): string {
  switch (tint) {
    case 'cream':
      return 'bg-[#FDF8EC] dark:bg-[#221F17] border-[#E8DEC3] dark:border-[#3D3624]';
    case 'sage':
      return 'bg-[#F0F7F2] dark:bg-[#16221C] border-[#CDE2D3] dark:border-[#273D31]';
    case 'blue':
      return 'bg-[#EEF5FC] dark:bg-[#151E2B] border-[#C8DCF2] dark:border-[#25364D]';
    default:
      return 'bg-white dark:bg-zinc-900/80 border-slate-200/90 dark:border-zinc-800';
  }
}

export function getReadingTextStyleClasses(prefs: ReadingPreferences): string {
  return [
    prefs.dyslexiaFont ? 'font-dyslexia' : '',
    prefs.wideSpacing ? 'reading-wide-spacing' : 'leading-relaxed',
  ]
    .filter(Boolean)
    .join(' ');
}

interface ReadingSupportBarProps {
  prefs: ReadingPreferences;
  onChange: (next: ReadingPreferences) => void;
  focusIndex: number;
  totalFocusSteps: number;
  onStepFocus: (delta: number) => void;
  hasMultiChunks: boolean;
}

const TINT_OPTIONS: Array<{ id: ReadingSurfaceTint; label: string; swatch: string }> = [
  { id: 'default', label: 'Default', swatch: 'bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700' },
  { id: 'cream', label: 'Warm Cream', swatch: 'bg-[#FDF8EC] border-[#D9C89E]' },
  { id: 'sage', label: 'Sage', swatch: 'bg-[#F0F7F2] border-[#A7D3B4]' },
  { id: 'blue', label: 'Soft Blue', swatch: 'bg-[#EEF5FC] border-[#A6CAEE]' },
];

export function ReadingSupportBar({
  prefs,
  onChange,
  focusIndex,
  totalFocusSteps,
  onStepFocus,
  hasMultiChunks,
}: ReadingSupportBarProps) {
  const toggle = (key: keyof Omit<ReadingPreferences, 'surfaceTint'>) => {
    onChange({ ...prefs, [key]: !prefs[key] });
  };

  return (
    <div
      role="region"
      aria-label="Dyslexia and comfort reading options"
      className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-slate-50/90 dark:bg-zinc-900/90 p-3.5 sm:p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200">
          Optional Reading Comfort Bar
        </span>

        <button
          type="button"
          onClick={() =>
            onChange({
              dyslexiaFont: false,
              wideSpacing: false,
              surfaceTint: 'default',
              focusRuler: false,
              tapToDefine: false,
              chunkMode: false,
            })
          }
          className="text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white cursor-pointer"
        >
          Reset defaults
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={prefs.dyslexiaFont}
          onClick={() => toggle('dyslexiaFont')}
          className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            prefs.dyslexiaFont
              ? 'bg-[#7C3AED] text-white'
              : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300'
          }`}
        >
          <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Dyslexia Font</span>
        </button>

        <button
          type="button"
          aria-pressed={prefs.wideSpacing}
          onClick={() => toggle('wideSpacing')}
          className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            prefs.wideSpacing
              ? 'bg-[#7C3AED] text-white'
              : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300'
          }`}
        >
          <AlignJustify className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Wide Spacing</span>
        </button>

        <button
          type="button"
          aria-pressed={prefs.focusRuler}
          onClick={() => toggle('focusRuler')}
          className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            prefs.focusRuler
              ? 'bg-[#3B82F6] text-white'
              : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300'
          }`}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Focus Ruler + Word-Sync</span>
        </button>

        <button
          type="button"
          aria-pressed={prefs.tapToDefine}
          onClick={() => toggle('tapToDefine')}
          className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            prefs.tapToDefine
              ? 'bg-[#10B981] text-white'
              : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300'
          }`}
        >
          <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Tap-to-Define Words</span>
        </button>

        {hasMultiChunks && (
          <button
            type="button"
            aria-pressed={prefs.chunkMode}
            onClick={() => toggle('chunkMode')}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              prefs.chunkMode
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Bite-Sized Stepper</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-200/70 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
            Paper Tint:
          </span>
          {TINT_OPTIONS.map((opt) => {
            const active = prefs.surfaceTint === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...prefs, surfaceTint: opt.id })}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium cursor-pointer border ${
                  active
                    ? 'border-[#7C3AED] ring-1 ring-[#7C3AED]/30 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-zinc-700 bg-white/70 dark:bg-zinc-950/60 text-slate-600 dark:text-zinc-400'
                }`}
              >
                <span className={`h-3 w-3 rounded-full border ${opt.swatch}`} aria-hidden="true" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {prefs.focusRuler && totalFocusSteps > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono-tabular">
              Ruler {focusIndex + 1}/{totalFocusSteps}
            </span>
            <button
              type="button"
              onClick={() => onStepFocus(-1)}
              aria-label="Previous focus line"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-200 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onStepFocus(1)}
              aria-label="Next focus line"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-200 cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface InteractiveReadingTextProps {
  text: string;
  clipId: string;
  prefs: ReadingPreferences;
  speech: ReturnType<typeof useSpeechPlayer>;
  definitionCache: Record<string, WordDefinition>;
  onLookupWord: (word: string, context: string) => Promise<WordDefinition | null>;
  jargonGlossary?: JargonTerm[];
}

export function InteractiveReadingText({
  text,
  clipId,
  prefs,
  speech,
  definitionCache,
  onLookupWord,
  jargonGlossary = [],
}: InteractiveReadingTextProps) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [loadingWord, setLoadingWord] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const words = useMemo(() => splitWordTokens(text), [text]);
  const isPlayingThis =
    speech.activeId === clipId &&
    (speech.status === 'playing' || speech.status === 'paused');

  const activeWordIdx = isPlayingThis
    ? estimateWordIndexFromProgress(words.length, speech.progress)
    : -1;

  const textStyle = getReadingTextStyleClasses(prefs);

  if (!prefs.tapToDefine && !isPlayingThis) {
    return (
      <p className={`text-sm text-slate-700 dark:text-zinc-300 ${textStyle}`}>
        <JargonText text={text} glossary={jargonGlossary} />
      </p>
    );
  }

  const handleWordClick = async (token: string) => {
    if (!prefs.tapToDefine) return;
    const cleaned = cleanWordForLookup(token);
    if (!cleaned) return;
    setLookupError(null);
    setSelectedWord(cleaned);
    if (!definitionCache[cleaned.toLowerCase()]) {
      setLoadingWord(cleaned);
      const result = await onLookupWord(cleaned, text);
      setLoadingWord(null);
      if (!result) {
        setLookupError('Could not load definition right now.');
      }
    }
  };

  const activeDef = selectedWord
    ? definitionCache[selectedWord.toLowerCase()]
    : undefined;

  return (
    <div className="space-y-2.5">
      <p className={`text-sm text-slate-700 dark:text-zinc-300 ${textStyle}`}>
        {words.map((token, idx) => {
          const isWordActive = isPlayingThis && idx === activeWordIdx;
          const cleaned = cleanWordForLookup(token);
          const canTap = prefs.tapToDefine && cleaned.length > 1;
          return (
            <span key={`${idx}-${token}`}>
              {canTap ? (
                <button
                  type="button"
                  onClick={() => handleWordClick(token)}
                  className={`inline rounded px-0.5 transition-colors cursor-pointer ${
                    isWordActive
                      ? 'bg-[#7C3AED] text-white font-semibold'
                      : selectedWord?.toLowerCase() === cleaned.toLowerCase()
                      ? 'bg-[#10B981]/20 text-slate-900 dark:text-white underline decoration-[#10B981]'
                      : 'underline decoration-dotted decoration-slate-400/70 hover:bg-[#7C3AED]/10'
                  }`}
                >
                  {token}
                </button>
              ) : (
                <span
                  className={
                    isWordActive
                      ? 'rounded bg-[#7C3AED] px-0.5 text-white font-semibold'
                      : ''
                  }
                >
                  {token}
                </span>
              )}
              {idx < words.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </p>

      {selectedWord && prefs.tapToDefine && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#10B981]/35 bg-[#10B981]/[0.07] dark:bg-[#10B981]/15 px-3 py-2 text-xs"
        >
          <div className="min-w-0 flex-1">
            <span className="font-bold text-slate-900 dark:text-white">
              {selectedWord}
            </span>
            {activeDef?.pronunciation && (
              <span className="ml-1.5 font-mono-tabular text-[11px] text-slate-500 dark:text-zinc-400">
                ({activeDef.pronunciation})
              </span>
            )}
            <span className="ml-2 text-slate-700 dark:text-zinc-200">
              {loadingWord === selectedWord
                ? 'Looking up plain meaning...'
                : lookupError || activeDef?.definition}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => speech.speak(`define-${selectedWord}`, selectedWord)}
              aria-label={`Pronounce ${selectedWord}`}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 text-[11px] font-medium text-slate-700 dark:text-zinc-200 cursor-pointer"
            >
              <Volume2 className="h-3 w-3 text-[#7C3AED]" />
              <span>Say it</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedWord(null)}
              aria-label="Close definition"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface MicroCheckCardProps {
  topic: string;
  theGist: string;
  brainMode: BrainModeId;
  speech: ReturnType<typeof useSpeechPlayer>;
}

export function MicroCheckCard({
  topic,
  theGist,
  brainMode,
  speech,
}: MicroCheckCardProps) {
  const [questionData, setQuestionData] = useState<MicroCheckQuestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLoadCheck = async () => {
    setIsLoading(true);
    setError(null);
    setSelectedIdx(null);
    try {
      const res = await fetch('/api/micro-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, theGist, brainMode }),
      });
      const data = (await res.json()) as MicroCheckQuestion & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not create quick check.');
      setQuestionData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load quick check.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!questionData && !isLoading) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-300">
          <HelpCircle className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
          <span>Optional: want a calm 1-tap check to see if it clicked?</span>
        </div>
        <button
          type="button"
          onClick={handleLoadCheck}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-xs font-semibold text-slate-800 dark:text-zinc-100 hover:border-[#10B981] transition-colors cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
          <span>Did It Click? (Optional)</span>
        </button>
        {error && <p className="w-full text-xs text-amber-700 dark:text-amber-300">{error}</p>}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-4 flex items-center gap-2.5 text-xs text-slate-600 dark:text-zinc-300">
        <Loader2 className="h-4 w-4 animate-spin text-[#10B981]" aria-hidden="true" />
        <span>Building a quick, low-pressure check...</span>
      </div>
    );
  }

  if (!questionData) return null;

  const isCorrect = selectedIdx === questionData.correctIndex;

  return (
    <div className="rounded-2xl border border-[#10B981]/30 bg-[#10B981]/[0.05] dark:bg-[#10B981]/10 p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-[#059669] dark:text-[#34D399]">
          ✨ Quick &ldquo;Did It Click?&rdquo; Check (No grades, no timer)
        </span>
        <button
          type="button"
          onClick={() => speech.speak('micro-check-q', questionData.question)}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 text-[11px] font-medium text-slate-600 dark:text-zinc-300 cursor-pointer"
        >
          <Volume2 className="h-3 w-3" />
          <span>Hear</span>
        </button>
      </div>

      <p className="text-sm font-semibold text-slate-900 dark:text-white">
        {questionData.question}
      </p>

      <div className="grid grid-cols-1 gap-2">
        {questionData.options.map((opt, idx) => {
          const picked = selectedIdx === idx;
          const rightChoice = idx === questionData.correctIndex;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs sm:text-sm transition-colors cursor-pointer ${
                picked && rightChoice
                  ? 'border-[#10B981] bg-[#10B981]/15 text-slate-900 dark:text-white font-semibold'
                  : picked
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-slate-800 dark:text-zinc-200'
                  : 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-200 hover:border-[#7C3AED]/50'
              }`}
            >
              <span>{opt}</span>
              {picked && rightChoice && (
                <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {selectedIdx !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/80 dark:bg-zinc-950/80 px-3.5 py-2.5 text-xs">
          <p className="text-slate-700 dark:text-zinc-200">
            {isCorrect
              ? `✅ ${questionData.encouragingFeedback}`
              : `💡 Gentle hint: ${questionData.gentleHint}`}
          </p>
          <button
            type="button"
            onClick={handleLoadCheck}
            className="text-xs font-semibold text-[#7C3AED] dark:text-[#A78BFA] hover:underline cursor-pointer"
          >
            Try another
          </button>
        </div>
      )}
    </div>
  );
}
