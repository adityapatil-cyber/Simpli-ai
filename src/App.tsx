import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, HelpCircle, PanelLeft, Plus } from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { AppSidebar, type WorkspaceView } from './components/AppSidebar';
import {
  ClarifyWorkspace,
  type AttachedFileState,
} from './components/ClarifyWorkspace';
import { VoiceTutorView } from './components/VoiceTutorView';
import { WritingStudioView } from './components/WritingStudioView';
import { QuickReviewView } from './components/QuickReviewView';
import { InsightsView } from './components/InsightsView';
import { AboutView } from './components/AboutView';
import { StudySprintWidget } from './components/StudySprintWidget';
import { useSpeechPlayer } from './hooks/useSpeechPlayer';
import { auth, googleProvider } from './firebase';
import {
  ensureUserProfile,
  loadCloudStudyState,
  syncClarifySessionToCloud,
  syncConfidenceLogToCloud,
  syncFlashcardsToCloud,
  syncVoiceSessionToCloud,
} from './services/cloudSync';
import {
  BRAIN_MODES,
  DEFAULT_READING_PREFS,
  appendVoiceTurn,
  canSubmitAnalysis,
  createConversation,
} from './utils/simpliLogic';
import type {
  AutoFlashcard,
  BrainModeId,
  ChatTurn,
  ConfidenceLevel,
  ConfidenceLogEntry,
  ReadingPreferences,
  SavedClarifySession,
  SimpliAnalysis,
  SmartQuizData,
  VoiceConversation,
  VoiceTurn,
} from './types/simpli';

const THEME_STORAGE_KEY = 'simpli_theme';
const CONVS_STORAGE_KEY = 'simpli_voice_conversations';
const READING_PREFS_STORAGE_KEY = 'simpli_reading_prefs';
const CLARIFY_HISTORY_STORAGE_KEY = 'simpli_clarify_history';
const GENERATED_FLASHCARDS_KEY = 'simpli_generated_flashcards';
const CONFIDENCE_LOGS_KEY = 'simpli_confidence_logs';

