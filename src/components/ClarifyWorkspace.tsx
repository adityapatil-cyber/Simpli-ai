import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  Brain,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crop,
  Eye,
  FileText,
  GitBranch,
  Layers,
  LifeBuoy,
  List,
  Loader2,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Target,
  Upload,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import {
  BRAIN_MODES,
  DEFAULT_READING_PREFS,
  EXPLAIN_STYLES,
  LOADING_STAGES,
  buildFullAnalysisSpeechScript,
  buildReadingChunks,
  buildSectionSpeechText,
  deriveFlowNodesFromPoints,
  getBrainModeConfig,
  getCompanionMessageForConfidence,
  pickNextExplainStyle,
} from '../utils/simpliLogic';
import {
  InteractiveReadingText,
  MicroCheckCard,
  ReadingSupportBar,
  getReadingSurfaceClasses,
} from './ReadingToolkit';
import { RegionHighlighter } from './RegionHighlighter';
import { VisionToolsDeck } from './VisionToolsDeck';
import type {
  AutoFlashcard,
  BrainModeId,
  ChatTurn,
  ConfidenceLevel,
  ExplainDifferentlyResult,
  ExplainStyleId,
  FlowNode,
  ImLostBreakdown,
  MathWhyStep,
  NormalizedRegion,
  ReadingPreferences,
  SampleStudyItem,
  SimpliAnalysis,
  SmartQuizData,
  WordDefinition,
} from '../types/simpli';
import type { useSpeechPlayer } from '../hooks/useSpeechPlayer';

export const SAMPLE_STUDY_ITEMS: SampleStudyItem[] = [
  {
    id: 'biology-chloroplast',
    title: 'Photosynthesis Diagram',
    subtitle: 'Chloroplast · Light & Calvin cycle',
    imageUrl: '/src/assets/images/sample_biology_diagram_1794854224479.jpg',
    defaultQuery: 'How do light reactions power the Calvin cycle?',
  },
  {
    id: 'economics-equilibrium',
    title: 'Supply & Demand Notes',
    subtitle: 'ECO 101 · Equilibrium shift',
    imageUrl: '/src/assets/images/sample_economics_notes_1794854224765.jpg',
    defaultQuery: 'Why did price go up when supply shifted from S to S1?',
  },
];

export interface AttachedFileState {
  name: string;
  mimeType: string;
  sizeLabel: string;
  base64: string;
  previewUrl?: string;
}

