import { useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  HandHeart,
  ImagePlus,
  ListChecks,
  Loader2,
  Mic,
  MicOff,
  PenLine,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import {
  assembleStarterAnswer,
  parseTemplateParts,
} from '../utils/simpliLogic';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import type {
  BrainModeId,
  HandwritingCheckResult,
  MicroStepItem,
  SentenceStarterItem,
  SimpliAnalysis,
  WritingAssistResult,
  WritingDraftFormat,
} from '../types/simpli';
import type { useSpeechPlayer } from '../hooks/useSpeechPlayer';

type WritingSubTab =
  | 'talk-to-write'
  | 'handwriting-check'
  | 'sentence-starters'
  | 'micro-chunker';

interface WritingStudioViewProps {
  brainMode: BrainModeId;
  activeAnalysis: SimpliAnalysis | null;
  speech: ReturnType<typeof useSpeechPlayer>;
}

export function WritingStudioView({
  brainMode,
  activeAnalysis,
  speech,
}: WritingStudioViewProps) {
  const [subTab, setSubTab] = useState<WritingSubTab>('talk-to-write');

  // 1. Talk-to-Write State
  const [rawThoughts, setRawThoughts] = useState('');
  const [draftFormat, setDraftFormat] = useState<WritingDraftFormat>('sentences');
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftResult, setDraftResult] = useState<WritingAssistResult | null>(null);
  const [talkError, setTalkError] = useState<string | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);

  const {
    isRecording,
    isTranscribing,
    audioLevel,
    durationSec,
    liveTranscript,
    micError: talkMicError,
    setMicError: setTalkMicError,
    startRecording: startTalkMic,
    stopRecording: stopTalkMic,
  } = useVoiceRecorder({
    onTranscript: (text) => {
      setRawThoughts((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
    },
  });

  // 2. Handwriting & Draft Photo Check State
  const hwFileInputRef = useRef<HTMLInputElement | null>(null);
  const [hwFile, setHwFile] = useState<{
    name: string;
    mimeType: string;
    base64: string;
    previewUrl?: string;
  } | null>(null);
  const [hwText, setHwText] = useState('');
  const [isCheckingHw, setIsCheckingHw] = useState(false);
  const [hwResult, setHwResult] = useState<HandwritingCheckResult | null>(null);
  const [hwError, setHwError] = useState<string | null>(null);

  // 3. Sentence Starters State
  const [starterPrompt, setStarterPrompt] = useState('');
  const [isLoadingStarters, setIsLoadingStarters] = useState(false);
  const [detectedQuestion, setDetectedQuestion] = useState<string | null>(null);
  const [starters, setStarters] = useState<SentenceStarterItem[]>([]);
  const [blankValues, setBlankValues] = useState<Record<string, Record<number, string>>>({});
  const [starterError, setStarterError] = useState<string | null>(null);
  const [copiedStarterIdx, setCopiedStarterIdx] = useState<number | null>(null);

  // 4. Feature 2: Assignment & Worksheet "Micro-Step Chunker" (Anti-Freeze Checklist)
  const chunkFileRef = useRef<HTMLInputElement | null>(null);
  const [chunkPrompt, setChunkPrompt] = useState('');
  const [chunkFile, setChunkFile] = useState<{
    name: string;
    mimeType: string;
    base64: string;
    previewUrl?: string;
  } | null>(null);
  const [isChunkLoading, setIsChunkLoading] = useState(false);
  const [chunkTitle, setChunkTitle] = useState<string | null>(null);
  const [microSteps, setMicroSteps] = useState<MicroStepItem[]>([]);
  const [activeMicroIdx, setActiveMicroIdx] = useState(0);
  const [completedStepNums, setCompletedStepNums] = useState<number[]>([]);
  const [showAllMicroSteps, setShowAllMicroSteps] = useState(false);
  const [chunkError, setChunkError] = useState<string | null>(null);

  const readChunkFile = (file: File) => {
    setChunkError(null);
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isImage && !isPdf) {
      setChunkError('Please upload an assignment photo or PDF.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setChunkFile({
        name: file.name,
        mimeType: isPdf ? 'application/pdf' : file.type || 'image/png',
        base64: result,
        previewUrl: isImage ? result : undefined,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleBuildMicroSteps = async (overridePrompt?: string) => {
    const promptToUse = overridePrompt ?? chunkPrompt;
    if (!promptToUse.trim() && !chunkFile) {
      setChunkError('Paste an assignment prompt or upload a worksheet/rubric first.');
      return;
    }
    setChunkError(null);
    setIsChunkLoading(true);
    try {
      const res = await fetch('/api/micro-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptText: promptToUse,
          fileBase64: chunkFile?.base64,
          mimeType: chunkFile?.mimeType,
          brainMode,
        }),
      });
      const data = (await res.json()) as {
        assignmentTitle?: string;
        steps?: MicroStepItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Could not break down assignment.');
      setChunkTitle(data.assignmentTitle || 'Your Micro-Step Plan');
      setMicroSteps(data.steps ?? []);
      setActiveMicroIdx(0);
      setCompletedStepNums([]);
      setShowAllMicroSteps(false);
    } catch (err) {
      setChunkError(err instanceof Error ? err.message : 'Unable to generate micro-steps.');
    } finally {
      setIsChunkLoading(false);
    }
  };

  const handleGenerateCleanDraft = async () => {
    if (!rawThoughts.trim()) {
      setTalkError('Speak or type any messy thoughts first.');
      return;
    }
    setTalkError(null);
    setTalkMicError(null);
    setIsDrafting(true);
    try {
      const res = await fetch('/api/writing-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawThoughts, format: draftFormat, brainMode }),
      });
      const data = (await res.json()) as WritingAssistResult & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not organize thoughts.');
      setDraftResult(data);
    } catch (err) {
      setTalkError(err instanceof Error ? err.message : 'Unable to clean up draft.');
    } finally {
      setIsDrafting(false);
    }
  };

  const readHwFile = (file: File) => {
    setHwError(null);
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isImage && !isPdf) {
      setHwError('Please upload a handwritten photo or PDF.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setHwFile({
        name: file.name,
        mimeType: isPdf ? 'application/pdf' : file.type || 'image/png',
        base64: result,
        previewUrl: isImage ? result : undefined,
      });
    };
    reader.readAsDataURL(file);
  };

  const loadSampleHandwrittenNotes = async () => {
    setHwError(null);
    try {
      const res = await fetch('/src/assets/images/sample_economics_notes_1794854224765.jpg');
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setHwFile({
          name: 'Handwritten Economics Notes.jpg',
          mimeType: blob.type || 'image/jpeg',
          base64: result,
          previewUrl: result,
        });
      };
      reader.readAsDataURL(blob);
    } catch {
      setHwError('Could not load sample photo.');
    }
  };

  const handleCheckHandwriting = async () => {
    if (!hwFile && !hwText.trim()) {
      setHwError('Upload a photo of your handwriting or paste a draft first.');
      return;
    }
    setHwError(null);
    setIsCheckingHw(true);
    try {
      const res = await fetch('/api/writing-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: hwFile?.base64,
          mimeType: hwFile?.mimeType,
          draftText: hwText,
        }),
      });
      const data = (await res.json()) as HandwritingCheckResult & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not check writing.');
      setHwResult(data);
    } catch (err) {
      setHwError(err instanceof Error ? err.message : 'Unable to check draft.');
    } finally {
      setIsCheckingHw(false);
    }
  };

  const handleGenerateStarters = async (overridePrompt?: string) => {
    const promptToUse = overridePrompt ?? starterPrompt;
    if (!promptToUse.trim()) {
      setStarterError('Enter your worksheet question or essay prompt first.');
      return;
    }
    setStarterError(null);
    setIsLoadingStarters(true);
    try {
      const res = await fetch('/api/sentence-starters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptText: promptToUse }),
      });
      const data = (await res.json()) as {
        detectedQuestion?: string;
        starters?: SentenceStarterItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Could not build starters.');
      setDetectedQuestion(data.detectedQuestion ?? promptToUse);
      setStarters(data.starters ?? []);
      setBlankValues({});
    } catch (err) {
      setStarterError(err instanceof Error ? err.message : 'Unable to generate starters.');
    } finally {
      setIsLoadingStarters(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                Writing Support Studio
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                Optional tools designed to beat blank-page freeze, dysgraphia, and spelling overwhelm.
              </p>
            </div>
          </div>

          {/* Segmented Writing Tool Switcher */}
          <div
            role="tablist"
            aria-label="Writing support tools"
            className="mt-2 inline-flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/70 p-1.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'talk-to-write'}
              onClick={() => setSubTab('talk-to-write')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                subTab === 'talk-to-write'
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Mic className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden="true" />
              <span>Talk-to-Write</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'handwriting-check'}
              onClick={() => setSubTab('handwriting-check')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                subTab === 'handwriting-check'
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <HandHeart className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
              <span>Handwriting &amp; Draft Helper</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'sentence-starters'}
              onClick={() => setSubTab('sentence-starters')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                subTab === 'sentence-starters'
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <PenLine className="h-3.5 w-3.5 text-[#3B82F6]" aria-hidden="true" />
              <span>Sentence Starters</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'micro-chunker'}
              onClick={() => setSubTab('micro-chunker')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                subTab === 'micro-chunker'
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ListChecks className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden="true" />
              <span>Micro-Step Chunker</span>
            </button>
          </div>
        </div>

        {/* TOOL 1: TALK-TO-WRITE */}
        {subTab === 'talk-to-write' && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Voice → Clean Draft
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Ramble out loud or dump rough notes. Simpli keeps your voice and fixes only flow &amp; spelling.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={isRecording ? stopTalkMic : startTalkMic}
                  disabled={isTranscribing}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-semibold text-white cursor-pointer ${
                    isRecording
                      ? 'bg-red-600'
                      : 'bg-gradient-to-r from-[#7C3AED] to-[#3B82F6]'
                  }`}
                >
                  {isTranscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                  <span>
                    {isTranscribing
                      ? 'Transcribing...'
                      : isRecording
                      ? 'Stop Mic'
                      : 'Speak Messy Ideas'}
                  </span>
                </button>
              </div>

              {(isRecording || isTranscribing) && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#7C3AED]/25 bg-[#7C3AED]/8 dark:bg-[#7C3AED]/15 px-4 py-2 text-xs text-slate-700 dark:text-zinc-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                        isRecording ? 'bg-red-500 animate-pulse' : 'bg-[#7C3AED] animate-pulse'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="font-semibold shrink-0">
                      {isTranscribing
                        ? 'Transcribing...'
                        : `Listening · ${durationSec}s`}
                    </span>
                    {liveTranscript && (
                      <span className="truncate italic text-slate-600 dark:text-zinc-300">
                        “{liveTranscript}”
                      </span>
                    )}
                  </div>
                  {isRecording && (
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-700 shrink-0" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#10B981] transition-all duration-75"
                        style={{ width: `${Math.max(8, audioLevel)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              <textarea
                rows={4}
                value={
                  isRecording && liveTranscript
                    ? rawThoughts.trim()
                      ? `${rawThoughts.trim()} ${liveTranscript}`
                      : liveTranscript
                    : rawThoughts
                }
                onChange={(e) => setRawThoughts(e.target.value)}
                readOnly={isRecording}
                aria-label="Messy ideas or spoken draft"
                placeholder="Example: okay so like plants need sun and water and then they make sugar in the green part chloroplast i think..."
                className="w-full rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-950 p-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-[#7C3AED] focus:outline-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: 'sentences', label: 'Clean Sentences' },
                      { id: 'bullets', label: 'Bullet Outline' },
                      { id: 'paragraph', label: 'Structured Paragraph' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDraftFormat(opt.id)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-medium cursor-pointer ${
                        draftFormat === opt.id
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-600 dark:text-zinc-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={isDrafting}
                  onClick={handleGenerateCleanDraft}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] px-5 text-xs sm:text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                >
                  {isDrafting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span>Turn into Clean Draft</span>
                </button>
              </div>

              {(talkError || talkMicError) && (
                <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  {talkError || talkMicError}
                </p>
              )}
            </div>

            {draftResult && (
              <div className="rounded-3xl border border-[#10B981]/30 bg-white dark:bg-zinc-900 p-5 sm:p-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#059669] dark:text-[#34D399]">
                    ✓ {draftResult.preservedVoiceNote}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => speech.speak('talk-draft', draftResult.cleanDraft)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 px-3 text-xs font-medium text-slate-700 dark:text-zinc-200 cursor-pointer"
                    >
                      <Volume2 className="h-3.5 w-3.5 text-[#7C3AED]" />
                      <span>Hear</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(draftResult.cleanDraft);
                        setCopiedDraft(true);
                        setTimeout(() => setCopiedDraft(false), 1800);
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-3 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                    >
                      {copiedDraft ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedDraft ? 'Copied' : 'Copy Draft'}</span>
                    </button>
                  </div>
                </div>
                <p className="text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-zinc-100">
                  {draftResult.cleanDraft}
                </p>
              </div>
            )}
          </div>
        )}

        {/* TOOL 2: HANDWRITING & DRAFT PHOTO CHECK */}
        {subTab === 'handwriting-check' && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Handwriting &amp; Draft Helper
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Snap handwritten work or paste a draft. Simpli celebrates what&apos;s clear first, then offers kind fixes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadSampleHandwrittenNotes}
                  className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:border-[#7C3AED] cursor-pointer"
                >
                  Try Handwritten Sample
                </button>
              </div>

              <input
                ref={hwFileInputRef}
                type="file"
                accept="image/*,application/pdf"
                aria-label="Upload handwritten photo or PDF draft"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) readHwFile(picked);
                  e.target.value = '';
                }}
                className="sr-only"
              />

              {hwFile ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 p-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    {hwFile.previewUrl ? (
                      <img
                        src={hwFile.previewUrl}
                        alt={hwFile.name}
                        className="h-14 w-20 rounded-xl object-cover border border-slate-200 dark:border-zinc-700 shrink-0"
                      />
                    ) : (
                      <FileText className="h-8 w-8 text-[#7C3AED] shrink-0" />
                    )}
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-zinc-100">
                      {hwFile.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHwFile(null)}
                    aria-label="Remove uploaded draft"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-red-500 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => hwFileInputRef.current?.click()}
                  className="flex w-full min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 dark:border-zinc-700 bg-slate-50/60 dark:bg-zinc-950/60 p-5 text-center hover:border-[#10B981] cursor-pointer"
                >
                  <ImagePlus className="h-6 w-6 text-[#10B981]" aria-hidden="true" />
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-zinc-200">
                    Upload photo of handwritten answers or essay draft
                  </span>
                </button>
              )}

              <textarea
                rows={3}
                value={hwText}
                onChange={(e) => setHwText(e.target.value)}
                placeholder="Optional: or paste typed text to get gentle feedback..."
                className="w-full rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-950 p-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-[#10B981] focus:outline-none"
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isCheckingHw}
                  onClick={handleCheckHandwriting}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 dark:bg-white px-5 text-xs sm:text-sm font-semibold text-white dark:text-slate-900 hover:bg-[#10B981] dark:hover:bg-[#10B981] dark:hover:text-white cursor-pointer disabled:opacity-50"
                >
                  {isCheckingHw ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandHeart className="h-4 w-4" />}
                  <span>Check Gently</span>
                </button>
              </div>

              {hwError && (
                <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  {hwError}
                </p>
              )}
            </div>

            {hwResult && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-[#10B981]/30 bg-[#10B981]/[0.05] dark:bg-[#10B981]/10 p-5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-[#059669] dark:text-[#34D399]">
                      ✓ What&apos;s Already Clear
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        speech.speak(
                          'hw-feedback',
                          `What is working well: ${hwResult.whatsWorkingWell.join('. ')}. Clean version: ${hwResult.improvedVersion}`
                        )
                      }
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 text-[11px] font-medium cursor-pointer"
                    >
                      <Volume2 className="h-3 w-3" />
                      <span>Hear</span>
                    </button>
                  </div>
                  <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-zinc-200">
                    {hwResult.whatsWorkingWell.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-2">
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Transcribed Draft
                  </h3>
                  <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-zinc-300 whitespace-pre-wrap">
                    {hwResult.transcription}
                  </p>
                </div>

                <div className="md:col-span-2 rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-3">
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Gentle Clarity &amp; Spelling Swaps
                  </h3>
                  {hwResult.gentleSuggestions.length === 0 ? (
                    <p className="text-xs text-slate-500">Everything reads clearly as written.</p>
                  ) : (
                    <div className="space-y-2">
                      {hwResult.gentleSuggestions.map((s, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3.5 py-2.5 text-xs"
                        >
                          <span className="text-slate-500 line-through">{s.original}</span>
                          <span className="mx-2 text-[#7C3AED] font-bold">→</span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {s.suggestion}
                          </span>
                          <span className="ml-2 text-slate-500 dark:text-zinc-400">
                            ({s.reason})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-xl bg-slate-50 dark:bg-zinc-950 p-3.5 border border-slate-200/80 dark:border-zinc-800">
                    <p className="text-[11px] font-semibold text-slate-500 mb-1">
                      Polished Ready-to-Use Version
                    </p>
                    <p className="text-sm text-slate-800 dark:text-zinc-100 leading-relaxed">
                      {hwResult.improvedVersion}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TOOL 3: LOW-FRICTION SENTENCE STARTERS */}
        {subTab === 'sentence-starters' && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Low-Friction Sentence Starters
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Paste a worksheet question to get 3 fill-in-the-blank scaffolds so starting feels effortless.
                  </p>
                </div>

                {activeAnalysis && (
                  <button
                    type="button"
                    onClick={() => {
                      const q = `${activeAnalysis.detectedTopic}: ${activeAnalysis.theGist}`;
                      setStarterPrompt(q);
                      handleGenerateStarters(q);
                    }}
                    className="rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/8 px-3 py-1.5 text-xs font-semibold text-[#7C3AED] dark:text-[#A78BFA] cursor-pointer"
                  >
                    Use Active Clarify Topic
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  value={starterPrompt}
                  onChange={(e) => setStarterPrompt(e.target.value)}
                  placeholder="Example: Explain how supply shifts affect equilibrium price..."
                  className="h-11 w-full sm:flex-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-950 px-3.5 text-sm text-slate-900 dark:text-white focus:border-[#3B82F6] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={isLoadingStarters}
                  onClick={() => handleGenerateStarters()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] px-5 text-xs sm:text-sm font-semibold text-white cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {isLoadingStarters ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                  <span>Generate Starters</span>
                </button>
              </div>

              {starterError && (
                <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  {starterError}
                </p>
              )}
            </div>

            {starters.length > 0 && (
              <div className="space-y-3">
                {detectedQuestion && (
                  <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                    Scaffolds for: {detectedQuestion}
                  </p>
                )}

                {starters.map((item, sIdx) => {
                  const parts = parseTemplateParts(item.template);
                  const values = blankValues[sIdx] ?? {};
                  const assembled = assembleStarterAnswer(item.template, values);
                  let blankCounter = 0;

                  return (
                    <div
                      key={sIdx}
                      className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#3B82F6]">
                          {item.label}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => speech.speak(`starter-${sIdx}`, assembled)}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-700 px-2.5 text-[11px] font-medium cursor-pointer"
                          >
                            <Volume2 className="h-3 w-3 text-[#7C3AED]" />
                            <span>Hear</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(assembled);
                              setCopiedStarterIdx(sIdx);
                              setTimeout(() => setCopiedStarterIdx(null), 1500);
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-lg bg-slate-900 dark:bg-white px-2.5 text-[11px] font-semibold text-white dark:text-slate-900 cursor-pointer"
                          >
                            {copiedStarterIdx === sIdx ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            <span>{copiedStarterIdx === sIdx ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-sm leading-loose text-slate-800 dark:text-zinc-100">
                        {parts.map((part, pIdx) => {
                          if (part.type === 'text') {
                            return <span key={pIdx}>{part.value}</span>;
                          }
                          const bIdx = blankCounter;
                          blankCounter += 1;
                          return (
                            <input
                              key={pIdx}
                              type="text"
                              value={values[bIdx] ?? ''}
                              onChange={(e) =>
                                setBlankValues((prev) => ({
                                  ...prev,
                                  [sIdx]: {
                                    ...(prev[sIdx] ?? {}),
                                    [bIdx]: e.target.value,
                                  },
                                }))
                              }
                              aria-label={`${item.label} blank ${bIdx + 1}`}
                              placeholder="fill in..."
                              className="inline-block min-w-[110px] max-w-[200px] rounded-lg border border-[#3B82F6]/50 bg-[#3B82F6]/[0.06] dark:bg-[#3B82F6]/15 px-2.5 py-0.5 text-sm font-medium text-slate-900 dark:text-white focus:border-[#7C3AED] focus:outline-none"
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TOOL 4: ASSIGNMENT & WORKSHEET "MICRO-STEP CHUNKER" */}
        {subTab === 'micro-chunker' && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Assignment &amp; Worksheet Micro-Step Chunker
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Turns overwhelming prompts into tiny 2-minute steps—showing only one active step at a time.
                  </p>
                </div>

                {activeAnalysis && (
                  <button
                    type="button"
                    onClick={() => {
                      const q = `${activeAnalysis.detectedTopic}: ${activeAnalysis.theGist}`;
                      setChunkPrompt(q);
                      handleBuildMicroSteps(q);
                    }}
                    className="rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/8 px-3 py-1.5 text-xs font-semibold text-[#7C3AED] dark:text-[#A78BFA] cursor-pointer"
                  >
                    Use Active Clarify Topic
                  </button>
                )}
              </div>

              <input
                ref={chunkFileRef}
                type="file"
                accept="image/*,application/pdf"
                aria-label="Upload assignment sheet, rubric, or lab prompt"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) readChunkFile(picked);
                  e.target.value = '';
                }}
                className="sr-only"
              />

              {chunkFile ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {chunkFile.previewUrl ? (
                      <img
                        src={chunkFile.previewUrl}
                        alt={chunkFile.name}
                        className="h-12 w-16 rounded-lg object-cover border border-slate-200 dark:border-zinc-700 shrink-0"
                      />
                    ) : (
                      <FileText className="h-6 w-6 text-[#7C3AED] shrink-0" />
                    )}
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-zinc-100">
                      {chunkFile.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChunkFile(null)}
                    aria-label="Remove assignment file"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-red-500 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => chunkFileRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-950 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:border-[#7C3AED] cursor-pointer"
                >
                  <ImagePlus className="h-4 w-4 text-[#7C3AED]" aria-hidden="true" />
                  <span>Optional: Upload rubric or worksheet photo/PDF</span>
                </button>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5">
                <textarea
                  rows={2}
                  value={chunkPrompt}
                  onChange={(e) => setChunkPrompt(e.target.value)}
                  aria-label="Assignment prompt or task description"
                  placeholder="Example: Write a 3-page lab report comparing photosynthesis and respiration with 2 real-world examples..."
                  className="w-full sm:flex-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-950 p-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-[#7C3AED] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={isChunkLoading}
                  onClick={() => handleBuildMicroSteps()}
                  className="inline-flex h-11 sm:h-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] px-5 text-xs sm:text-sm font-semibold text-white cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {isChunkLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ListChecks className="h-4 w-4" />
                  )}
                  <span>Break Into 2-Min Steps</span>
                </button>
              </div>

              {chunkError && (
                <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  {chunkError}
                </p>
              )}
            </div>

            {microSteps.length > 0 && (() => {
              const allDone = completedStepNums.length >= microSteps.length;
              const safeIdx = Math.min(activeMicroIdx, microSteps.length - 1);
              const currentStep = microSteps[safeIdx];
              const pct = Math.round((completedStepNums.length / microSteps.length) * 100);

              return (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-[#7C3AED]/30 bg-gradient-to-br from-[#7C3AED]/[0.05] via-white to-[#10B981]/[0.05] dark:from-[#7C3AED]/15 dark:via-zinc-900 dark:to-[#10B981]/10 p-6 space-y-4 shadow-sm animate-card-enter">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-[#7C3AED] dark:text-[#A78BFA]">
                          {chunkTitle}
                        </span>
                        <p className="font-mono-tabular text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                          {completedStepNums.length} of {microSteps.length} done ({pct}%)
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAllMicroSteps((v) => !v)}
                          className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-200 cursor-pointer"
                        >
                          {showAllMicroSteps ? 'Focus 1 Step Only' : 'Peek All Steps'}
                        </button>
                      </div>
                    </div>

                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#10B981] transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {allDone ? (
                      <div className="rounded-2xl border border-[#10B981]/40 bg-[#10B981]/10 p-5 text-center space-y-3">
                        <CheckCircle2 className="h-8 w-8 text-[#10B981] mx-auto" />
                        <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                          Every micro-step completed
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-300">
                          You broke past the blank page one calm step at a time.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setCompletedStepNums([]);
                            setActiveMicroIdx(0);
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-4 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Restart Checklist</span>
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono-tabular text-xs font-bold text-[#7C3AED] dark:text-[#A78BFA]">
                            Active Step {safeIdx + 1} of {microSteps.length}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-zinc-400">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>~{currentStep.estimatedMinutes} min</span>
                          </span>
                        </div>

                        <div>
                          <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                            {currentStep.title}
                          </h3>
                          <p className="mt-2 text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-200">
                            {currentStep.action}
                          </p>
                        </div>

                        <p className="rounded-xl bg-slate-50 dark:bg-zinc-900 px-3.5 py-2.5 text-xs text-slate-600 dark:text-zinc-300">
                          <span className="font-semibold text-[#10B981]">Low-friction tip: </span>
                          {currentStep.quickTip}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              speech.speak(
                                `micro-${safeIdx}`,
                                `Step ${safeIdx + 1}: ${currentStep.title}. ${currentStep.action}`
                              )
                            }
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 text-xs font-medium text-slate-700 dark:text-zinc-200 cursor-pointer"
                          >
                            <Volume2 className="h-4 w-4 text-[#7C3AED]" />
                            <span>Hear Step</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const stepNum = currentStep.stepNumber ?? safeIdx + 1;
                              setCompletedStepNums((prev) =>
                                prev.includes(stepNum) ? prev : [...prev, stepNum]
                              );
                              if (safeIdx < microSteps.length - 1) {
                                setActiveMicroIdx(safeIdx + 1);
                              }
                            }}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#10B981] px-5 text-xs sm:text-sm font-semibold text-white cursor-pointer"
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                            <span>
                              {safeIdx < microSteps.length - 1
                                ? 'Done — Next Step'
                                : 'Finish Final Step'}
                            </span>
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    )}

                    {showAllMicroSteps && (
                      <div className="space-y-2 pt-1">
                        {microSteps.map((st, idx) => {
                          const sNum = st.stepNumber ?? idx + 1;
                          const done = completedStepNums.includes(sNum);
                          return (
                            <button
                              key={sNum}
                              type="button"
                              onClick={() => setActiveMicroIdx(idx)}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-xs cursor-pointer ${
                                idx === safeIdx
                                  ? 'border-[#7C3AED] bg-[#7C3AED]/[0.07]'
                                  : 'border-slate-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/60'
                              }`}
                            >
                              <span className={done ? 'line-through text-slate-400' : 'font-semibold text-slate-800 dark:text-zinc-100'}>
                                {idx + 1}. {st.title}
                              </span>
                              <span className="font-mono-tabular text-[11px] text-slate-500">
                                {done ? 'Done' : `~${st.estimatedMinutes}m`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
