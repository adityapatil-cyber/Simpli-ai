import { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Headphones,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  Sparkles,
  Square,
  Volume2,
  Zap,
} from 'lucide-react';
import {
  buildFlashcardTxtExport,
  buildReviewFlashcards,
} from '../utils/simpliLogic';
import type {
  AutoFlashcard,
  FlashcardMastery,
  SavedClarifySession,
  SimpliAnalysis,
  SmartQuizData,
  VoiceConversation,
} from '../types/simpli';
import type { useSpeechPlayer } from '../hooks/useSpeechPlayer';

interface QuickReviewViewProps {
  clarifySessions: SavedClarifySession[];
  conversations: VoiceConversation[];
  generatedFlashcards: AutoFlashcard[];
  activeQuiz: SmartQuizData | null;
  activeAnalysis: SimpliAnalysis | null;
  onSetQuiz: (quiz: SmartQuizData | null) => void;
  speech: ReturnType<typeof useSpeechPlayer>;
}

const MASTERY_STORAGE_KEY = 'simpli_flashcard_mastery';

export function QuickReviewView({
  clarifySessions,
  conversations,
  generatedFlashcards,
  activeQuiz,
  activeAnalysis,
  onSetQuiz,
  speech,
}: QuickReviewViewProps) {
  const [modeTab, setModeTab] = useState<'flashcards' | 'quiz'>(
    activeQuiz ? 'quiz' : 'flashcards'
  );
  const [filter, setFilter] = useState<
    'all' | 'generated' | 'clarify' | 'voice' | 'needs-review'
  >('all');
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mastery, setMastery] = useState<Record<string, FlashcardMastery>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem(MASTERY_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as Record<string, FlashcardMastery>) : {};
    } catch {
      return {};
    }
  });
  const [isExportingWav, setIsExportingWav] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Smart Quiz state
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  useEffect(() => {
    if (activeQuiz) {
      setModeTab('quiz');
      setQuizAnswers({});
    }
  }, [activeQuiz]);

  useEffect(() => {
    try {
      localStorage.setItem(MASTERY_STORAGE_KEY, JSON.stringify(mastery));
    } catch {
      // ignore storage quota
    }
  }, [mastery]);

  const allCards = useMemo(
    () =>
      buildReviewFlashcards(clarifySessions, conversations, generatedFlashcards),
    [clarifySessions, conversations, generatedFlashcards]
  );

  const filteredCards = useMemo(() => {
    if (filter === 'all') return allCards;
    if (filter === 'needs-review') {
      return allCards.filter((c) => mastery[c.id] !== 'got-it');
    }
    return allCards.filter((c) => c.source === filter);
  }, [allCards, filter, mastery]);

  const safeIndex = Math.min(cardIndex, Math.max(0, filteredCards.length - 1));
  const activeCard = filteredCards[safeIndex] ?? null;

  const gotItCount = useMemo(
    () => allCards.filter((c) => mastery[c.id] === 'got-it').length,
    [allCards, mastery]
  );

  const goToCard = (nextIdx: number) => {
    setIsFlipped(false);
    setCardIndex(Math.max(0, Math.min(filteredCards.length - 1, nextIdx)));
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (modeTab !== 'flashcards') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (filteredCards.length === 0) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToCard(safeIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToCard(safeIndex - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCards.length, modeTab, safeIndex]);

  const isPlayingActive =
    activeCard !== null &&
    speech.activeId === activeCard.id &&
    speech.status === 'playing';
  const isPausedActive =
    activeCard !== null &&
    speech.activeId === activeCard.id &&
    speech.status === 'paused';

  const handleSetMastery = (cardId: string, status: FlashcardMastery) => {
    setMastery((prev) => ({ ...prev, [cardId]: status }));
    if (safeIndex < filteredCards.length - 1) {
      window.setTimeout(() => goToCard(safeIndex + 1), 160);
    }
  };

  const handleDownloadTxt = () => {
    setExportNotice(null);
    const content = buildFlashcardTxtExport(filteredCards);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'simpli-quick-review.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadWav = async () => {
    if (!activeCard) return;
    setExportNotice(null);
    setIsExportingWav(true);
    try {
      const { blob, filenameExt } = await speech.fetchTtsAudioClip(activeCard.recapScript);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeCard.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${filenameExt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportNotice(
        err instanceof Error
          ? err.message
          : 'Could not export WAV audio right now. Try Listen to Recap or Export Script.'
      );
    } finally {
      setIsExportingWav(false);
    }
  };

  const handleGenerateSmartQuiz = async () => {
    const sourceTopic =
      activeAnalysis?.detectedTopic || clarifySessions[0]?.analysis.detectedTopic;
    const sourceGist =
      activeAnalysis?.theGist || clarifySessions[0]?.analysis.theGist || '';
    const sourcePoints =
      activeAnalysis?.madeSimple || clarifySessions[0]?.analysis.madeSimple || [];

    if (!sourceTopic) {
      setQuizError('Simplify any study topic first to generate a Smart Quiz.');
      return;
    }

    setIsGeneratingQuiz(true);
    setQuizError(null);
    try {
      const res = await fetch('/api/smart-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: sourceTopic,
          theGist: sourceGist,
          madeSimple: sourcePoints,
        }),
      });
      const data = (await res.json()) as SmartQuizData & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not create quiz.');
      onSetQuiz(data);
      setQuizAnswers({});
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : 'Unable to generate quiz.');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const activeStatus = activeCard ? mastery[activeCard.id] ?? 'unseen' : 'unseen';
  const progressPct =
    allCards.length > 0 ? Math.round((gotItCount / allCards.length) * 100) : 0;

  const quizScore = useMemo(() => {
    if (!activeQuiz) return { answered: 0, correct: 0, weakConcepts: [] as string[] };
    let answered = 0;
    let correct = 0;
    const weakSet = new Set<string>();
    activeQuiz.questions.forEach((q) => {
      const picked = quizAnswers[q.id];
      if (typeof picked === 'number') {
        answered += 1;
        if (picked === q.correctIndex) {
          correct += 1;
        } else if (q.conceptTag) {
          weakSet.add(q.conceptTag);
        }
      }
    });
    return { answered, correct, weakConcepts: Array.from(weakSet) };
  }, [activeQuiz, quizAnswers]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header + Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              Review &amp; Quizzes
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
              Flip flashcards with arrows, listen to audio recaps, or test yourself gently with Smart Quiz.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Review workspace mode"
            className="inline-flex rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={modeTab === 'flashcards'}
              onClick={() => setModeTab('flashcards')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                modeTab === 'flashcards'
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              <Zap className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden="true" />
              <span>Interactive Flashcards ({allCards.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={modeTab === 'quiz'}
              onClick={() => setModeTab('quiz')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                modeTab === 'quiz'
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              <Brain className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
              <span>Smart Quiz (Test Me)</span>
            </button>
          </div>
        </div>

        {/* VIEW A: SMART QUIZ MODE (#13) */}
        {modeTab === 'quiz' && (
          <div className="space-y-5 animate-card-enter" data-testid="smart-quiz-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-4">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {activeQuiz ? `Smart Quiz: ${activeQuiz.topic}` : 'Progressive Self-Check'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Easy → Medium → Challenge questions with calm explanations and weak-area detection.
                </p>
              </div>
              <button
                type="button"
                disabled={isGeneratingQuiz}
                onClick={handleGenerateSmartQuiz}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-4 text-xs font-semibold text-white dark:text-slate-900 hover:bg-[#7C3AED] dark:hover:bg-[#7C3AED] dark:hover:text-white cursor-pointer disabled:opacity-50"
              >
                {isGeneratingQuiz ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>
                  {activeQuiz ? 'Generate Fresh Quiz' : 'Generate Quiz for Active Topic'}
                </span>
              </button>
            </div>

            {quizError && (
              <p role="alert" className="rounded-xl bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                {quizError}
              </p>
            )}

            {!activeQuiz ? (
              <div className="rounded-3xl border border-dashed border-slate-200 dark:border-zinc-800 p-10 text-center space-y-2">
                <Brain className="h-8 w-8 text-[#10B981] mx-auto" aria-hidden="true" />
                <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                  No active quiz loaded yet
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Click &ldquo;Generate Quiz for Active Topic&rdquo; above or tap 🧠 Test Me inside Clarify Studio.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeQuiz.questions.map((q, idx) => {
                  const picked = quizAnswers[q.id];
                  const isAnswered = typeof picked === 'number';
                  const isCorrect = picked === q.correctIndex;
                  return (
                    <article
                      key={q.id || idx}
                      className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono-tabular text-xs font-bold text-[#7C3AED] dark:text-[#A78BFA]">
                          Q{idx + 1} · {q.difficulty} · {q.conceptTag}
                        </span>
                        <button
                          type="button"
                          onClick={() => speech.speak(`quiz-q-${q.id}`, q.question)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 px-2.5 text-[11px] font-medium cursor-pointer"
                        >
                          <Volume2 className="h-3 w-3" />
                          <span>Hear</span>
                        </button>
                      </div>

                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                        {q.question}
                      </h3>

                      <div className="grid grid-cols-1 gap-2">
                        {q.options.map((opt, optIdx) => {
                          const chosen = picked === optIdx;
                          const rightOpt = optIdx === q.correctIndex;
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() =>
                                setQuizAnswers((prev) => ({ ...prev, [q.id]: optIdx }))
                              }
                              className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs sm:text-sm transition-colors cursor-pointer ${
                                isAnswered && rightOpt
                                  ? 'border-[#10B981] bg-[#10B981]/12 text-slate-900 dark:text-white font-semibold'
                                  : chosen
                                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-slate-900 dark:text-zinc-100'
                                  : 'border-slate-200 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-950 text-slate-700 dark:text-zinc-200 hover:border-[#7C3AED]'
                              }`}
                            >
                              <span>{opt}</span>
                              {isAnswered && rightOpt && (
                                <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {isAnswered && (
                        <div
                          className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                            isCorrect
                              ? 'bg-[#10B981]/10 text-slate-800 dark:text-zinc-100'
                              : 'bg-amber-50 dark:bg-amber-950/40 text-slate-800 dark:text-zinc-200'
                          }`}
                        >
                          <span className="font-bold">
                            {isCorrect ? '✅ Nice! ' : '💡 Gentle clarity: '}
                          </span>
                          {q.explanation}
                        </div>
                      )}
                    </article>
                  );
                })}

                {quizScore.answered > 0 && (
                  <div className="rounded-2xl border border-[#7C3AED]/30 bg-[#7C3AED]/[0.05] dark:bg-[#7C3AED]/15 p-5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                        Quiz Progress &amp; Next Step
                      </span>
                      <span className="font-mono-tabular text-xs font-bold text-[#059669] dark:text-[#34D399]">
                        {quizScore.correct}/{activeQuiz.questions.length} clicked cleanly
                      </span>
                    </div>
                    {quizScore.weakConcepts.length > 0 ? (
                      <p className="text-xs text-slate-700 dark:text-zinc-200">
                        Weak spots spotted:{' '}
                        <span className="font-semibold">
                          {quizScore.weakConcepts.join(', ')}
                        </span>
                        . Next step: flip the matching flashcards or try &ldquo;Explain Differently&rdquo; in Clarify Studio.
                      </p>
                    ) : (
                      <p className="text-xs text-slate-700 dark:text-zinc-200">
                        Every answered question clicked cleanly! Save your streak or try a harder topic next.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* VIEW B: INTERACTIVE FLASHCARDS */}
        {modeTab === 'flashcards' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 p-1">
                {(
                  [
                    { id: 'all', label: `All (${allCards.length})` },
                    ...(generatedFlashcards.length > 0
                      ? [
                          {
                            id: 'generated' as const,
                            label: `⚡ Generated (${generatedFlashcards.length})`,
                          },
                        ]
                      : []),
                    {
                      id: 'clarify',
                      label: `Clarifications (${allCards.filter((c) => c.source === 'clarify').length})`,
                    },
                    {
                      id: 'voice',
                      label: `Voice (${allCards.filter((c) => c.source === 'voice').length})`,
                    },
                    {
                      id: 'needs-review',
                      label: `Review Queue (${allCards.filter((c) => mastery[c.id] !== 'got-it').length})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setFilter(tab.id);
                      setCardIndex(0);
                      setIsFlipped(false);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      filter === tab.id
                        ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono-tabular text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                  {gotItCount}/{allCards.length} Got it ({progressPct}%)
                </span>

                <button
                  type="button"
                  onClick={handleDownloadTxt}
                  disabled={filteredCards.length === 0}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:border-[#7C3AED] cursor-pointer disabled:opacity-50"
                >
                  <FileText className="h-3.5 w-3.5 text-[#3B82F6]" />
                  <span>.txt</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadWav}
                  disabled={!activeCard || isExportingWav}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-2.5 text-xs font-semibold text-white dark:text-slate-900 hover:bg-[#7C3AED] dark:hover:bg-[#7C3AED] dark:hover:text-white cursor-pointer disabled:opacity-50"
                >
                  {isExportingWav ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span>.wav</span>
                </button>
              </div>
            </div>

            {exportNotice && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                {exportNotice}
              </div>
            )}

            {/* Interactive Flashcard Stage */}
            {!activeCard ? (
              <div className="rounded-3xl border border-dashed border-slate-200 dark:border-zinc-800 p-10 text-center space-y-2">
                <Headphones className="h-8 w-8 text-[#7C3AED] mx-auto" aria-hidden="true" />
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {filter === 'needs-review'
                    ? 'Everything in this queue is marked Got It'
                    : 'No flashcards in this filter yet'}
                </h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  {filter === 'needs-review'
                    ? 'Switch to All to revisit any card anytime.'
                    : 'Clarify an image/PDF or tap ⚡ Generate Flashcards in Clarify Studio.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 font-mono-tabular">
                  <span>
                    Card {safeIndex + 1} of {filteredCards.length}
                  </span>
                  {activeCard.difficultyTag && (
                    <span className="font-semibold text-[#7C3AED] dark:text-[#A78BFA]">
                      {activeCard.difficultyTag} · {activeCard.conceptTag}
                    </span>
                  )}
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] via-[#3B82F6] to-[#10B981] transition-all duration-300"
                    style={{
                      width: `${Math.round(((safeIndex + 1) / filteredCards.length) * 100)}%`,
                    }}
                  />
                </div>

                <div className="flex items-center gap-2 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => goToCard(safeIndex - 1)}
                    disabled={safeIndex === 0}
                    aria-label="Previous flashcard"
                    className="hidden sm:inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 shadow-xs hover:border-[#7C3AED] hover:text-[#7C3AED] disabled:opacity-35 transition-all cursor-pointer"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <div
                    key={activeCard.id}
                    className="flex-1 min-w-0 perspective-1200 animate-card-enter"
                  >
                    <div
                      className={`relative rounded-3xl border shadow-sm transition-all duration-300 ${
                        isFlipped
                          ? 'border-[#10B981]/40 bg-gradient-to-br from-[#10B981]/[0.06] via-white to-[#3B82F6]/[0.06] dark:from-[#10B981]/15 dark:via-zinc-900 dark:to-[#3B82F6]/15'
                          : 'border-slate-200/90 dark:border-zinc-800 bg-gradient-to-br from-[#7C3AED]/[0.07] via-white to-[#3B82F6]/[0.06] dark:from-[#7C3AED]/18 dark:via-zinc-900 dark:to-[#3B82F6]/12'
                      } p-6 sm:p-8 min-h-[300px] flex flex-col justify-between gap-5`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#7C3AED] dark:text-[#A78BFA]">
                          <span>{activeCard.subtitle}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-500 dark:text-zinc-400">
                            {isFlipped ? 'Answer & Recap' : 'Recall Prompt'}
                          </span>
                          {activeStatus === 'got-it' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#059669] dark:text-[#34D399]">Got It</span>
                            </>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsFlipped((f) => !f)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:border-[#7C3AED] cursor-pointer"
                        >
                          <RotateCw className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden="true" />
                          <span>{isFlipped ? 'Show Prompt' : 'Flip Card'}</span>
                        </button>
                      </div>

                      {!isFlipped ? (
                        <div className="my-auto space-y-4 py-2">
                          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                            {activeCard.title}
                          </h2>
                          <p className="text-base sm:text-lg leading-relaxed text-slate-700 dark:text-zinc-200">
                            {activeCard.promptQuestion}
                          </p>
                          <button
                            type="button"
                            onClick={() => setIsFlipped(true)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 dark:bg-white px-5 text-xs sm:text-sm font-semibold text-white dark:text-slate-900 hover:bg-[#7C3AED] dark:hover:bg-[#7C3AED] dark:hover:text-white transition-colors cursor-pointer"
                          >
                            <RotateCw className="h-4 w-4" aria-hidden="true" />
                            <span>Reveal Answer &amp; Recap</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                              {activeCard.title}
                            </h2>
                            <p className="mt-2.5 text-base leading-relaxed text-slate-800 dark:text-zinc-100">
                              {activeCard.keyTakeaway}
                            </p>
                          </div>

                          {activeCard.examTip && (
                            <div className="rounded-xl border border-[#7C3AED]/20 bg-[#7C3AED]/[0.05] dark:bg-[#7C3AED]/15 px-3.5 py-2.5 text-xs text-slate-700 dark:text-zinc-200">
                              <span className="font-bold text-[#7C3AED] dark:text-[#A78BFA]">
                                Cheatcode:{' '}
                              </span>
                              {activeCard.examTip}
                            </div>
                          )}

                          <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white/85 dark:bg-zinc-950/75 p-4">
                            <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 mb-1">
                              20-Second Audio Recap Script
                            </p>
                            <p className="text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                              {activeCard.recapScript}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/70 dark:border-zinc-800">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => speech.speak(activeCard.id, activeCard.recapScript)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] px-4 text-xs sm:text-sm font-semibold text-white cursor-pointer"
                          >
                            {isPlayingActive ? (
                              <Pause className="h-4 w-4" />
                            ) : isPausedActive ? (
                              <Play className="h-4 w-4" />
                            ) : (
                              <Volume2 className="h-4 w-4" />
                            )}
                            <span>
                              {isPlayingActive
                                ? 'Pause Audio'
                                : isPausedActive
                                ? 'Resume Audio'
                                : 'Listen to Recap'}
                            </span>
                          </button>

                          {speech.status !== 'idle' && (
                            <button
                              type="button"
                              onClick={speech.stop}
                              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-xs font-medium cursor-pointer"
                            >
                              <Square className="h-3.5 w-3.5 fill-current" />
                              <span>Stop</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSetMastery(activeCard.id, 'review-again')}
                            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold cursor-pointer ${
                              activeStatus === 'review-again'
                                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                                : 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-600 dark:text-zinc-300 hover:border-amber-400'
                            }`}
                          >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Review Again</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSetMastery(activeCard.id, 'got-it')}
                            className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold cursor-pointer ${
                              activeStatus === 'got-it'
                                ? 'bg-[#10B981] text-white'
                                : 'border border-[#10B981]/40 bg-[#10B981]/10 text-[#059669] dark:text-[#34D399] hover:bg-[#10B981] hover:text-white'
                            }`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Got It</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => goToCard(safeIndex + 1)}
                    disabled={safeIndex >= filteredCards.length - 1}
                    aria-label="Next flashcard"
                    className="hidden sm:inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 shadow-xs hover:border-[#7C3AED] hover:text-[#7C3AED] disabled:opacity-35 transition-all cursor-pointer"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => goToCard(safeIndex - 1)}
                    disabled={safeIndex === 0}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-200 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    <span>Previous Card</span>
                  </button>

                  <span className="text-xs text-slate-500 dark:text-zinc-400">
                    Use ← / → arrow keys to step cards
                  </span>

                  <button
                    type="button"
                    onClick={() => goToCard(safeIndex + 1)}
                    disabled={safeIndex >= filteredCards.length - 1}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-4 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-40 cursor-pointer"
                  >
                    <span>Next Card</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            {filteredCards.length > 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {filteredCards.map((card, idx) => {
                  const cardStatus = mastery[card.id];
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => goToCard(idx)}
                      className={`rounded-2xl border p-4 text-left transition-colors cursor-pointer ${
                        idx === safeIndex
                          ? 'border-[#7C3AED] bg-[#7C3AED]/[0.05] dark:bg-[#7C3AED]/15'
                          : 'border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                          {card.subtitle}
                        </p>
                        {cardStatus === 'got-it' && (
                          <span className="text-[11px] font-semibold text-[#059669] dark:text-[#34D399]">
                            ✓ Got It
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                        {card.title}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