interface ClarifyWorkspaceProps {
  brainMode: BrainModeId;
  onSelectBrainMode: (mode: BrainModeId) => void;
  attachedFiles: AttachedFileState[];
  onAttachFiles: (files: AttachedFileState[]) => void;
  query: string;
  onChangeQuery: (value: string) => void;
  onSubmit: (override?: {
    fileBase64?: string;
    mimeType?: string;
    isRegionCrop?: boolean;
    query?: string;
  }) => void;
  isLoading: boolean;
  loadingStageIndex: number;
  validationError: string | null;
  analysis: SimpliAnalysis | null;
  speech: ReturnType<typeof useSpeechPlayer>;
  chatMessages: ChatTurn[];
  onSendChat: (message: string) => Promise<void>;
  isChatLoading: boolean;
  onDiscussInVoiceStudio: () => void;
  readingPrefs?: ReadingPreferences;
  onChangeReadingPrefs?: (next: ReadingPreferences) => void;
  onSaveGeneratedFlashcards: (cards: AutoFlashcard[]) => void;
  onLaunchSmartQuiz: (quiz: SmartQuizData) => void;
  onOpenReviewDeck: () => void;
  onRecordConfidence: (
    topic: string,
    level: ConfidenceLevel,
    difficulty?: 'easy' | 'moderate' | 'challenging'
  ) => void;
  lastConfidence?: ConfidenceLevel;
  onExploreConcept: (concept: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ListenButton({
  clipId,
  label,
  textToRead,
  speech,
}: {
  clipId: string;
  label: string;
  textToRead: string;
  speech: ReturnType<typeof useSpeechPlayer>;
}) {
  const isCurrent = speech.activeId === clipId;
  const isPlaying = isCurrent && speech.status === 'playing';
  const isPaused = isCurrent && speech.status === 'paused';
  const isLoading = isCurrent && speech.status === 'loading';

  return (
    <button
      type="button"
      onClick={() => speech.speak(clipId, textToRead)}
      aria-label={`Hear ${label}`}
      className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
        isPlaying || isPaused
          ? 'bg-[#10B981]/15 text-[#059669] dark:text-[#34D399] border border-[#10B981]/30'
          : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-600 dark:text-zinc-300 hover:border-[#7C3AED]/50 hover:text-[#7C3AED] dark:hover:text-[#A78BFA]'
      }`}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : isPlaying ? (
        <Pause className="h-3.5 w-3.5" aria-hidden="true" />
      ) : isPaused ? (
        <Play className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>
        {isLoading ? 'Loading...' : isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Hear'}
      </span>
    </button>
  );
}

export function ClarifyWorkspace({
  brainMode,
  onSelectBrainMode,
  attachedFiles,
  onAttachFiles,
  query,
  onChangeQuery,
  onSubmit,
  isLoading,
  loadingStageIndex,
  validationError,
  analysis,
  speech,
  chatMessages,
  onSendChat,
  isChatLoading,
  onDiscussInVoiceStudio,
  readingPrefs = DEFAULT_READING_PREFS,
  onChangeReadingPrefs,
  onSaveGeneratedFlashcards,
  onLaunchSmartQuiz,
  onOpenReviewDeck,
  onRecordConfidence,
  lastConfidence,
  onExploreConcept,
}: ClarifyWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sampleLoadingId, setSampleLoadingId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [showOcr, setShowOcr] = useState(false);

  // Reading Support
  const [showReadingToolkit, setShowReadingToolkit] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [definitionCache, setDefinitionCache] = useState<Record<string, WordDefinition>>({});

  // Region Highlighter ("Circle What's Confusing")
  const [showRegionHighlighter, setShowRegionHighlighter] = useState(false);
  const [showResultRegionHighlighter, setShowResultRegionHighlighter] = useState(false);

  // "Show as Flow" Visual Concept Map
  const [simpleViewMode, setSimpleViewMode] = useState<'list' | 'flow'>('list');
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([]);
  const [isFlowLoading, setIsFlowLoading] = useState(false);
  const [activeFlowNodeIdx, setActiveFlowNodeIdx] = useState(0);

  // Equation Why-Stepper
  const [showMathStepper, setShowMathStepper] = useState(false);
  const [mathTitle, setMathTitle] = useState<string | null>(null);
  const [mathSteps, setMathSteps] = useState<MathWhyStep[]>([]);
  const [revealedStepCount, setRevealedStepCount] = useState(1);
  const [isMathLoading, setIsMathLoading] = useState(false);
  const [mathError, setMathError] = useState<string | null>(null);

  // Vision 2.0: Feature #3 ("🆘 I'm Lost"), #5 ("🔄 Explain Differently"), #12 ("⚡ Generate Flashcards"), #13 ("🧠 Test Me")
  const [imLostData, setImLostData] = useState<ImLostBreakdown | null>(null);
  const [isImLostLoading, setIsImLostLoading] = useState(false);
  const [showImLostPanel, setShowImLostPanel] = useState(false);

  const [explainStyle, setExplainStyle] = useState<ExplainStyleId | undefined>(undefined);
  const [explainDiffResult, setExplainDiffResult] =
    useState<ExplainDifferentlyResult | null>(null);
  const [isExplainDiffLoading, setIsExplainDiffLoading] = useState(false);

  const [isGenFlashcardsLoading, setIsGenFlashcardsLoading] = useState(false);
  const [generatedFlashcardBanner, setGeneratedFlashcardBanner] = useState<string | null>(null);
  const [isTestMeLoading, setIsTestMeLoading] = useState(false);
  const [topicConfidence, setTopicConfidence] = useState<ConfidenceLevel | undefined>(
    lastConfidence
  );
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setSimpleViewMode('list');
    setFlowNodes([]);
    setActiveFlowNodeIdx(0);
    setShowMathStepper(false);
    setMathSteps([]);
    setMathTitle(null);
    setRevealedStepCount(1);
    setMathError(null);
    setShowResultRegionHighlighter(false);
    setImLostData(null);
    setShowImLostPanel(false);
    setExplainDiffResult(null);
    setExplainStyle(undefined);
    setGeneratedFlashcardBanner(null);
    setTopicConfidence(undefined);
    setActionError(null);
  }, [analysis?.detectedTopic, analysis?.brainMode]);

  const primaryPreviewFile = useMemo(
    () => attachedFiles.find((f) => Boolean(f.previewUrl)) ?? attachedFiles[0] ?? null,
    [attachedFiles]
  );

  const readingChunks = useMemo(
    () => (analysis ? buildReadingChunks(analysis) : []),
    [analysis]
  );

  const displayFlowNodes = useMemo(() => {
    if (flowNodes.length > 0) return flowNodes;
    if (!analysis) return [];
    return deriveFlowNodesFromPoints(analysis.madeSimple, analysis.detectedTopic);
  }, [analysis, flowNodes]);

  const handleExplainRegion = (croppedBase64: string, _region: NormalizedRegion) => {
    setShowRegionHighlighter(false);
    setShowResultRegionHighlighter(false);
    onSubmit({
      fileBase64: croppedBase64,
      mimeType: 'image/png',
      isRegionCrop: true,
    });
  };

  const handleToggleSimpleView = async (mode: 'list' | 'flow') => {
    setSimpleViewMode(mode);
    if (mode === 'flow' && analysis && flowNodes.length === 0 && !isFlowLoading) {
      setIsFlowLoading(true);
      try {
        const res = await fetch('/api/flow-map', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: analysis.detectedTopic,
            madeSimple: analysis.madeSimple,
            theGist: analysis.theGist,
          }),
        });
        const data = (await res.json()) as { nodes?: FlowNode[] };
        if (res.ok && Array.isArray(data.nodes) && data.nodes.length > 0) {
          setFlowNodes(data.nodes);
        }
      } catch {
        // fallback works cleanly
      } finally {
        setIsFlowLoading(false);
      }
    }
  };

  const handleOpenMathStepper = async () => {
    if (!analysis) return;
    if (showMathStepper && mathSteps.length > 0) {
      setShowMathStepper(false);
      return;
    }
    setShowMathStepper(true);
    if (mathSteps.length > 0) return;

    setIsMathLoading(true);
    setMathError(null);
    try {
      const res = await fetch('/api/math-stepper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: analysis.detectedTopic,
          extractedText: analysis.extractedText,
          query,
          fileBase64: primaryPreviewFile?.base64,
          mimeType: primaryPreviewFile?.mimeType,
          brainMode: analysis.brainMode,
        }),
      });
      const data = (await res.json()) as {
        problemTitle?: string;
        steps?: MathWhyStep[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Could not build equation stepper.');
      setMathTitle(data.problemTitle || analysis.detectedTopic);
      setMathSteps(data.steps ?? []);
      setRevealedStepCount(1);
    } catch (err) {
      setMathError(
        err instanceof Error ? err.message : 'Unable to generate Why-Stepper right now.'
      );
    } finally {
      setIsMathLoading(false);
    }
  };

  // Feature #3: Emergency "🆘 I'm Lost"
  const handleTriggerImLost = async () => {
    if (!analysis) return;
    if (showImLostPanel && imLostData) {
      setShowImLostPanel(false);
      return;
    }
    setShowImLostPanel(true);
    if (imLostData) return;
    setIsImLostLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/im-lost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: analysis.detectedTopic,
          theGist: analysis.theGist,
          extractedText: analysis.extractedText,
        }),
      });
      const data = (await res.json()) as ImLostBreakdown & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not build calm reset.');
      setImLostData(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not slow it down right now.');
    } finally {
      setIsImLostLoading(false);
    }
  };

  // Feature #5: "🔄 Explain Differently"
  const handleExplainDifferently = async (explicitStyle?: ExplainStyleId) => {
    if (!analysis) return;
    const nextStyle = explicitStyle ?? pickNextExplainStyle(explainStyle);
    setExplainStyle(nextStyle);
    setIsExplainDiffLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/explain-differently', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: analysis.detectedTopic,
          theGist: analysis.theGist,
          style: nextStyle,
        }),
      });
      const data = (await res.json()) as ExplainDifferentlyResult & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not re-explain right now.');
      setExplainDiffResult(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to switch explanation style.');
    } finally {
      setIsExplainDiffLoading(false);
    }
  };

  // Feature #12: Instant Flashcard Generator
  const handleGenerateFlashcards = async () => {
    if (!analysis) return;
    setIsGenFlashcardsLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: analysis.detectedTopic,
          theGist: analysis.theGist,
          madeSimple: analysis.madeSimple,
        }),
      });
      const data = (await res.json()) as { flashcards?: AutoFlashcard[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not create flashcards.');
      const cards = data.flashcards ?? [];
      if (cards.length > 0) {
        onSaveGeneratedFlashcards(cards);
        setGeneratedFlashcardBanner(
          `Saved ${cards.length} smart flashcards for "${analysis.detectedTopic}"`
        );
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to create flashcards.');
    } finally {
      setIsGenFlashcardsLoading(false);
    }
  };

  // Feature #13: Smart Quiz Mode ("🧠 Test Me")
  const handleTestMe = async () => {
    if (!analysis) return;
    setIsTestMeLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/smart-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: analysis.detectedTopic,
          theGist: analysis.theGist,
          madeSimple: analysis.madeSimple,
        }),
      });
      const data = (await res.json()) as SmartQuizData & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not build Smart Quiz.');
      onLaunchSmartQuiz(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to launch quiz.');
    } finally {
      setIsTestMeLoading(false);
    }
  };

  const lookupWord = async (
    word: string,
    context: string
  ): Promise<WordDefinition | null> => {
    const key = word.toLowerCase();
    if (definitionCache[key]) return definitionCache[key];
    try {
      const res = await fetch('/api/define', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, context }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as WordDefinition;
      setDefinitionCache((prev) => ({ ...prev, [key]: data }));
      return data;
    } catch {
      return null;
    }
  };

  const readBrowserFiles = (fileList: FileList | File[]) => {
    setLocalError(null);
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const validFiles: File[] = [];
    for (const file of incoming) {
      const isImage = file.type.startsWith('image/');
      const isPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isImage && !isPdf) {
        setLocalError('Please upload images (PNG, JPG, WEBP) or PDF documents.');
        continue;
      }
      if (file.size > 15 * 1024 * 1024) {
        setLocalError(`${file.name} is over 15 MB.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    Promise.all(
      validFiles.map(
        (file) =>
          new Promise<AttachedFileState>((resolve) => {
            const isImage = file.type.startsWith('image/');
            const isPdf =
              file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve({
                name: file.name,
                mimeType: isPdf ? 'application/pdf' : file.type || 'image/png',
                sizeLabel: formatFileSize(file.size),
                base64: result,
                previewUrl: isImage ? result : undefined,
              });
            };
            reader.readAsDataURL(file);
          })
      )
    ).then((loaded) => {
      const combined = [...attachedFiles, ...loaded].slice(0, 5);
      onAttachFiles(combined);
    });
  };

  const handleLoadSample = async (sample: SampleStudyItem) => {
    setLocalError(null);
    setSampleLoadingId(sample.id);
    try {
      const res = await fetch(sample.imageUrl);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        onAttachFiles([
          {
            name: `${sample.title}.jpg`,
            mimeType: blob.type || 'image/jpeg',
            sizeLabel: formatFileSize(blob.size),
            base64: result,
            previewUrl: result,
          },
        ]);
        if (!query.trim()) {
          onChangeQuery(sample.defaultQuery);
        }
        setSampleLoadingId(null);
      };
      reader.readAsDataURL(blob);
    } catch {
      setLocalError('Could not load sample file.');
      setSampleLoadingId(null);
    }
  };

