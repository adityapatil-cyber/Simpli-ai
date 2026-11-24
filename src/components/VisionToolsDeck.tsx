import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Box,
  Briefcase,
  CheckSquare,
  Compass,
  Download,
  FileSearch,
  Flame,
  Layers,
  Loader2,
  Map as MapIcon,
  Network,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react';
import { ConceptScene3D } from './ConceptScene3D';
import { buildStudyPackMarkdown } from '../utils/simpliLogic';
import type {
  AutoFlashcard,
  KnowledgeWebResult,
  PanicModePack,
  PrerequisiteStep,
  RealWorldConnectionsResult,
  ResearchPaperDecodeResult,
  SimpliAnalysis,
  SimpliMapResult,
  SimpliMapType,
  SmartQuizData,
  StudyPackData,
} from '../types/simpli';
import type { useSpeechPlayer } from '../hooks/useSpeechPlayer';

type DeckTabId =
  | 'heatmap'
  | 'maps'
  | '3d-scene'
  | 'prerequisites'
  | 'web'
  | 'real-world'
  | 'study-pack'
  | 'research'
  | 'panic';

interface VisionToolsDeckProps {
  analysis: SimpliAnalysis;
  speech: ReturnType<typeof useSpeechPlayer>;
  onSaveGeneratedFlashcards: (cards: AutoFlashcard[]) => void;
  onStartQuiz: (quiz: SmartQuizData) => void;
  onExploreConcept: (concept: string) => void;
}

const MAP_TYPES: Array<{ id: SimpliMapType; label: string }> = [
  { id: 'mind-map', label: 'Mind Map' },
  { id: 'concept-map', label: 'Concept Map' },
  { id: 'flowchart', label: 'Flowchart' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'knowledge-tree', label: 'Knowledge Tree' },
  { id: 'relationship-diagram', label: 'Relationship Diagram' },
];