const STARTER_CLARIFY_SESSIONS: SavedClarifySession[] = [
  {
    id: 'starter-chloroplast',
    createdAt: '2026-11-15T12:00:00.000Z',
    analysis: {
      detectedTopic: 'Photosynthesis: Light & Calvin Cycle',
      extractedText: 'Chloroplast diagram showing sunlight hitting thylakoid membranes to produce ATP & NADPH for the Calvin cycle.',
      theGist: 'Plants capture sunlight in two steps: first charging energy batteries (ATP & NADPH), then spending them to build sugar.',
      madeSimple: [
        'Light reactions run inside the thylakoid like solar panels charging batteries.',
        'Water splits to donate electrons and releases oxygen.',
        'The Calvin cycle uses those charged batteries in the stroma to turn CO2 into glucose.',
      ],
      examCheatcode: 'Light reactions = Thylakoid (makes ATP/NADPH + O2). Calvin cycle = Stroma (makes glucose).',
      irlExample: 'Like solar panels on a roof charging a battery pack that powers a bakery inside.',
      suggestedQuestions: ['Why does the Calvin cycle not need direct light?'],
      brainMode: 'step-by-step',
    },
  },
];

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
  });

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [activeView, setActiveView] = useState<WorkspaceView>('clarify');
  const [brainMode, setBrainMode] = useState<BrainModeId>('adhd-turbo');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFileState[]>([]);
  const [query, setQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SimpliAnalysis | null>(null);

  const [generatedFlashcards, setGeneratedFlashcards] = useState<AutoFlashcard[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(GENERATED_FLASHCARDS_KEY);
      return saved ? (JSON.parse(saved) as AutoFlashcard[]) : [];
    } catch {
      return [];
    }
  });
  const [activeQuiz, setActiveQuiz] = useState<SmartQuizData | null>(null);
  const [confidenceLogs, setConfidenceLogs] = useState<ConfidenceLogEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(CONFIDENCE_LOGS_KEY);
      return saved ? (JSON.parse(saved) as ConfidenceLogEntry[]) : [];
    } catch {
      return [];
    }
  });

  const [chatMessages, setChatMessages] = useState<ChatTurn[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [conversations, setConversations] = useState<VoiceConversation[]>(() => {
    const fallback = createConversation({
      id: `session-${Date.now()}`,
      brainMode: 'adhd-turbo',
    });
    if (typeof window === 'undefined') return [fallback];
    try {
      const cached = localStorage.getItem(CONVS_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as VoiceConversation[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [fallback];
  });
  const [activeConvId, setActiveConvId] = useState<string>(
    () => conversations[0]?.id ?? ''
  );
  const [isVoiceSending, setIsVoiceSending] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [linkAnalysisToVoice, setLinkAnalysisToVoice] = useState(true);

  const [readingPrefs, setReadingPrefs] = useState<ReadingPreferences>(() => {
    if (typeof window === 'undefined') return DEFAULT_READING_PREFS;
    try {
      const saved = localStorage.getItem(READING_PREFS_STORAGE_KEY);
      return saved ? { ...DEFAULT_READING_PREFS, ...JSON.parse(saved) } : DEFAULT_READING_PREFS;
    } catch {
      return DEFAULT_READING_PREFS;
    }
  });

  const [clarifyHistory, setClarifyHistory] = useState<SavedClarifySession[]>(() => {
    if (typeof window === 'undefined') return STARTER_CLARIFY_SESSIONS;
    try {
      const saved = localStorage.getItem(CLARIFY_HISTORY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as SavedClarifySession[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return STARTER_CLARIFY_SESSIONS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(READING_PREFS_STORAGE_KEY, JSON.stringify(readingPrefs));
    } catch {
      // ignore
    }
  }, [readingPrefs]);

  useEffect(() => {
    try {
      localStorage.setItem(CLARIFY_HISTORY_STORAGE_KEY, JSON.stringify(clarifyHistory));
    } catch {
      // ignore
    }
  }, [clarifyHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(
        GENERATED_FLASHCARDS_KEY,
        JSON.stringify(generatedFlashcards)
      );
    } catch {
      // ignore
    }
  }, [generatedFlashcards]);

  useEffect(() => {
    try {
      localStorage.setItem(CONFIDENCE_LOGS_KEY, JSON.stringify(confidenceLogs));
    } catch {
      // ignore
    }
  }, [confidenceLogs]);

  const speech = useSpeechPlayer();

  // Optional Google Auth + Firestore Cloud Sync ("Later Option")
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudSyncNote, setCloudSyncNote] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCloudUser(user);
      if (!user) {
        setCloudSyncNote(null);
        return;
      }

      setIsSyncingCloud(true);
      try {
        await ensureUserProfile(user);
        const remote = await loadCloudStudyState(user.uid);
        if (remote.clarifySessions.length > 0) {
          setClarifyHistory((prev) => {
            const seen = new Set(remote.clarifySessions.map((s) => s.analysis.detectedTopic));
            return [...remote.clarifySessions, ...prev.filter((p) => !seen.has(p.analysis.detectedTopic))].slice(0, 20);
          });
        }
        if (remote.flashcards.length > 0) {
          setGeneratedFlashcards((prev) => {
            const seen = new Set(remote.flashcards.map((c) => c.id));
            return [...remote.flashcards, ...prev.filter((c) => !seen.has(c.id))].slice(0, 80);
          });
        }
        if (remote.confidenceLogs.length > 0) {
          setConfidenceLogs((prev) => {
            const seen = new Set(remote.confidenceLogs.map((l) => l.id));
            return [...remote.confidenceLogs, ...prev.filter((l) => !seen.has(l.id))].slice(0, 60);
          });
        }
        setCloudSyncNote('Cloud synced');
      } catch (err) {
        setCloudSyncNote(err instanceof Error ? 'Sync paused' : 'Sync issue');
      } finally {
        setIsSyncingCloud(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignInCloud = async () => {
    setCloudSyncNote(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setCloudSyncNote(err instanceof Error ? err.message : 'Sign-in cancelled');
    }
  };

  const handleSignOutCloud = async () => {
    await signOut(auth);
    setCloudSyncNote(null);
  };

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
    }
  }, [isDark]);

  // Load saved conversations from server on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/conversations')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { conversations?: VoiceConversation[] } | null) => {
        if (cancelled || !data?.conversations?.length) return;
        setConversations(data.conversations);
        setActiveConvId((prev) =>
          data.conversations!.some((c) => c.id === prev)
            ? prev
            : data.conversations![0].id
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist local cache whenever conversations update
  useEffect(() => {
    try {
      localStorage.setItem(CONVS_STORAGE_KEY, JSON.stringify(conversations));
    } catch {
      // ignore
    }
  }, [conversations]);

  // Cycle loading stage messages while analyzing
  useEffect(() => {
    if (!isAnalyzing) {
      setLoadingStageIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setLoadingStageIndex((prev) => (prev < 2 ? prev + 1 : 2));
    }, 850);
    return () => window.clearInterval(timer);
  }, [isAnalyzing]);

  const activeConversation = useMemo(() => {
    return (
      conversations.find((c) => c.id === activeConvId) ??
      conversations[0] ??
      createConversation({ id: 'default-session', brainMode })
    );
  }, [activeConvId, brainMode, conversations]);

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const activeConvIdRef = useRef(activeConvId);
  activeConvIdRef.current = activeConvId;

  const lastConfidence = confidenceLogs[0]?.level;

  const runAnalysis = useCallback(
    async (
      targetMode: BrainModeId,
      override?: {
        fileBase64?: string;
        mimeType?: string;
        isRegionCrop?: boolean;
        query?: string;
      }
    ) => {
      const effectiveFiles = override?.fileBase64 && override?.mimeType
        ? [
            {
              fileBase64: override.fileBase64,
              mimeType: override.mimeType,
              fileName: 'Highlighted Region',
            },
          ]
        : attachedFiles.map((f) => ({
            fileBase64: f.base64,
            mimeType: f.mimeType,
            fileName: f.name,
          }));
      const effectiveQuery = override?.query ?? query;

      if (
        !canSubmitAnalysis({
          hasFile: effectiveFiles.length > 0,
          query: effectiveQuery,
        })
      ) {
        setValidationError(
          'Drop a screenshot, diagram, or PDF — or enter a question first.'
        );
        return;
      }

      setValidationError(null);
      setIsAnalyzing(true);
      setLoadingStageIndex(0);

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: effectiveFiles,
            fileBase64: effectiveFiles[0]?.fileBase64,
            mimeType: effectiveFiles[0]?.mimeType,
            query: effectiveQuery,
            brainMode: targetMode,
            isRegionCrop: Boolean(override?.isRegionCrop),
            confidenceLevel: lastConfidence,
          }),
        });

        const data = (await res.json()) as SimpliAnalysis & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Could not simplify this material.');
        }

        const newSession: SavedClarifySession = {
          id: `clarify-${Date.now()}`,
          createdAt: new Date().toISOString(),
          analysis: data,
        };
        setLoadingStageIndex(2);
        setAnalysis(data);
        setChatMessages([]);
        setClarifyHistory((prev) =>
          [
            newSession,
            ...prev.filter((item) => item.analysis.detectedTopic !== data.detectedTopic),
          ].slice(0, 15)
        );
        if (cloudUser) {
          void syncClarifySessionToCloud(cloudUser.uid, newSession).catch(() => {});
        }
      } catch (err) {
        setValidationError(
          err instanceof Error
            ? err.message
            : 'Unable to analyze right now. Please try again.'
        );
      } finally {
        setIsAnalyzing(false);
      }
    },
    [attachedFiles, cloudUser, lastConfidence, query]
  );

  const handleSaveGeneratedFlashcards = useCallback(
    (cards: AutoFlashcard[]) => {
      setGeneratedFlashcards((prev) => [...cards, ...prev].slice(0, 80));
      if (cloudUser) {
        void syncFlashcardsToCloud(cloudUser.uid, cards).catch(() => {});
      }
    },
    [cloudUser]
  );

  const handleLaunchSmartQuiz = useCallback((quiz: SmartQuizData) => {
    setActiveQuiz(quiz);
    setActiveView('review');
  }, []);

  const handleRecordConfidence = useCallback(
    (
      topic: string,
      level: ConfidenceLevel,
      difficulty: 'easy' | 'moderate' | 'challenging' = 'moderate'
    ) => {
      const entry: ConfidenceLogEntry = {
        id: `conf-${Date.now()}`,
        topic,
        level,
        difficulty,
        timestamp: new Date().toISOString(),
      };
      setConfidenceLogs((prev) => [entry, ...prev].slice(0, 60));
      if (cloudUser) {
        void syncConfidenceLogToCloud(cloudUser.uid, entry).catch(() => {});
      }
    },
    [cloudUser]
  );

  const handleExploreConcept = useCallback(
    (concept: string) => {
      setAnalysis(null);
      setAttachedFiles([]);
      setQuery(`Explain "${concept}" clearly and how it connects to what I just studied.`);
      setActiveView('clarify');
      void runAnalysis(brainMode, {
        query: `Explain "${concept}" clearly and how it connects to what I just studied.`,
      });
    },
    [brainMode, runAnalysis]
  );

  const handleSelectBrainMode = async (mode: BrainModeId) => {
    setBrainMode(mode);
    if (analysis && !isAnalyzing && activeView === 'clarify') {
      await runAnalysis(mode);
    }
  };

  const handleNewClarify = () => {
    speech.stop();
    setAnalysis(null);
    setAttachedFiles([]);
    setQuery('');
    setChatMessages([]);
    setValidationError(null);
    setActiveView('clarify');
  };

  const handleSendChat = async (message: string) => {
    const userTurn: ChatTurn = {
      id: `chat-u-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...chatMessages, userTurn];
    setChatMessages(nextHistory);
    setIsChatLoading(true);

    try {
      const contextSummary = analysis
        ? `Topic: ${analysis.detectedTopic}\nExtracted Notes: ${analysis.extractedText}\nThe Gist: ${analysis.theGist}`
        : '';

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: nextHistory.map((m) => ({ role: m.role, content: m.content })),
          brainMode,
          contextSummary,
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get reply');
      }

      const aiTurn: ChatTurn = {
        id: `chat-a-${Date.now()}`,
        role: 'assistant',
        content: data.reply || 'Here is a clearer angle on that.',
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, aiTurn]);
    } catch (err) {
      const errTurn: ChatTurn = {
        id: `chat-err-${Date.now()}`,
        role: 'assistant',
        content:
          err instanceof Error
            ? err.message
            : 'Could not reach Simpli tutor right now.',
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errTurn]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const persistConversation = useCallback(
    async (conv: VoiceConversation) => {
      try {
        await fetch(`/api/conversations/${encodeURIComponent(conv.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(conv),
        });
      } catch {
        // LocalStorage already stores state
      }
      if (cloudUser) {
        void syncVoiceSessionToCloud(cloudUser.uid, conv).catch(() => {});
      }
    },
    [cloudUser]
  );

  const handleNewConversation = () => {
    const fresh = createConversation({
      id: `session-${Date.now()}`,
      brainMode,
      topicTag: analysis?.detectedTopic || 'General Study',
    });
    setConversations((prev) => [fresh, ...prev]);
    setActiveConvId(fresh.id);
    setVoiceError(null);
    persistConversation(fresh);
  };

  const handleDeleteConversation = async (id: string) => {
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const replacement = createConversation({
          id: `session-${Date.now()}`,
          brainMode,
        });
        setActiveConvId(replacement.id);
        return [replacement];
      }
      if (activeConvId === id) {
        setActiveConvId(remaining[0].id);
      }
      return remaining;
    });

    try {
      await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {
      // ignore
    }
  };

  const handleSendVoiceTurn = async (text: string, autoSpeak: boolean) => {
    setVoiceError(null);
    const userTurn: VoiceTurn = {
      id: `vt-u-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
      brainMode,
    };

    const updatedWithUser = appendVoiceTurn(activeConversation, userTurn);
    setConversations((prev) =>
      prev.map((c) => (c.id === updatedWithUser.id ? updatedWithUser : c))
    );
    setIsVoiceSending(true);

    try {
      const topicContext =
        linkAnalysisToVoice && analysis
          ? `Topic: ${analysis.detectedTopic}\nGist: ${analysis.theGist}\nExtracted Details: ${analysis.extractedText}`
          : '';

      const res = await fetch('/api/voice-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: updatedWithUser.turns.map((t) => ({
            role: t.role,
            text: t.text,
          })),
          brainMode,
          topicContext,
        }),
      });

      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Voice tutor request failed');
      }

      const replyText =
        data.reply || 'Got it — what part would you like to zoom into next?';
      const assistantTurn: VoiceTurn = {
        id: `vt-a-${Date.now()}`,
        role: 'assistant',
        text: replyText,
        timestamp: new Date().toISOString(),
        brainMode,
      };

      const finalConv = appendVoiceTurn(updatedWithUser, assistantTurn);
      if (
        linkAnalysisToVoice &&
        analysis &&
        finalConv.topicTag === 'General Study'
      ) {
        finalConv.topicTag = analysis.detectedTopic;
      }

      setConversations((prev) =>
        prev.map((c) => (c.id === finalConv.id ? finalConv : c))
      );
      await persistConversation(finalConv);

      if (autoSpeak) {
        speech.speak(`voice-turn-${assistantTurn.id}`, replyText);
      }
    } catch (err) {
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Could not complete voice turn. Please try again.'
      );
      await persistConversation(updatedWithUser);
    } finally {
      setIsVoiceSending(false);
    }
  };

  const handleCommitLiveTurn = useCallback(
    (role: 'user' | 'assistant', text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const currentList = conversationsRef.current;
      const currentTarget =
        currentList.find((c) => c.id === activeConvIdRef.current) ??
        currentList[0] ??
        createConversation({ id: 'default-session', brainMode });

      const turn: VoiceTurn = {
        id: `vt-live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role,
        text: trimmed,
        timestamp: new Date().toISOString(),
        brainMode,
      };
      const updated = appendVoiceTurn(currentTarget, turn);
      if (
        linkAnalysisToVoice &&
        analysis &&
        updated.topicTag === 'General Study'
      ) {
        updated.topicTag = analysis.detectedTopic;
      }

      const nextList = currentList.some((c) => c.id === updated.id)
        ? currentList.map((c) => (c.id === updated.id ? updated : c))
        : [updated, ...currentList];

      conversationsRef.current = nextList;
      setConversations(nextList);
      void persistConversation(updated);
    },
    [analysis, brainMode, linkAnalysisToVoice, persistConversation]
  );

  const handleDiscussInVoiceStudio = () => {
    if (!analysis) return;
    setLinkAnalysisToVoice(true);
    const fresh = createConversation({
      id: `session-${Date.now()}`,
      title: analysis.detectedTopic,
      topicTag: analysis.detectedTopic,
      brainMode,
    });
    const starterTurn: VoiceTurn = {
      id: `vt-init-${Date.now()}`,
      role: 'assistant',
      text: `I have your notes on ${analysis.detectedTopic} ready. The core gist is: ${analysis.theGist} Tap the mic or type any question to talk it through.`,
      timestamp: new Date().toISOString(),
      brainMode,
    };
    const seeded = appendVoiceTurn(fresh, starterTurn);
    setConversations((prev) => [seeded, ...prev]);
    setActiveConvId(seeded.id);
    persistConversation(seeded);
    setActiveView('voice');
  };

  const viewTitle =
    activeView === 'clarify'
      ? 'Clarify Studio'
      : activeView === 'voice'
      ? 'Voice Tutor'
      : activeView === 'writing'
      ? 'Writing Studio'
      : activeView === 'review'
      ? 'Review & Quizzes'
      : activeView === 'insights'
      ? 'Simpli Insights'
      : 'How it Works & About';

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-[#09090B] text-slate-900 dark:text-slate-100">
      <AppSidebar
        isOpen={sidebarOpen}
        onCloseMobile={() => {
          if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            setSidebarOpen(false);
          }
        }}
        activeView={activeView}
        onSelectView={setActiveView}
        onNewClarify={handleNewClarify}
        conversations={conversations}
        activeConvId={activeConvId}
        onSelectConversation={setActiveConvId}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        voice={speech.voice}
        onSelectVoice={speech.setVoice}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        cloudUser={
          cloudUser
            ? {
                uid: cloudUser.uid,
                displayName: cloudUser.displayName || 'Learner',
                email: cloudUser.email || '',
              }
            : null
        }
        isSyncingCloud={isSyncingCloud}
        cloudSyncNote={cloudSyncNote}
        onSignInCloud={handleSignInCloud}
        onSignOutCloud={handleSignOutCloud}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 dark:border-zinc-800 px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            >
              <PanelLeft className="h-4.5 w-4.5" />
            </button>

            <span className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
              {viewTitle}
            </span>

            {activeView !== 'about' && activeView !== 'insights' && (
              <div className="hidden sm:flex items-center">
                <label htmlFor="header-brain-mode" className="sr-only">
                  Brain Mode
                </label>
                <select
                  id="header-brain-mode"
                  value={brainMode}
                  disabled={isAnalyzing}
                  onChange={(e) =>
                    handleSelectBrainMode(e.target.value as BrainModeId)
                  }
                  className="h-8 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-2.5 text-xs font-medium text-slate-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#7C3AED] cursor-pointer"
                >
                  {BRAIN_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.emoji} {m.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <StudySprintWidget
              activeAnalysis={analysis}
              clarifySessions={clarifyHistory}
              conversations={conversations}
              speech={speech}
              onOpenQuickReview={() => setActiveView('review')}
            />

            <button
              type="button"
              onClick={cloudUser ? handleSignOutCloud : handleSignInCloud}
              aria-label={cloudUser ? 'Cloud sync enabled — click to sign out' : 'Sign in with Google later to sync'}
              title={cloudUser ? `Synced as ${cloudUser.email || cloudUser.displayName}` : 'Optional: Sign in later to save across devices'}
              className={`hidden sm:inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                cloudUser
                  ? 'border-[#10B981]/40 bg-[#10B981]/10 text-[#059669] dark:text-[#34D399]'
                  : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 hover:border-[#7C3AED]'
              }`}
            >
              <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{cloudUser ? 'Synced' : 'Sync Later'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('about')}
              aria-label="How Simpli Works"
              title="How Simpli Works"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-500 hover:text-[#7C3AED] transition-colors cursor-pointer"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </button>

            {activeView === 'clarify' && analysis && (
              <button
                type="button"
                onClick={handleNewClarify}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:border-[#7C3AED] cursor-pointer whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>New</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex flex-1 flex-col min-h-0">
          {activeView === 'clarify' && (
            <ClarifyWorkspace
              brainMode={brainMode}
              onSelectBrainMode={handleSelectBrainMode}
              attachedFiles={attachedFiles}
              onAttachFiles={setAttachedFiles}
              query={query}
              onChangeQuery={setQuery}
              onSubmit={(override) => runAnalysis(brainMode, override)}
              isLoading={isAnalyzing}
              loadingStageIndex={loadingStageIndex}
              validationError={validationError}
              analysis={analysis}
              speech={speech}
              chatMessages={chatMessages}
              onSendChat={handleSendChat}
              isChatLoading={isChatLoading}
              onDiscussInVoiceStudio={handleDiscussInVoiceStudio}
              readingPrefs={readingPrefs}
              onChangeReadingPrefs={setReadingPrefs}
              onSaveGeneratedFlashcards={handleSaveGeneratedFlashcards}
              onLaunchSmartQuiz={handleLaunchSmartQuiz}
              onOpenReviewDeck={() => setActiveView('review')}
              onRecordConfidence={handleRecordConfidence}
              lastConfidence={lastConfidence}
              onExploreConcept={handleExploreConcept}
            />
          )}

          {activeView === 'voice' && (
            <VoiceTutorView
              activeConversation={activeConversation}
              onNewConversation={handleNewConversation}
              onSendVoiceTurn={handleSendVoiceTurn}
              onCommitLiveTurn={handleCommitLiveTurn}
              isSending={isVoiceSending}
              brainMode={brainMode}
              activeAnalysis={analysis}
              linkedTopic={
                linkAnalysisToVoice && analysis ? analysis.detectedTopic : null
              }
              onToggleLinkTopic={() => setLinkAnalysisToVoice((prev) => !prev)}
              speech={speech}
              voiceError={voiceError}
            />
          )}

          {activeView === 'writing' && (
            <WritingStudioView
              brainMode={brainMode}
              activeAnalysis={analysis}
              speech={speech}
            />
          )}

          {activeView === 'review' && (
            <QuickReviewView
              clarifySessions={clarifyHistory}
              conversations={conversations}
              generatedFlashcards={generatedFlashcards}
              activeQuiz={activeQuiz}
              activeAnalysis={analysis}
              onSetQuiz={setActiveQuiz}
              speech={speech}
            />
          )}

          {activeView === 'insights' && (
            <InsightsView
              confidenceLogs={confidenceLogs}
              clarifySessions={clarifyHistory}
              conversations={conversations}
              onRevisitTopic={(topic) => {
                setAnalysis(null);
                setAttachedFiles([]);
                setQuery(topic);
                setActiveView('clarify');
              }}
            />
          )}

          {activeView === 'about' && (
            <AboutView onStartClarifying={() => setActiveView('clarify')} />
          )}
        </main>
      </div>
    </div>
  );
}