  const currentStage =
    LOADING_STAGES[Math.min(loadingStageIndex, LOADING_STAGES.length - 1)];

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || isChatLoading) return;
    setChatInput('');
    await onSendChat(trimmed);
  };

  // STATE 1: Calm Centered Welcome & Multi-Document Composer
  if (!analysis && !isLoading) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) readBrowserFiles(e.dataTransfer.files);
        }}
        className="flex flex-1 flex-col items-center px-4 py-6 sm:py-8 sm:px-6 overflow-y-auto"
      >
        <div className="my-auto w-full max-w-3xl space-y-6 sm:space-y-7">
          <div className="relative text-center">
            <div
              aria-hidden="true"
              className="hidden sm:flex pointer-events-none absolute -top-2 left-8 h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/80 shadow-xs text-lg animate-float-slow"
            >
              🧠
            </div>
            <div
              aria-hidden="true"
              className="hidden sm:flex pointer-events-none absolute top-2 right-8 h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/80 shadow-xs text-lg animate-float-reverse"
            >
              ✨
            </div>

            <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              <span className="bg-gradient-to-r from-slate-900 via-[#7C3AED] to-[#3B82F6] dark:from-white dark:via-[#A78BFA] dark:to-[#60A5FA] bg-clip-text text-transparent">
                SIMPLI
              </span>
            </h1>
            <p className="mt-2 font-display text-lg sm:text-xl font-semibold text-slate-600 dark:text-zinc-300">
              from huh? to ohhh.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 sm:p-6 shadow-sm space-y-4">
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              aria-label="Upload images, screenshots, diagrams, handwritten notes, or PDFs"
              onChange={(e) => {
                if (e.target.files?.length) readBrowserFiles(e.target.files);
                e.target.value = '';
              }}
              className="sr-only"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">
                🫠 what&apos;s not clicking?
              </span>
              <span className="text-[11px] text-slate-400 dark:text-zinc-500 whitespace-nowrap">
                Single or Multi-Doc · Notes · Slides · PDF
              </span>
            </div>

            {attachedFiles.length > 0 ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  {attachedFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 p-3.5"
                    >
                      <div className="flex w-full sm:w-auto flex-1 items-center gap-3 min-w-0">
                        {file.previewUrl ? (
                          <img
                            src={file.previewUrl}
                            alt={`Uploaded preview of ${file.name}`}
                            referrerPolicy="no-referrer"
                            className="h-14 w-20 rounded-xl object-cover border border-slate-200 dark:border-zinc-700 shrink-0 bg-white"
                          />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-[#7C3AED] shrink-0">
                            <FileText className="h-6 w-6" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {file.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono-tabular mt-0.5">
                            {file.mimeType} · {file.sizeLabel}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {idx === 0 && file.previewUrl && (
                          <button
                            type="button"
                            onClick={() => setShowRegionHighlighter((v) => !v)}
                            className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 text-xs font-semibold text-[#3B82F6] hover:border-[#3B82F6] cursor-pointer"
                          >
                            <Crop className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {showRegionHighlighter
                                ? 'Hide Box'
                                : "Circle What's Confusing"}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const next = attachedFiles.filter((_, i) => i !== idx);
                            if (next.length === 0) setShowRegionHighlighter(false);
                            onAttachFiles(next);
                          }}
                          aria-label={`Remove ${file.name}`}
                          className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 text-xs font-medium text-slate-600 dark:text-zinc-300 hover:text-red-600 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 font-semibold text-[#7C3AED] dark:text-[#A78BFA] hover:underline cursor-pointer"
                  >
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      + Add another slide, note, or PDF ({attachedFiles.length}/5 attached)
                    </span>
                  </button>
                  {attachedFiles.length > 1 && (
                    <span className="font-medium text-[#059669] dark:text-[#34D399]">
                      Multi-Doc Synthesis active — ideas will be combined automatically
                    </span>
                  )}
                </div>

                {showRegionHighlighter && primaryPreviewFile?.previewUrl && (
                  <RegionHighlighter
                    imageUrl={primaryPreviewFile.previewUrl}
                    imageName={primaryPreviewFile.name}
                    onExplainRegion={handleExplainRegion}
                    isBusy={isLoading}
                  />
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                aria-label="Drop anything confusing — click to upload image, screenshot, or PDF"
                className={`flex w-full min-h-[168px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-7 text-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] ${
                  isDragging
                    ? 'border-[#7C3AED] bg-[#7C3AED]/8 dark:bg-[#7C3AED]/15'
                    : 'border-slate-300/90 dark:border-zinc-700 bg-slate-50/60 dark:bg-zinc-950/50 hover:border-[#7C3AED]/60 hover:bg-slate-50 dark:hover:bg-zinc-950'
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7C3AED]/15 via-[#3B82F6]/15 to-[#10B981]/15 text-[#7C3AED] dark:text-[#A78BFA]">
                  <Upload className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    drop anything confusing
                  </p>
                  <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
                    Click to browse or drag &amp; drop up to 5 photos, lecture slides, charts, handwritten notes, or PDFs
                  </p>
                </div>
              </button>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
              <input
                id="simpli-query-input"
                type="text"
                value={query}
                onChange={(e) => onChangeQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isLoading) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                aria-label="Optional query — specify what feels confusing"
                placeholder="Paste a hard paragraph, ask a question, or explain what feels blurry..."
                className="h-11 w-full sm:w-auto sm:flex-1 shrink-0 sm:shrink rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-950 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:border-[#7C3AED] focus:bg-white dark:focus:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
              />

              <button
                type="button"
                onClick={() => onSubmit()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] px-5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>make it make sense</span>
              </button>
            </div>
          </div>

          {(localError || validationError) && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs font-medium text-red-700 dark:text-red-300 text-center"
            >
              {localError || validationError}
            </div>
          )}

          {/* Smart Learning Modes (#4 - All 9 Modes) */}
          <div className="space-y-2.5 text-center">
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
              Smart Learning Mode · {getBrainModeConfig(brainMode).shortDesc}
            </p>
            <div
              role="radiogroup"
              aria-label="Smart learning mode"
              className="flex flex-wrap items-center justify-center gap-2"
            >
              {BRAIN_MODES.map((mode) => {
                const isSelected = mode.id === brainMode;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => onSelectBrainMode(mode.id)}
                    className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                        : 'border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 hover:border-[#7C3AED]/50'
                    }`}
                  >
                    <span aria-hidden="true">{mode.emoji}</span>
                    <span>{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {SAMPLE_STUDY_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={sampleLoadingId !== null}
                onClick={() => handleLoadSample(item)}
                className="flex items-center gap-3 rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/50 p-3 text-left hover:border-[#3B82F6] transition-colors cursor-pointer"
              >
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="h-11 w-14 rounded-lg object-cover border border-slate-200 dark:border-zinc-700 shrink-0 bg-white"
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800 dark:text-zinc-100">
                    {sampleLoadingId === item.id ? 'Loading...' : item.title}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-zinc-400">
                    {item.subtitle}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // STATE 2: Loading Progress
  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-10 py-9 shadow-sm text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#7C3AED]" aria-hidden="true" />
          <div>
            <p className="font-display text-xl font-bold text-slate-900 dark:text-white">
              {currentStage}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
              Analyzing difficulty &amp; adapting to {getBrainModeConfig(brainMode).label}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  const modeConfig = getBrainModeConfig(analysis.brainMode);
  const fullClipId = `full-${analysis.detectedTopic}`;
  const isFullActive = speech.activeId === fullClipId && speech.status !== 'idle';
  const surfaceClass = getReadingSurfaceClasses(readingPrefs.surfaceTint);

  const totalFocusBlocks = 4;
  const getFocusClass = (blockIdx: number) => {
    if (!readingPrefs.focusRuler) return '';
    return focusIndex === blockIdx
      ? 'ring-2 ring-[#3B82F6]/60 opacity-100 transition-all'
      : 'opacity-45 hover:opacity-80 transition-opacity cursor-pointer';
  };

  const safeChunkIdx = Math.min(chunkIndex, Math.max(0, readingChunks.length - 1));
  const currentChunk = readingChunks[safeChunkIdx];
  const companion = getCompanionMessageForConfidence(topicConfidence ?? lastConfidence);

  const meterEmoji =
    analysis.confusionMeter?.level === 'challenging'
      ? '🤯 Challenging'
      : analysis.confusionMeter?.level === 'moderate'
      ? '🤔 Moderate'
      : '😌 Easy';

  // STATE 3: Active Personalized Understanding Results
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* User Input Summary Bubble */}
          <div className="flex justify-end">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-100 dark:bg-zinc-800 px-4 py-3 max-w-xl">
              {primaryPreviewFile?.previewUrl && (
                <img
                  src={primaryPreviewFile.previewUrl}
                  alt={primaryPreviewFile.name}
                  referrerPolicy="no-referrer"
                  className="h-12 w-16 rounded-lg object-cover shrink-0 bg-white"
                />
              )}
              <div className="text-sm text-slate-900 dark:text-white">
                <p className="font-medium">
                  {query.trim() ||
                    (attachedFiles.length > 1
                      ? `${attachedFiles.length} documents combined`
                      : primaryPreviewFile?.name) ||
                    'Uploaded study material'}
                </p>
                {attachedFiles.length > 0 && query.trim() && (
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    Attached: {attachedFiles.map((f) => f.name).join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Clarity Header + Core Actions (#3 I'm Lost, #5 Explain Differently, #12 Flashcards, #13 Test Me) */}
          <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-gradient-to-r from-[#7C3AED]/[0.06] via-[#3B82F6]/[0.05] to-[#10B981]/[0.06] dark:from-[#7C3AED]/15 dark:via-[#3B82F6]/10 dark:to-[#10B981]/10 p-4 sm:p-5 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                  {modeConfig.emoji} {modeConfig.label} · From Huh? → To Ohhh.
                </p>
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                  {analysis.detectedTopic}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Feature #3: Large Calm Emergency Button */}
                <button
                  type="button"
                  onClick={handleTriggerImLost}
                  aria-expanded={showImLostPanel}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-1.5 text-xs sm:text-sm font-bold text-white shadow-xs transition-colors cursor-pointer"
                >
                  <LifeBuoy className="h-4 w-4" aria-hidden="true" />
                  <span>🆘 I&apos;m Lost</span>
                </button>

                {/* Feature #5: Explain Differently */}
                <button
                  type="button"
                  disabled={isExplainDiffLoading}
                  onClick={() => handleExplainDifferently()}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#7C3AED]/40 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-[#7C3AED] dark:text-[#A78BFA] hover:bg-[#7C3AED]/10 cursor-pointer disabled:opacity-50"
                >
                  {isExplainDiffLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>🔄 Explain Differently</span>
                </button>

                {/* Feature #12: Instant Flashcards */}
                <button
                  type="button"
                  disabled={isGenFlashcardsLoading}
                  onClick={handleGenerateFlashcards}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:border-[#7C3AED] cursor-pointer disabled:opacity-50"
                >
                  {isGenFlashcardsLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden="true" />
                  )}
                  <span>⚡ Generate Flashcards</span>
                </button>

                {/* Feature #13: Smart Quiz */}
                <button
                  type="button"
                  disabled={isTestMeLoading}
                  onClick={handleTestMe}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:border-[#10B981] cursor-pointer disabled:opacity-50"
                >
                  {isTestMeLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Brain className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
                  )}
                  <span>🧠 Test Me</span>
                </button>
              </div>
            </div>

            {/* Secondary Utility Strip */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/70 dark:border-zinc-800">
              {primaryPreviewFile?.previewUrl && (
                <button
                  type="button"
                  aria-expanded={showResultRegionHighlighter}
                  onClick={() => setShowResultRegionHighlighter((v) => !v)}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    showResultRegionHighlighter
                      ? 'bg-[#3B82F6] text-white'
                      : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-200 hover:border-[#3B82F6]'
                  }`}
                >
                  <Crop className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Zoom Spot</span>
                </button>
              )}

              <button
                type="button"
                aria-expanded={showMathStepper}
                onClick={handleOpenMathStepper}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  showMathStepper
                    ? 'bg-[#10B981] text-white'
                    : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-200 hover:border-[#10B981]'
                }`}
              >
                <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Equation Why-Stepper</span>
              </button>

              {onChangeReadingPrefs && (
                <button
                  type="button"
                  aria-expanded={showReadingToolkit}
                  onClick={() => setShowReadingToolkit((v) => !v)}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    showReadingToolkit
                      ? 'bg-[#7C3AED] text-white'
                      : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-200 hover:border-[#7C3AED]'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reading Toolkit</span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  speech.speak(fullClipId, buildFullAnalysisSpeechScript(analysis))
                }
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-3 py-1 text-xs font-semibold text-white dark:text-slate-900 hover:bg-[#7C3AED] dark:hover:bg-[#7C3AED] dark:hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                {isFullActive && speech.status === 'loading' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : isFullActive && speech.status === 'playing' ? (
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {isFullActive && speech.status === 'playing'
                    ? 'Pause'
                    : isFullActive && speech.status === 'paused'
                    ? 'Resume'
                    : 'Hear Full'}
                </span>
              </button>

              {speech.status !== 'idle' && (
                <button
                  type="button"
                  onClick={speech.stop}
                  aria-label="Stop audio playback"
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 text-xs font-medium cursor-pointer"
                >
                  <Square className="h-3 w-3 fill-current" aria-hidden="true" />
                  <span>Stop</span>
                </button>
              )}

              <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-0.5 ml-auto">
                {[0.9, 1.0, 1.25].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => speech.setSpeed(rate)}
                    aria-label={`Set playback speed ${rate}x`}
                    className={`rounded-lg px-2 py-1 text-[11px] font-mono-tabular font-medium cursor-pointer ${
                      speech.speed === rate
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'text-slate-500 dark:text-zinc-400'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {showReadingToolkit && onChangeReadingPrefs && (
              <ReadingSupportBar
                prefs={readingPrefs}
                onChange={onChangeReadingPrefs}
                focusIndex={focusIndex}
                totalFocusSteps={totalFocusBlocks}
                onStepFocus={(delta) =>
                  setFocusIndex((i) => (i + delta + totalFocusBlocks) % totalFocusBlocks)
                }
                hasMultiChunks={readingChunks.length > 1}
              />
            )}

            {showResultRegionHighlighter && primaryPreviewFile?.previewUrl && (
              <RegionHighlighter
                imageUrl={primaryPreviewFile.previewUrl}
                imageName={primaryPreviewFile.name}
                onExplainRegion={handleExplainRegion}
                isBusy={isLoading}
              />
            )}
          </div>

          {actionError && (
            <p
              role="alert"
              className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300"
            >
              {actionError}
            </p>
          )}

          {generatedFlashcardBanner && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#10B981]/35 bg-[#10B981]/10 px-4 py-3 text-xs">
              <span className="font-semibold text-slate-800 dark:text-zinc-100">
                ⚡ {generatedFlashcardBanner}
              </span>
              <button
                type="button"
                onClick={onOpenReviewDeck}
                className="inline-flex items-center gap-1 font-bold text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
              >
                <span>Open Review &amp; Quizzes</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* FEATURE #3: CALMING "I'M LOST" SANCTUARY PANEL */}
          {showImLostPanel && (
            <section
              aria-label="I'm Lost calm breakdown"
              data-testid="im-lost-sanctuary"
              className="rounded-3xl border border-[#10B981]/35 bg-gradient-to-br from-[#F0F7F2] via-white to-[#EEF5FC] dark:from-[#16221C] dark:via-zinc-900 dark:to-[#151E2B] p-6 sm:p-7 space-y-5 animate-card-enter"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-display text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                    Let&apos;s slow it down.
                  </p>
                  <p className="text-xs text-slate-600 dark:text-zinc-400">
                    Deep breath — here is the simplest path through {analysis.detectedTopic}.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {imLostData && (
                    <ListenButton
                      clipId="im-lost-audio"
                      label="slow calm reset"
                      textToRead={`${imLostData.oneSentence} ${imLostData.simplestVersion} Most important takeaway: ${imLostData.mostImportantTakeaway}`}
                      speech={speech}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setShowImLostPanel(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    aria-label="Close calming breakdown"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isImLostLoading ? (
                <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-zinc-300 py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-[#10B981]" />
                  <span>Making this as calm and clear as possible...</span>
                </div>
              ) : imLostData ? (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-white/90 dark:bg-zinc-950/80 p-4 border border-slate-200/70 dark:border-zinc-800 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[#059669] dark:text-[#34D399]">
                      In One Sentence
                    </span>
                    <p className="text-base font-semibold text-slate-900 dark:text-white leading-relaxed">
                      {imLostData.oneSentence}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/90 dark:bg-zinc-950/80 p-4 border border-slate-200/70 dark:border-zinc-800 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Simplest Version
                      </span>
                      <p className="text-sm text-slate-700 dark:text-zinc-200 leading-relaxed">
                        {imLostData.simplestVersion}
                      </p>
                      <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-800">
                        <span className="text-[11px] font-bold text-[#7C3AED] dark:text-[#A78BFA]">
                          Real-World Analogy:{' '}
                        </span>
                        <span className="text-xs text-slate-700 dark:text-zinc-200">
                          {imLostData.analogy}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white/90 dark:bg-zinc-950/80 p-4 border border-slate-200/70 dark:border-zinc-800 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        5 Calm Building Blocks
                      </span>
                      <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-zinc-200">
                        {imLostData.fiveBullets.map((b, i) => (
                          <li key={i}>• {b}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-[#10B981]/10 p-3.5 text-xs text-slate-800 dark:text-zinc-100">
                      <span className="font-bold">Most Important Takeaway: </span>
                      {imLostData.mostImportantTakeaway}
                    </div>
                    <div className="rounded-2xl bg-[#3B82F6]/10 p-3.5 text-xs text-slate-800 dark:text-zinc-100">
                      <span className="font-bold">What to Learn First: </span>
                      {imLostData.whatToLearnFirst}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          )}

          {/* FEATURE #5: EXPLAIN DIFFERENTLY RESULT CARD */}
          {(explainDiffResult || isExplainDiffLoading) && (
            <section
              aria-label="Fresh explanation style"
              data-testid="explain-differently-card"
              className="rounded-3xl border border-[#7C3AED]/30 bg-[#7C3AED]/[0.05] dark:bg-[#7C3AED]/12 p-5 space-y-3 animate-card-enter"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-[#7C3AED] dark:text-[#A78BFA] mr-1">
                    Try angle:
                  </span>
                  {EXPLAIN_STYLES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={isExplainDiffLoading}
                      onClick={() => handleExplainDifferently(st)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize cursor-pointer ${
                        explainStyle === st
                          ? 'bg-[#7C3AED] text-white'
                          : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                {explainDiffResult && (
                  <ListenButton
                    clipId={`diff-${explainDiffResult.styleUsed}`}
                    label={explainDiffResult.styleLabel}
                    textToRead={`${explainDiffResult.headline}. ${explainDiffResult.explanation}. Example: ${explainDiffResult.quickExample}`}
                    speech={speech}
                  />
                )}
              </div>

              {isExplainDiffLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-300 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#7C3AED]" />
                  <span>Switching explanation perspective...</span>
                </div>
              ) : explainDiffResult ? (
                <div className="space-y-2">
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    {explainDiffResult.headline}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-zinc-200">
                    {explainDiffResult.explanation}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-zinc-300">
                    <span className="font-bold">Example: </span>
                    {explainDiffResult.quickExample}
                  </p>
                  <p className="text-xs font-medium text-[#7C3AED] dark:text-[#A78BFA]">
                    Mental shift: {explainDiffResult.keyShift}
                  </p>
                </div>
              ) : null}
            </section>
          )}

          {/* FEATURES #1 & #2: CONFUSION METER + WHY DOESN'T THIS CLICK? */}
          {(analysis.confusionMeter || analysis.whyNotClick) && (
            <section
              aria-label="Confusion Meter and Diagnostic"
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {analysis.confusionMeter && (
                <article
                  data-testid="confusion-meter"
                  className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                      Confusion Meter
                    </span>
                    <span className="rounded-xl bg-slate-100 dark:bg-zinc-800 px-3 py-1 text-xs font-bold text-slate-900 dark:text-white">
                      {meterEmoji}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-zinc-300 font-mono-tabular">
                    <span>Load: {analysis.confusionMeter.cognitiveLoad}</span>
                    <span>·</span>
                    <span>{analysis.confusionMeter.estimatedComplexity}</span>
                  </div>

                  <p className="text-sm leading-relaxed text-slate-700 dark:text-zinc-200">
                    {analysis.confusionMeter.whyFeelsDifficult}
                  </p>

                  {analysis.confusionMeter.typicalConfusionPoints.length > 0 && (
                    <div className="pt-1 space-y-1">
                      <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                        Typical Stumbling Points:
                      </p>
                      <ul className="space-y-1 text-xs text-slate-600 dark:text-zinc-300">
                        {analysis.confusionMeter.typicalConfusionPoints.map((pt, i) => (
                          <li key={i}>• {pt}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              )}

              {analysis.whyNotClick && (
                <article
                  data-testid="why-not-click"
                  className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                      Why Doesn&apos;t This Click?
                    </span>
                    <span className="text-[11px] font-medium text-[#7C3AED] dark:text-[#A78BFA]">
                      {analysis.whyNotClick.detectedCauses.slice(0, 2).join(' · ')}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs leading-relaxed">
                    <p className="flex items-start gap-2 text-slate-700 dark:text-zinc-200">
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        <strong className="text-slate-900 dark:text-white">
                          What might make it tricky:{' '}
                        </strong>
                        {analysis.whyNotClick.whatMightMakeDifficult}
                      </span>
                    </p>

                    <p className="flex items-start gap-2 text-slate-700 dark:text-zinc-200">
                      <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        <strong className="text-slate-900 dark:text-white">
                          What you already understand:{' '}
                        </strong>
                        {analysis.whyNotClick.whatYouAlreadyUnderstand}
                      </span>
                    </p>

                    <p className="flex items-start gap-2 text-slate-700 dark:text-zinc-200">
                      <Target className="h-4 w-4 text-[#3B82F6] shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        <strong className="text-slate-900 dark:text-white">
                          What to focus on next:{' '}
                        </strong>
                        {analysis.whyNotClick.whatToFocusNext}
                      </span>
                    </p>
                  </div>
                </article>
              )}
            </section>
          )}

          {/* FEATURE #16: MULTI-DOCUMENT SYNTHESIS CARD */}
          {analysis.multiDocSynthesis && (
            <section
              aria-label="Multi-Document Synthesis"
              data-testid="multi-doc-synthesis"
              className="rounded-2xl border border-[#3B82F6]/30 bg-[#3B82F6]/[0.05] dark:bg-[#3B82F6]/10 p-5 space-y-3"
            >
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
                <span>Multi-Document Synthesis</span>
              </h3>
              <p className="text-sm text-slate-700 dark:text-zinc-200 leading-relaxed">
                {analysis.multiDocSynthesis.combinedOverview}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white mb-1">
                    Shared Patterns
                  </p>
                  <ul className="space-y-1 text-slate-600 dark:text-zinc-300">
                    {analysis.multiDocSynthesis.sharedPatterns.map((p, i) => (
                      <li key={i}>• {p}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white mb-1">
                    Concept Connections
                  </p>
                  <ul className="space-y-1 text-slate-600 dark:text-zinc-300">
                    {analysis.multiDocSynthesis.conceptConnections.map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* Optional Equation Why-Stepper */}
          {showMathStepper && (
            <section
              aria-label="Step-by-Step Equation Why Stepper"
              className="rounded-3xl border border-[#10B981]/35 bg-[#10B981]/[0.05] dark:bg-[#10B981]/10 p-5 sm:p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
                    <span>{mathTitle || `Why-Stepper: ${analysis.detectedTopic}`}</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    One line revealed at a time so working memory never gets flooded.
                  </p>
                </div>

                {mathSteps.length > 0 && (
                  <span className="font-mono-tabular text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                    Step {Math.min(revealedStepCount, mathSteps.length)} of {mathSteps.length}
                  </span>
                )}
              </div>

              {isMathLoading ? (
                <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-zinc-300 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-[#10B981]" />
                  <span>Unpacking one clean step at a time...</span>
                </div>
              ) : mathError ? (
                <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
                  {mathError}
                </p>
              ) : (
                <div className="space-y-3">
                  {mathSteps.slice(0, revealedStepCount).map((step, idx) => (
                    <div
                      key={step.stepNumber ?? idx}
                      className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center animate-card-enter"
                    >
                      <div className="md:col-span-5 flex items-center gap-2.5">
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#10B981]/15 font-mono-tabular text-xs font-bold text-[#059669] dark:text-[#34D399]">
                          {idx + 1}
                        </span>
                        <code className="font-mono-tabular text-sm sm:text-base font-semibold text-slate-900 dark:text-white break-words">
                          {step.expression}
                        </code>
                      </div>
                      <div className="md:col-span-6 text-xs sm:text-sm text-slate-700 dark:text-zinc-200">
                        <span className="font-semibold text-[#7C3AED] dark:text-[#A78BFA]">
                          Why we did this:{' '}
                        </span>
                        {step.why}
                      </div>
                      <div className="md:col-span-1 flex justify-end">
                        <ListenButton
                          clipId={`math-step-${idx}`}
                          label={`step ${idx + 1}`}
                          textToRead={`Step ${idx + 1}. ${step.expression}. Why we did this: ${step.why}`}
                          speech={speech}
                        />
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      {revealedStepCount < mathSteps.length && (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedStepCount((c) => Math.min(mathSteps.length, c + 1))
                          }
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-4 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                        >
                          <span>Reveal Next Step</span>
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                      {revealedStepCount > 1 && (
                        <button
                          type="button"
                          onClick={() => setRevealedStepCount(1)}
                          className="inline-flex h-9 items-center rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-xs font-medium text-slate-600 dark:text-zinc-300 cursor-pointer"
                        >
                          Reset to Step 1
                        </button>
                      )}
                    </div>

                    {revealedStepCount < mathSteps.length && mathSteps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setRevealedStepCount(mathSteps.length)}
                        className="text-xs font-semibold text-[#059669] dark:text-[#34D399] hover:underline cursor-pointer"
                      >
                        Reveal All {mathSteps.length} Steps
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 4 Core Cards OR Bite-Sized Chunk Stepper (with Jargon Destroyer #9 active!) */}
          {readingPrefs.chunkMode && currentChunk ? (
            <article className={`rounded-3xl border p-6 sm:p-7 space-y-4 ${surfaceClass}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono-tabular text-xs font-bold text-[#7C3AED] dark:text-[#A78BFA]">
                  Chunk {safeChunkIdx + 1} of {readingChunks.length}
                </span>

                <div className="flex items-center gap-2">
                  <ListenButton
                    clipId={`chunk-${currentChunk.id}`}
                    label={currentChunk.title}
                    textToRead={buildSectionSpeechText(currentChunk.title, currentChunk.text)}
                    speech={speech}
                  />
                  <button
                    type="button"
                    disabled={safeChunkIdx === 0}
                    onClick={() => setChunkIndex((i) => Math.max(0, i - 1))}
                    className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 text-xs font-medium disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Prev</span>
                  </button>
                  <button
                    type="button"
                    disabled={safeChunkIdx >= readingChunks.length - 1}
                    onClick={() =>
                      setChunkIndex((i) => Math.min(readingChunks.length - 1, i + 1))
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-xl bg-slate-900 dark:bg-white px-3 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-40 cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {currentChunk.emoji} {currentChunk.title}
              </h3>

              <InteractiveReadingText
                text={currentChunk.text}
                clipId={`chunk-${currentChunk.id}`}
                prefs={readingPrefs}
                speech={speech}
                definitionCache={definitionCache}
                onLookupWord={lookupWord}
                jargonGlossary={analysis.jargonGlossary}
              />
            </article>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <article
                onClick={() => readingPrefs.focusRuler && setFocusIndex(0)}
                className={`rounded-2xl border p-5 ${surfaceClass} ${getFocusClass(0)}`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    💡 the gist
                  </h3>
                  <ListenButton
                    clipId="card-gist"
                    label="the gist"
                    textToRead={buildSectionSpeechText('The gist', analysis.theGist)}
                    speech={speech}
                  />
                </div>
                <InteractiveReadingText
                  text={analysis.theGist}
                  clipId="card-gist"
                  prefs={readingPrefs}
                  speech={speech}
                  definitionCache={definitionCache}
                  onLookupWord={lookupWord}
                  jargonGlossary={analysis.jargonGlossary}
                />
              </article>

              <article
                onClick={() => readingPrefs.focusRuler && setFocusIndex(1)}
                className={`rounded-2xl border p-5 ${surfaceClass} ${getFocusClass(1)}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    🧩 made simple
                  </h3>

                  <div className="flex items-center gap-2">
                    <div
                      role="tablist"
                      aria-label="Concept view format"
                      className="inline-flex rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 p-0.5"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={simpleViewMode === 'list'}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSimpleView('list');
                        }}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                          simpleViewMode === 'list'
                            ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                            : 'text-slate-500 dark:text-zinc-400'
                        }`}
                      >
                        <List className="h-3 w-3" aria-hidden="true" />
                        <span>List</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={simpleViewMode === 'flow'}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSimpleView('flow');
                        }}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                          simpleViewMode === 'flow'
                            ? 'bg-[#7C3AED] text-white shadow-2xs'
                            : 'text-slate-500 dark:text-zinc-400'
                        }`}
                      >
                        <GitBranch className="h-3 w-3" aria-hidden="true" />
                        <span>Show as Flow</span>
                      </button>
                    </div>

                    <ListenButton
                      clipId="card-simple"
                      label="made simple"
                      textToRead={buildSectionSpeechText('Made simple', analysis.madeSimple)}
                      speech={speech}
                    />
                  </div>
                </div>

                {simpleViewMode === 'flow' ? (
                  <div className="space-y-3" data-testid="visual-flow-map">
                    {isFlowLoading && flowNodes.length === 0 && (
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        Refining visual concept nodes...
                      </p>
                    )}
                    <div className="flex flex-col gap-2">
                      {displayFlowNodes.map((node, idx) => {
                        const isSelected = activeFlowNodeIdx === idx;
                        return (
                          <div key={node.id} className="flex flex-col items-stretch">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveFlowNodeIdx(idx);
                              }}
                              className={`rounded-xl border px-3.5 py-2.5 text-left transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-[#7C3AED] bg-[#7C3AED]/[0.08] dark:bg-[#7C3AED]/20'
                                  : 'border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/60 hover:border-[#3B82F6]/60'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-display text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                                  {idx + 1}. {node.title}
                                </span>
                                <span className="font-mono-tabular text-[10px] font-semibold text-[#7C3AED] dark:text-[#A78BFA]">
                                  {node.kind === 'start'
                                    ? 'Start'
                                    : node.kind === 'outcome'
                                    ? 'Result'
                                    : 'Process'}
                                </span>
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-zinc-300">
                                {node.detail}
                              </p>
                            </button>
                            {idx < displayFlowNodes.length - 1 && (
                              <div className="flex justify-center py-0.5 text-[#3B82F6]">
                                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-[11px] font-semibold text-slate-600 dark:text-zinc-300">
                      {displayFlowNodes.map((n, i) => (
                        <span key={n.id} className="inline-flex items-center gap-1">
                          <span
                            className={
                              activeFlowNodeIdx === i
                                ? 'text-[#7C3AED] dark:text-[#A78BFA]'
                                : ''
                            }
                          >
                            {n.title}
                          </span>
                          {i < displayFlowNodes.length - 1 && (
                            <ArrowRight className="h-3 w-3 text-[#3B82F6]" aria-hidden="true" />
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-zinc-300">
                    {analysis.madeSimple.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="font-mono-tabular text-xs font-semibold text-[#7C3AED] dark:text-[#A78BFA] mt-1 shrink-0">
                          0{idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <InteractiveReadingText
                            text={point}
                            clipId="card-simple"
                            prefs={readingPrefs}
                            speech={speech}
                            definitionCache={definitionCache}
                            onLookupWord={lookupWord}
                            jargonGlossary={analysis.jargonGlossary}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </article>

              <article
                onClick={() => readingPrefs.focusRuler && setFocusIndex(2)}
                className={`rounded-2xl border p-5 ${surfaceClass} ${getFocusClass(2)}`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    🎯 exam cheatcode
                  </h3>
                  <ListenButton
                    clipId="card-cheatcode"
                    label="exam cheatcode"
                    textToRead={buildSectionSpeechText(
                      'Exam cheatcode',
                      analysis.examCheatcode
                    )}
                    speech={speech}
                  />
                </div>
                <InteractiveReadingText
                  text={analysis.examCheatcode}
                  clipId="card-cheatcode"
                  prefs={readingPrefs}
                  speech={speech}
                  definitionCache={definitionCache}
                  onLookupWord={lookupWord}
                  jargonGlossary={analysis.jargonGlossary}
                />
              </article>

              <article
                onClick={() => readingPrefs.focusRuler && setFocusIndex(3)}
                className={`rounded-2xl border p-5 ${surfaceClass} ${getFocusClass(3)}`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    🌍 irl example
                  </h3>
                  <ListenButton
                    clipId="card-irl"
                    label="in real life example"
                    textToRead={buildSectionSpeechText(
                      'In real life example',
                      analysis.irlExample
                    )}
                    speech={speech}
                  />
                </div>
                <InteractiveReadingText
                  text={analysis.irlExample}
                  clipId="card-irl"
                  prefs={readingPrefs}
                  speech={speech}
                  definitionCache={definitionCache}
                  onLookupWord={lookupWord}
                  jargonGlossary={analysis.jargonGlossary}
                />
              </article>
            </div>
          )}

          {/* VISION 2.0 EXPLORATION DECK (#6, #7, #8, #10, #11, #14, #15, #17) */}
          <VisionToolsDeck
            analysis={analysis}
            speech={speech}
            onSaveGeneratedFlashcards={onSaveGeneratedFlashcards}
            onStartQuiz={onLaunchSmartQuiz}
            onExploreConcept={onExploreConcept}
          />

          {/* FEATURES #18 & #19: CONFIDENCE TRACKER + SIMPLI COMPANION */}
          <section
            aria-label="Confidence Tracker and Simpli Companion"
            className="rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  How is this feeling right now?
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Your feedback tunes Simpli&apos;s pacing and updates Insights automatically.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2" data-testid="confidence-tracker">
                {(
                  [
                    { id: 'not-yet', label: '😬 Not Yet' },
                    { id: 'getting-there', label: '🙂 Getting There' },
                    { id: 'got-it', label: '😎 Got It' },
                  ] as const
                ).map((btn) => {
                  const active = topicConfidence === btn.id;
                  return (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => {
                        setTopicConfidence(btn.id);
                        onRecordConfidence(
                          analysis.detectedTopic,
                          btn.id,
                          analysis.confusionMeter?.level
                        );
                      }}
                      className={`inline-flex h-9 items-center rounded-xl px-3.5 text-xs font-semibold transition-all cursor-pointer ${
                        active
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                          : 'border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-200 hover:border-[#7C3AED]'
                      }`}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Simpli Companion (#18) */}
            <div
              data-testid="simpli-companion"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#7C3AED]/20 bg-[#7C3AED]/[0.04] dark:bg-[#7C3AED]/10 px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-700 text-base"
                >
                  🌱
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    {companion.quote}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-zinc-400">
                    {companion.suggestion}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {topicConfidence === 'not-yet' ? (
                  <button
                    type="button"
                    onClick={handleTriggerImLost}
                    className="rounded-xl bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                  >
                    Slow It Down
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleExplainDifferently()}
                    className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-zinc-200 cursor-pointer"
                  >
                    Try Another Angle
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Optional Quick "Did It Click?" Micro-Check */}
          <MicroCheckCard
            key={analysis.detectedTopic + analysis.brainMode}
            topic={analysis.detectedTopic}
            theGist={analysis.theGist}
            brainMode={analysis.brainMode}
            speech={speech}
          />

          {/* ask anything + Voice Studio Handoff */}
          <article className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                ❓ ask anything
              </h3>
              <button
                type="button"
                onClick={onDiscussInVoiceStudio}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/8 dark:bg-[#7C3AED]/15 px-3 py-1.5 text-xs font-semibold text-[#7C3AED] dark:text-[#A78BFA] cursor-pointer"
              >
                <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Talk in Voice Tutor</span>
              </button>
            </div>

            {analysis.suggestedQuestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {analysis.suggestedQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={isChatLoading}
                    onClick={() => onSendChat(q)}
                    className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:border-[#3B82F6] transition-colors text-left cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {chatMessages.length > 0 && (
              <div className="space-y-2.5">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white ml-8'
                        : 'border border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/70 text-slate-800 dark:text-zinc-200 mr-8'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                        {msg.role === 'user' ? 'You' : 'Simpli'}
                      </span>
                      {msg.role === 'assistant' && (
                        <ListenButton
                          clipId={`chat-${msg.id}`}
                          label="reply"
                          textToRead={msg.content}
                          speech={speech}
                        />
                      )}
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
              </div>
            )}
          </article>

          {/* Collapsible OCR Source */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/40 px-4 py-3">
            <button
              type="button"
              aria-expanded={showOcr}
              onClick={() => setShowOcr((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold text-slate-600 dark:text-zinc-400 cursor-pointer"
            >
              <span>OCR &amp; Extracted Source Notes</span>
              {showOcr ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showOcr && (
              <p className="mt-2.5 text-xs leading-relaxed text-slate-600 dark:text-zinc-400 whitespace-pre-wrap">
                {analysis.extractedText}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Pinned Bottom Follow-up Bar */}
      <div className="border-t border-slate-200/80 dark:border-zinc-800 bg-white/95 dark:bg-[#09090B]/95 px-4 py-3.5 sm:px-8">
        <form
          onSubmit={handleChatSubmit}
          className="mx-auto flex max-w-4xl items-center gap-2.5"
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask a follow-up question about this..."
            aria-label="Ask a follow-up question"
            className="h-11 flex-1 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 px-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-[#7C3AED] focus:outline-none"
          />
          <button
            type="submit"
            disabled={isChatLoading || !chatInput.trim()}
            aria-label="Send follow-up question"
            className="inline-flex h-11 items-center gap-1.5 rounded-2xl bg-slate-900 dark:bg-white px-5 text-xs sm:text-sm font-semibold text-white dark:text-slate-900 hover:bg-[#7C3AED] dark:hover:bg-[#7C3AED] dark:hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isChatLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            <span>Ask</span>
          </button>
        </form>
      </div>
    </div>
  );
}