export function VisionToolsDeck({
  analysis,
  speech,
  onSaveGeneratedFlashcards,
  onStartQuiz,
  onExploreConcept,
}: VisionToolsDeckProps) {
  const [activeTab, setActiveTab] = useState<DeckTabId | null>(null);
  const [loadingTab, setLoadingTab] = useState<string | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);

  // Feature #6 Simpli Maps
  const [selectedMapType, setSelectedMapType] = useState<SimpliMapType>('mind-map');
  const [mapCache, setMapCache] = useState<Partial<Record<SimpliMapType, SimpliMapResult>>>({});

  // Feature #7 Prerequisites
  const [prereqSteps, setPrereqSteps] = useState<PrerequisiteStep[]>([]);
  const [checkedPrereqs, setCheckedPrereqs] = useState<Record<string, boolean>>({});
  const [expandedPrereqId, setExpandedPrereqId] = useState<string | null>(null);

  // Feature #8 Knowledge Web
  const [knowledgeWeb, setKnowledgeWeb] = useState<KnowledgeWebResult | null>(null);
  const [selectedBranchIdx, setSelectedBranchIdx] = useState(0);

  // Feature #11 Real-World Connections
  const [realWorld, setRealWorld] = useState<RealWorldConnectionsResult | null>(null);

  // Feature #14 Study Pack
  const [studyPack, setStudyPack] = useState<StudyPackData | null>(null);

  // Feature #15 Research Paper Decoder
  const [researchPaper, setResearchPaper] = useState<ResearchPaperDecodeResult | null>(null);

  // Feature #17 Panic Mode ("🚨 Exam Tomorrow")
  const [panicPack, setPanicPack] = useState<PanicModePack | null>(null);

  useEffect(() => {
    setActiveTab(null);
    setTabError(null);
    setMapCache({});
    setPrereqSteps([]);
    setCheckedPrereqs({});
    setExpandedPrereqId(null);
    setKnowledgeWeb(null);
    setRealWorld(null);
    setStudyPack(null);
    setResearchPaper(null);
    setPanicPack(null);
  }, [analysis.detectedTopic, analysis.brainMode]);

  const loadMap = async (mapType: SimpliMapType) => {
    setSelectedMapType(mapType);
    if (mapCache[mapType]) return;
    setLoadingTab(`map-${mapType}`);
    setTabError(null);
    try {
      const res = await fetch('/api/simpli-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: analysis.detectedTopic,
          theGist: analysis.theGist,
          madeSimple: analysis.madeSimple,
          mapType,
        }),
      });
      const data = (await res.json()) as SimpliMapResult & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not generate visual map.');
      setMapCache((prev) => ({ ...prev, [mapType]: data }));
    } catch (err) {
      setTabError(err instanceof Error ? err.message : 'Unable to load map.');
    } finally {
      setLoadingTab(null);
    }
  };

  const openTab = async (tab: DeckTabId) => {
    if (activeTab === tab) {
      setActiveTab(null);
      return;
    }
    setActiveTab(tab);
    setTabError(null);

    if (tab === 'heatmap' || tab === '3d-scene') return;

    if (tab === 'maps') {
      await loadMap(selectedMapType);
      return;
    }

    if (tab === 'prerequisites' && prereqSteps.length === 0) {
      setLoadingTab('prerequisites');
      try {
        const res = await fetch('/api/prerequisites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: analysis.detectedTopic,
            theGist: analysis.theGist,
          }),
        });
        const data = (await res.json()) as { steps?: PrerequisiteStep[]; error?: string };
        if (!res.ok) throw new Error(data.error || 'Could not build prerequisite path.');
        setPrereqSteps(data.steps ?? []);
        if (data.steps?.[0]) setExpandedPrereqId(data.steps[0].id);
      } catch (err) {
        setTabError(err instanceof Error ? err.message : 'Unable to load prerequisites.');
      } finally {
        setLoadingTab(null);
      }
      return;
    }

    if (tab === 'web' && !knowledgeWeb) {
      setLoadingTab('web');
      try {
        const res = await fetch('/api/knowledge-web', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: analysis.detectedTopic,
            theGist: analysis.theGist,
          }),
        });
        const data = (await res.json()) as KnowledgeWebResult & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Could not load Knowledge Web.');
        setKnowledgeWeb(data);
        setSelectedBranchIdx(0);
      } catch (err) {
        setTabError(err instanceof Error ? err.message : 'Unable to load Knowledge Web.');
      } finally {
        setLoadingTab(null);
      }
      return;
    }

    if (tab === 'real-world' && !realWorld) {
      setLoadingTab('real-world');
      try {
        const res = await fetch('/api/real-world', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: analysis.detectedTopic,
            theGist: analysis.theGist,
          }),
        });
        const data = (await res.json()) as RealWorldConnectionsResult & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Could not load real-world uses.');
        setRealWorld(data);
      } catch (err) {
        setTabError(err instanceof Error ? err.message : 'Unable to load connections.');
      } finally {
        setLoadingTab(null);
      }
      return;
    }

    if (tab === 'study-pack' && !studyPack) {
      setLoadingTab('study-pack');
      try {
        const res = await fetch('/api/study-pack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: analysis.detectedTopic,
            theGist: analysis.theGist,
            madeSimple: analysis.madeSimple,
            extractedText: analysis.extractedText,
          }),
        });
        const data = (await res.json()) as StudyPackData & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Could not generate Study Pack.');
        setStudyPack(data);
        const now = new Date().toISOString();
        if (Array.isArray(data.flashcards) && data.flashcards.length > 0) {
          onSaveGeneratedFlashcards(
            data.flashcards.map((f, i) => ({
              id: `sp-fc-${Date.now()}-${i}`,
              question: f.question,
              answer: f.answer,
              difficulty: f.difficulty,
              conceptTag: f.conceptTag || analysis.detectedTopic,
              topic: analysis.detectedTopic,
              createdAt: now,
            }))
          );
        }
      } catch (err) {
        setTabError(err instanceof Error ? err.message : 'Unable to build Study Pack.');
      } finally {
        setLoadingTab(null);
      }
      return;
    }

    if (tab === 'research' && !researchPaper) {
      setLoadingTab('research');
      try {
        const res = await fetch('/api/research-decoder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: analysis.detectedTopic,
            extractedText: analysis.extractedText,
            theGist: analysis.theGist,
          }),
        });
        const data = (await res.json()) as ResearchPaperDecodeResult & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Could not decode paper.');
        setResearchPaper(data);
      } catch (err) {
        setTabError(err instanceof Error ? err.message : 'Unable to decode paper.');
      } finally {
        setLoadingTab(null);
      }
      return;
    }

    if (tab === 'panic' && !panicPack) {
      setLoadingTab('panic');
      try {
        const res = await fetch('/api/panic-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: analysis.detectedTopic,
            theGist: analysis.theGist,
            madeSimple: analysis.madeSimple,
            examCheatcode: analysis.examCheatcode,
          }),
        });
        const data = (await res.json()) as PanicModePack & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Could not generate exam survival pack.');
        setPanicPack(data);
      } catch (err) {
        setTabError(err instanceof Error ? err.message : 'Unable to build survival pack.');
      } finally {
        setLoadingTab(null);
      }
    }
  };

  const handleDownloadStudyPack = () => {
    if (!studyPack) return;
    const md = buildStudyPackMarkdown(studyPack);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${studyPack.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-study-pack.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeMap = mapCache[selectedMapType];

  const tabs: Array<{
    id: DeckTabId;
    label: string;
    icon: typeof Flame;
    tone?: string;
  }> = [
    { id: 'heatmap', label: 'Confusion Heatmap', icon: Flame },
    { id: 'maps', label: 'Simpli Maps', icon: MapIcon },
    { id: '3d-scene', label: '3D Scene (Optional)', icon: Box },
    { id: 'prerequisites', label: 'Learn Before This', icon: Compass },
    { id: 'web', label: 'Knowledge Web', icon: Network },
    { id: 'real-world', label: 'Why It Matters', icon: Briefcase },
    { id: 'study-pack', label: 'Study Pack', icon: Layers },
    { id: 'research', label: 'Paper Decoder', icon: FileSearch },
    { id: 'panic', label: '🚨 Exam Tomorrow', icon: AlertTriangle, tone: 'panic' },
  ];

  return (
    <section
      aria-label="Personalized understanding toolkit"
      className="rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpenCheck className="h-4 w-4 text-[#7C3AED]" aria-hidden="true" />
            <span>Deepen Understanding (Pick Only What You Need)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Visual maps, prerequisite checks, exam survival tools, and one-click study packs.
          </p>
        </div>
      </div>

      {/* Clean Interactive Deck Buttons */}
      <div role="tablist" aria-label="Exploration tools" className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isPanic = tab.tone === 'panic';
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => openTab(tab.id)}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? isPanic
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                  : isPanic
                  ? 'border border-rose-300 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70'
                  : 'border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-200 hover:border-[#7C3AED]/50'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loadingTab && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/60 px-4 py-4 text-xs text-slate-600 dark:text-zinc-300">
          <Loader2 className="h-4 w-4 animate-spin text-[#7C3AED]" aria-hidden="true" />
          <span>Crafting calm visual clarity...</span>
        </div>
      )}

      {tabError && (
        <p role="alert" className="rounded-xl bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
          {tabError}
        </p>
      )}

      {/* TAB 1: Confusion Heatmap (#10) */}
      {activeTab === 'heatmap' && (
        <div className="space-y-3 animate-card-enter" data-testid="confusion-heatmap">
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Where attention is needed most — glance at the colors first, read details second.
          </p>
          {analysis.confusionHeatmap && analysis.confusionHeatmap.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {analysis.confusionHeatmap.map((sec, idx) => {
                const badge =
                  sec.level === 'confusing'
                    ? '🔴 Commonly Confusing'
                    : sec.level === 'moderate'
                    ? '🟡 Moderate'
                    : '🟢 Easy';
                const cardStyle =
                  sec.level === 'confusing'
                    ? 'border-rose-300/70 dark:border-rose-800/70 bg-rose-50/50 dark:bg-rose-950/25'
                    : sec.level === 'moderate'
                    ? 'border-amber-300/70 dark:border-amber-800/70 bg-amber-50/50 dark:bg-amber-950/20'
                    : 'border-emerald-300/70 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/20';

                return (
                  <div key={idx} className={`rounded-2xl border p-4 space-y-1.5 ${cardStyle}`}>
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                        {sec.sectionTitle}
                      </h4>
                      <span className="text-[11px] font-semibold whitespace-nowrap">{badge}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-zinc-200 leading-relaxed">
                      {sec.summary}
                    </p>
                    <p className="text-[11px] font-medium text-slate-600 dark:text-zinc-400 pt-1">
                      Focus tip: {sec.focusTip}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Run a fresh simplification to generate a section-by-section Confusion Heatmap.
            </p>
          )}
        </div>
      )}

      {/* TAB 2: Simpli Maps (#6) */}
      {activeTab === 'maps' && !loadingTab && (
        <div className="space-y-4 animate-card-enter" data-testid="simpli-maps-panel">
          <div className="flex flex-wrap gap-1.5">
            {MAP_TYPES.map((mt) => (
              <button
                key={mt.id}
                type="button"
                onClick={() => loadMap(mt.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                  selectedMapType === mt.id
                    ? 'bg-[#7C3AED] text-white'
                    : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-600 dark:text-zinc-300'
                }`}
              >
                {mt.label}
              </button>
            ))}
          </div>

          {activeMap && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-[#7C3AED]/30 bg-[#7C3AED]/[0.05] dark:bg-[#7C3AED]/15 px-4 py-3 text-center">
                <p className="text-[11px] font-semibold text-[#7C3AED] dark:text-[#A78BFA] uppercase tracking-wide">
                  {activeMap.title}
                </p>
                <p className="font-display text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {activeMap.centerConcept}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeMap.nodes.map((node, idx) => (
                  <div
                    key={node.id || idx}
                    className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-3.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular font-semibold text-[#3B82F6]">
                      <span>{node.group || `Node ${idx + 1}`}</span>
                      <span>{node.relationLabel}</span>
                    </div>
                    <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      {node.label}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                      {node.note}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Optional Three.js 3D Concept Scene */}
      {activeTab === '3d-scene' && (
        <div className="space-y-3 animate-card-enter" data-testid="three-concept-panel">
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Interactive spatial model — drag to orbit, click any pillar to hear its breakdown, or slide Explode to separate layers.
          </p>
          <ConceptScene3D analysis={analysis} speech={speech} />
        </div>
      )}

      {/* TAB 3: Learn Before This (#7) */}
      {activeTab === 'prerequisites' && !loadingTab && (
        <div className="space-y-3 animate-card-enter" data-testid="prerequisites-panel">
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Quick prerequisite checklist — tap any building block to read its 2-sentence refresher.
          </p>
          <div className="space-y-2.5">
            {prereqSteps.map((step) => {
              const checked = Boolean(checkedPrereqs[step.id]);
              const expanded = expandedPrereqId === step.id;
              return (
                <div
                  key={step.id}
                  className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950 p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setCheckedPrereqs((p) => ({ ...p, [step.id]: !p[step.id] }))
                      }
                      aria-label={`Mark prerequisite ${step.title} known`}
                      className="flex items-center gap-2 text-left cursor-pointer"
                    >
                      {checked ? (
                        <CheckSquare className="h-4 w-4 text-[#10B981] shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                      <span
                        className={`font-display text-sm font-bold ${
                          checked
                            ? 'line-through text-slate-400 dark:text-zinc-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {step.title}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedPrereqId(expanded ? null : step.id)}
                      className="text-xs font-semibold text-[#7C3AED] dark:text-[#A78BFA] hover:underline cursor-pointer shrink-0"
                    >
                      {expanded ? 'Hide refresher' : '2-sec refresher'}
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Why you need it: {step.whyNeeded}
                  </p>

                  {expanded && (
                    <div className="rounded-xl border border-[#10B981]/25 bg-white dark:bg-zinc-900 p-3 text-xs leading-relaxed text-slate-700 dark:text-zinc-200">
                      {step.quickRefresher}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: Knowledge Web (#8) */}
      {activeTab === 'web' && !loadingTab && knowledgeWeb && (
        <div className="space-y-4 animate-card-enter" data-testid="knowledge-web-panel">
          <div className="text-center">
            <span className="inline-block rounded-2xl border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-4 py-1.5 font-display text-sm font-bold text-slate-900 dark:text-white">
              {knowledgeWeb.centerTopic}
            </span>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {knowledgeWeb.branches.map((branch, idx) => (
              <button
                key={branch.concept}
                type="button"
                onClick={() => setSelectedBranchIdx(idx)}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
                  selectedBranchIdx === idx
                    ? 'bg-[#3B82F6] text-white shadow-xs'
                    : 'border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-200 hover:border-[#3B82F6]'
                }`}
              >
                {branch.concept}
              </button>
            ))}
          </div>

          {knowledgeWeb.branches[selectedBranchIdx] && (
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#3B82F6]">
                  {knowledgeWeb.branches[selectedBranchIdx].relationship}
                </p>
                <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {knowledgeWeb.branches[selectedBranchIdx].concept}
                </p>
                <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                  {knowledgeWeb.branches[selectedBranchIdx].whyConnected}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onExploreConcept(knowledgeWeb.branches[selectedBranchIdx].concept)
                }
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-3.5 text-xs font-semibold text-white dark:text-slate-900 hover:bg-[#7C3AED] dark:hover:bg-[#7C3AED] dark:hover:text-white cursor-pointer"
              >
                <span>Clarify This Concept</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Why Does This Matter (#11) */}
      {activeTab === 'real-world' && !loadingTab && realWorld && (
        <div className="space-y-4 animate-card-enter" data-testid="real-world-panel">
          <div className="rounded-2xl border border-[#10B981]/30 bg-[#10B981]/[0.05] dark:bg-[#10B981]/10 p-4">
            <p className="text-xs font-bold text-[#059669] dark:text-[#34D399] mb-1">
              Big-Picture Relevance
            </p>
            <p className="text-sm text-slate-800 dark:text-zinc-100 leading-relaxed">
              {realWorld.realWorldRelevance}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-4 space-y-2">
              <h4 className="font-display text-xs font-bold uppercase tracking-wide text-slate-500">
                Everyday Uses
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-700 dark:text-zinc-300">
                {realWorld.everydayApplications.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-4 space-y-2">
              <h4 className="font-display text-xs font-bold uppercase tracking-wide text-slate-500">
                Jobs Using This
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-700 dark:text-zinc-300">
                {realWorld.jobsUsingThis.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-4 space-y-2">
              <h4 className="font-display text-xs font-bold uppercase tracking-wide text-slate-500">
                Industry Examples
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-700 dark:text-zinc-300">
                {realWorld.industryExamples.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: One-Click Study Pack (#14) */}
      {activeTab === 'study-pack' && !loadingTab && studyPack && (
        <div className="space-y-4 animate-card-enter" data-testid="study-pack-panel">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#7C3AED]/30 bg-[#7C3AED]/[0.06] dark:bg-[#7C3AED]/15 p-4">
            <div>
              <h4 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Complete Study Pack: {studyPack.topic}
              </h4>
              <p className="text-xs text-slate-600 dark:text-zinc-300">
                {studyPack.flashcards.length} flashcards synced to Review &amp; Quizzes
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadStudyPack}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-xs font-semibold text-slate-800 dark:text-zinc-100 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-[#7C3AED]" />
                <span>Download Pack (.md)</span>
              </button>
              {studyPack.quizQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onStartQuiz({
                      topic: studyPack.topic,
                      questions: studyPack.quizQuestions.map((q, i) => ({
                        ...q,
                        id: `sp-q-${Date.now()}-${i}`,
                      })),
                    })
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-3.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Launch Quiz ({studyPack.quizQuestions.length})</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-4 space-y-2">
              <h5 className="font-display text-xs font-bold uppercase tracking-wide text-slate-500">
                Revision Sheet
              </h5>
              <ul className="space-y-1 text-xs text-slate-700 dark:text-zinc-300">
                {studyPack.revisionSheet.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-4 space-y-2">
              <h5 className="font-display text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Common Mistakes to Avoid
              </h5>
              <ul className="space-y-1 text-xs text-slate-700 dark:text-zinc-300">
                {studyPack.commonMistakes.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-4 space-y-2">
              <h5 className="font-display text-xs font-bold uppercase tracking-wide text-slate-500">
                Practice Questions
              </h5>
              <ol className="space-y-1 text-xs text-slate-700 dark:text-zinc-300 list-decimal pl-4">
                {studyPack.practiceQuestions.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-4 space-y-2">
              <h5 className="font-display text-xs font-bold uppercase tracking-wide text-[#059669] dark:text-[#34D399]">
                Learning Roadmap
              </h5>
              <ol className="space-y-1 text-xs text-slate-700 dark:text-zinc-300 list-decimal pl-4">
                {studyPack.learningRoadmap.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: Research Paper Decoder (#15) */}
      {activeTab === 'research' && !loadingTab && researchPaper && (
        <div className="space-y-3 animate-card-enter" data-testid="research-decoder-panel">
          <div className="rounded-2xl border border-[#3B82F6]/30 bg-[#3B82F6]/[0.05] dark:bg-[#3B82F6]/10 p-4">
            <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              {researchPaper.titleGuess}
            </h4>
            <p className="mt-1 text-xs text-slate-700 dark:text-zinc-200">
              <span className="font-semibold text-[#3B82F6]">Explain like I&apos;m 15: </span>
              {researchPaper.explainLikeIm15}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: 'What Was Studied', body: researchPaper.whatWasStudied },
              { title: 'Why It Was Studied', body: researchPaper.whyItWasStudied },
              { title: 'What Was Discovered', body: researchPaper.whatWasDiscovered },
              { title: 'Why It Matters', body: researchPaper.whyItMatters },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-3.5 space-y-1"
              >
                <h5 className="font-display text-xs font-bold uppercase tracking-wide text-slate-500">
                  {card.title}
                </h5>
                <p className="text-xs leading-relaxed text-slate-700 dark:text-zinc-200">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 8: Panic Mode ("🚨 Exam Tomorrow") (#17) */}
      {activeTab === 'panic' && !loadingTab && panicPack && (
        <div
          className="rounded-2xl border border-rose-300/70 dark:border-rose-800/80 bg-rose-50/50 dark:bg-rose-950/25 p-4 sm:p-5 space-y-4 animate-card-enter"
          data-testid="panic-mode-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
                🚨 Exam Tomorrow Survival Sheet
              </span>
              <h4 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {panicPack.topic} — 2-Minute Fast Focus
              </h4>
            </div>
            <button
              type="button"
              onClick={() =>
                speech.speak(
                  `panic-${panicPack.topic}`,
                  `Two minute survival summary for ${panicPack.topic}. ${panicPack.twoMinuteSummary} Key memory tricks: ${panicPack.memoryTricks.join('. ')}`
                )
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 text-xs font-semibold text-white cursor-pointer"
            >
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Listen to 2-Min Cram Recap</span>
            </button>
          </div>

          <p className="rounded-xl bg-white/90 dark:bg-zinc-900 p-3.5 text-sm leading-relaxed text-slate-800 dark:text-zinc-100">
            {panicPack.twoMinuteSummary}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-white/80 dark:bg-zinc-900/80 p-3.5 space-y-1.5">
              <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                Must-Know Concepts
              </h5>
              <ul className="space-y-1 text-xs text-slate-700 dark:text-zinc-300">
                {panicPack.mostImportantConcepts.map((c, i) => (
                  <li key={i}>• {c}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-white/80 dark:bg-zinc-900/80 p-3.5 space-y-1.5">
              <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                Likely Exam Questions
              </h5>
              <ul className="space-y-1 text-xs text-slate-700 dark:text-zinc-300">
                {panicPack.likelyExamTopics.map((c, i) => (
                  <li key={i}>• {c}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-white/80 dark:bg-zinc-900/80 p-3.5 space-y-1.5">
              <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                Memory Tricks
              </h5>
              <ul className="space-y-1 text-xs text-slate-700 dark:text-zinc-300">
                {panicPack.memoryTricks.map((c, i) => (
                  <li key={i}>• {c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
