import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Link2,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Plus,
  Radio,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { formatRelativeTime, getBrainModeConfig } from '../utils/simpliLogic';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { useGeminiLive } from '../hooks/useGeminiLive';
import type {
  BrainModeId,
  SimpliAnalysis,
  TeachBackResult,
  VoiceConversation,
} from '../types/simpli';
import type { useSpeechPlayer } from '../hooks/useSpeechPlayer';

interface VoiceTutorViewProps {
  activeConversation: VoiceConversation;
  onNewConversation: () => void;
  onSendVoiceTurn: (text: string, autoSpeak: boolean) => Promise<void>;
  onCommitLiveTurn: (role: 'user' | 'assistant', text: string) => void;
  isSending: boolean;
  brainMode: BrainModeId;
  activeAnalysis: SimpliAnalysis | null;
  linkedTopic: string | null;
  onToggleLinkTopic: () => void;
  speech: ReturnType<typeof useSpeechPlayer>;
  voiceError: string | null;
}

export function VoiceTutorView({
  activeConversation,
  onNewConversation,
  onSendVoiceTurn,
  onCommitLiveTurn,
  isSending,
  brainMode,
  activeAnalysis,
  linkedTopic,
  onToggleLinkTopic,
  speech,
  voiceError,
}: VoiceTutorViewProps) {
  const [promptInput, setPromptInput] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Feature 3: "Teach It Back" (Feynman Check)
  const [showTeachBack, setShowTeachBack] = useState(false);
  const [teachBackInput, setTeachBackInput] = useState('');
  const [teachBackTarget, setTeachBackTarget] = useState<'chat' | 'teach-back'>('chat');
  const [isTeachBackLoading, setIsTeachBackLoading] = useState(false);
  const [teachBackResult, setTeachBackResult] = useState<TeachBackResult | null>(null);
  const [teachBackError, setTeachBackError] = useState<string | null>(null);

  const topicContext = useMemo(() => {
    if (!linkedTopic || !activeAnalysis) return '';
    return `Topic: ${activeAnalysis.detectedTopic}\nGist: ${activeAnalysis.theGist}\nExtracted Details: ${activeAnalysis.extractedText}`;
  }, [activeAnalysis, linkedTopic]);

  const historySummary = useMemo(() => {
    return activeConversation.turns
      .slice(-6)
      .map((t) => `${t.role === 'user' ? 'Student' : 'Simpli'}: ${t.text}`)
      .join('\n');
  }, [activeConversation.turns]);

  const {
    isRecording,
    isTranscribing,
    audioLevel,
    durationSec,
    liveTranscript,
    micError,
    startRecording,
    stopRecording,
  } = useVoiceRecorder({
    onTranscript: (text) => {
      if (teachBackTarget === 'teach-back') {
        setTeachBackInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
        return;
      }
      // Paste transcribed speech directly into the text bar so the user can review, edit, or send it
      setPromptInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
    },
  });

  const handleSubmitTeachBack = async () => {
    if (!teachBackInput.trim()) {
      setTeachBackError('Speak or type how you would explain this idea in your own words first.');
      return;
    }
    setTeachBackError(null);
    setIsTeachBackLoading(true);
    try {
      const activeTopicName =
        (linkedTopic && activeAnalysis?.detectedTopic) ||
        activeConversation.topicTag ||
        activeConversation.title;
      const res = await fetch('/api/teach-back', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: activeTopicName,
          referenceContext: topicContext || historySummary,
          learnerExplanation: teachBackInput,
          brainMode,
        }),
      });
      const data = (await res.json()) as TeachBackResult & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not evaluate explanation.');
      setTeachBackResult(data);
    } catch (err) {
      setTeachBackError(
        err instanceof Error ? err.message : 'Unable to check right now.'
      );
    } finally {
      setIsTeachBackLoading(false);
    }
  };

  const live = useGeminiLive({
    voiceName: speech.voice,
    brainMode,
    topicContext,
    historySummary,
    onCommitTurn: onCommitLiveTurn,
  });

  const isLiveActive = live.status === 'connecting' || live.status === 'live';

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [
    activeConversation.turns.length,
    live.liveUserDraft,
    live.liveAssistantDraft,
  ]);

  const activeModeCfg = getBrainModeConfig(brainMode);

  const handleToggleLiveSession = async () => {
    if (isLiveActive) {
      live.stopSession();
      return;
    }
    speech.stop();
    if (isRecording) {
      stopRecording();
    }
    await live.startSession();
  };

  const handleToggleDictateMic = async () => {
    if (isLiveActive) {
      live.toggleMute();
      return;
    }
    if (isRecording) {
      stopRecording();
    } else {
      setTeachBackTarget('chat');
      await startRecording();
    }
  };

  const handleSubmitText = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptInput.trim();
    if (!trimmed || isSending) return;
    setPromptInput('');
    if (live.status === 'live') {
      live.sendLiveText(trimmed);
    } else {
      await onSendVoiceTurn(trimmed, autoSpeak);
    }
  };

  const displayedInputValue =
    isRecording && liveTranscript
      ? promptInput.trim()
        ? `${promptInput.trim()} ${liveTranscript}`
        : liveTranscript
      : promptInput;

  const hasAnyTurns =
    activeConversation.turns.length > 0 ||
    Boolean(live.liveUserDraft) ||
    Boolean(live.liveAssistantDraft);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Sub-header for current voice session */}
      <div className="border-b border-slate-200/80 dark:border-zinc-800 px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED]/15 to-[#10B981]/15 text-[#7C3AED] dark:text-[#A78BFA] shrink-0">
              <AudioLines className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                {activeConversation.title}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {activeModeCfg.emoji} {activeModeCfg.label} ·{' '}
                {activeConversation.turns.length} turns saved
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleLiveSession}
              aria-pressed={isLiveActive}
              className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-all cursor-pointer ${
                isLiveActive
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] text-white hover:opacity-95'
              }`}
            >
              {live.status === 'connecting' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : isLiveActive ? (
                <PhoneOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Radio className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {live.status === 'connecting'
                  ? 'Connecting...'
                  : isLiveActive
                  ? 'End Live'
                  : 'Live Voice'}
              </span>
            </button>

            {activeAnalysis && (
              <button
                type="button"
                onClick={onToggleLinkTopic}
                className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors cursor-pointer ${
                  linkedTopic
                    ? 'bg-[#10B981]/15 text-[#059669] dark:text-[#34D399]'
                    : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300'
                }`}
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{linkedTopic ? 'Linked to Upload' : 'Link Upload'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setAutoSpeak((v) => !v)}
              aria-pressed={autoSpeak}
              className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors cursor-pointer ${
                autoSpeak
                  ? 'bg-[#7C3AED]/12 text-[#7C3AED] dark:text-[#A78BFA]'
                  : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-500 dark:text-zinc-400'
              }`}
            >
              {autoSpeak ? (
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Auto-Hear {autoSpeak ? 'On' : 'Off'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowTeachBack((v) => !v);
                setTeachBackError(null);
              }}
              aria-expanded={showTeachBack}
              className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors cursor-pointer ${
                showTeachBack
                  ? 'bg-[#10B981] text-white'
                  : 'border border-[#10B981]/40 bg-[#10B981]/10 text-[#059669] dark:text-[#34D399] hover:bg-[#10B981]/20'
              }`}
            >
              <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Teach It Back</span>
            </button>

            <button
              type="button"
              onClick={onNewConversation}
              className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:border-[#7C3AED] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feature 3: Optional "Teach It Back" (Feynman Check) Drawer */}
      {showTeachBack && (
        <section
          aria-label="Teach It Back Feynman Check"
          className="border-b border-[#10B981]/25 bg-[#10B981]/[0.05] dark:bg-[#10B981]/10 px-4 py-4 sm:px-8"
        >
          <div className="mx-auto max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
                  <span>Teach It Back · Test My Understanding</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-zinc-300">
                  Explain {(linkedTopic && activeAnalysis?.detectedTopic) || activeConversation.title} in your own messy words — zero grades, just kind feedback.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTeachBack(false)}
                aria-label="Close Teach It Back"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <textarea
                rows={2}
                value={
                  isRecording && teachBackTarget === 'teach-back' && liveTranscript
                    ? teachBackInput.trim()
                      ? `${teachBackInput.trim()} ${liveTranscript}`
                      : liveTranscript
                    : teachBackInput
                }
                onChange={(e) => setTeachBackInput(e.target.value)}
                placeholder="Type or speak in your own words: Okay so basically..."
                aria-label="Your own-words explanation"
                className="w-full sm:flex-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-3 text-sm text-slate-900 dark:text-white focus:border-[#10B981] focus:outline-none"
              />
              <div className="flex sm:flex-col gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isTranscribing}
                  onClick={async () => {
                    if (isRecording && teachBackTarget === 'teach-back') {
                      stopRecording();
                    } else {
                      setTeachBackTarget('teach-back');
                      await startRecording();
                    }
                  }}
                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white cursor-pointer ${
                    isRecording && teachBackTarget === 'teach-back'
                      ? 'bg-red-600'
                      : 'bg-[#7C3AED]'
                  }`}
                >
                  {isRecording && teachBackTarget === 'teach-back' ? (
                    <MicOff className="h-3.5 w-3.5" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {isRecording && teachBackTarget === 'teach-back'
                      ? 'Stop Mic'
                      : 'Speak Answer'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isTeachBackLoading || !teachBackInput.trim()}
                  onClick={handleSubmitTeachBack}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-4 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer"
                >
                  {isTeachBackLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span>Check Gently</span>
                </button>
              </div>
            </div>

            {teachBackError && (
              <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {teachBackError}
              </p>
            )}

            {teachBackResult && (
              <div className="rounded-2xl border border-[#10B981]/30 bg-white dark:bg-zinc-950 p-4 space-y-3 animate-card-enter">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#059669] dark:text-[#34D399]">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>What You Already Got Right</span>
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      speech.speak(
                        'teach-back-feedback',
                        `What you got right: ${teachBackResult.whatYouGotRight.join('. ')}. Missing link: ${teachBackResult.friendlyPatch}. ${teachBackResult.confidenceNote}`
                      )
                    }
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-700 px-2.5 text-[11px] font-medium cursor-pointer"
                  >
                    <Volume2 className="h-3 w-3 text-[#7C3AED]" />
                    <span>Hear Feedback</span>
                  </button>
                </div>

                <ul className="space-y-1 text-xs sm:text-sm text-slate-700 dark:text-zinc-200">
                  {teachBackResult.whatYouGotRight.map((pt, idx) => (
                    <li key={idx}>• {pt}</li>
                  ))}
                </ul>

                <div className="rounded-xl bg-slate-50 dark:bg-zinc-900 p-3 text-xs sm:text-sm space-y-1">
                  <p className="font-semibold text-[#7C3AED] dark:text-[#A78BFA]">
                    Tiny Patch · {teachBackResult.missingLink}
                  </p>
                  <p className="text-slate-700 dark:text-zinc-200">
                    {teachBackResult.friendlyPatch}
                  </p>
                </div>

                <p className="text-xs font-medium text-[#059669] dark:text-[#34D399]">
                  {teachBackResult.confidenceNote}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Live Voice Call Banner (when Gemini Live API session is active) */}
      {isLiveActive && (
        <div className="border-b border-[#7C3AED]/20 bg-gradient-to-r from-[#7C3AED]/8 via-[#3B82F6]/8 to-[#10B981]/8 px-4 py-2.5 sm:px-8">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  live.status === 'connecting'
                    ? 'bg-amber-500 animate-pulse'
                    : live.isModelSpeaking
                    ? 'bg-[#10B981] animate-pulse'
                    : 'bg-[#7C3AED] animate-pulse'
                }`}
                aria-hidden="true"
              />
              <span className="font-semibold text-slate-800 dark:text-zinc-100">
                {live.status === 'connecting'
                  ? 'Connecting to Live Voice...'
                  : live.isModelSpeaking
                  ? 'Simpli is speaking live — interrupt anytime'
                  : live.isMuted
                  ? 'Microphone muted'
                  : 'Live Voice connected — speak naturally'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {!live.isMuted && (
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-700" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#10B981] transition-all duration-75"
                    style={{ width: `${Math.max(8, live.micLevel)}%` }}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={live.toggleMute}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 text-xs font-medium text-slate-700 dark:text-zinc-200 cursor-pointer"
              >
                {live.isMuted ? (
                  <MicOff className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                ) : (
                  <Mic className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden="true" />
                )}
                <span>{live.isMuted ? 'Unmute' : 'Mute'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable Centered Transcript */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {!hasAnyTurns ? (
            <div className="flex min-h-[340px] flex-col items-center justify-center text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 mb-3">
                <BookOpen className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Start a voice learning conversation
              </h3>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-zinc-400 max-w-md leading-relaxed">
                Start a real-time <strong>Live Voice</strong> conversation to talk back and forth, or tap the mic below to dictate into the text box before sending.
              </p>
              <button
                type="button"
                onClick={handleToggleLiveSession}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] px-5 text-sm font-semibold text-white shadow-xs hover:opacity-95 cursor-pointer"
              >
                <Radio className="h-4 w-4" aria-hidden="true" />
                <span>Start Live Voice Chat</span>
              </button>
            </div>
          ) : (
            <>
              {activeConversation.turns.map((turn) => {
                const isUser = turn.role === 'user';
                const clipId = `voice-turn-${turn.id}`;
                const isPlaying =
                  speech.activeId === clipId && speech.status === 'playing';
                return (
                  <div
                    key={turn.id}
                    className={`rounded-2xl p-4 sm:p-5 text-sm ${
                      isUser
                        ? 'bg-slate-100 dark:bg-zinc-800/90 text-slate-900 dark:text-white ml-8 sm:ml-16'
                        : 'border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 text-slate-800 dark:text-zinc-200 mr-8 sm:mr-16'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                        {isUser ? 'You' : 'Simpli'} ·{' '}
                        <span className="font-mono-tabular">
                          {formatRelativeTime(turn.timestamp)}
                        </span>
                      </span>

                      <button
                        type="button"
                        onClick={() => speech.speak(clipId, turn.text)}
                        aria-label={`Hear message from ${isUser ? 'You' : 'Simpli'}`}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          isPlaying
                            ? 'bg-[#10B981]/15 text-[#059669] dark:text-[#34D399]'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-[#7C3AED] dark:hover:text-[#A78BFA]'
                        }`}
                      >
                        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{isPlaying ? 'Pause' : 'Hear'}</span>
                      </button>
                    </div>
                    <p className="leading-relaxed text-sm sm:text-[15px]">
                      {turn.text}
                    </p>
                  </div>
                );
              })}

              {live.liveUserDraft && (
                <div className="rounded-2xl bg-slate-100/80 dark:bg-zinc-800/70 border border-dashed border-[#7C3AED]/40 p-4 sm:p-5 text-sm text-slate-900 dark:text-white ml-8 sm:ml-16">
                  <span className="text-xs font-semibold text-[#7C3AED] dark:text-[#A78BFA] block mb-1">
                    You · Live
                  </span>
                  <p className="leading-relaxed text-sm sm:text-[15px]">
                    {live.liveUserDraft}
                  </p>
                </div>
              )}

              {live.liveAssistantDraft && (
                <div className="rounded-2xl border border-[#10B981]/30 bg-white dark:bg-zinc-900/70 p-4 sm:p-5 text-sm text-slate-800 dark:text-zinc-200 mr-8 sm:mr-16">
                  <span className="text-xs font-semibold text-[#059669] dark:text-[#34D399] block mb-1">
                    Simpli · Speaking live
                  </span>
                  <p className="leading-relaxed text-sm sm:text-[15px]">
                    {live.liveAssistantDraft}
                  </p>
                </div>
              )}
            </>
          )}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {(micError || voiceError || live.liveError) && (
        <div className="mx-auto mb-2 max-w-3xl px-4 sm:px-8 w-full">
          <div
            role="alert"
            className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-xs text-amber-800 dark:text-amber-300"
          >
            {live.liveError || micError || voiceError}
          </div>
        </div>
      )}

      {(isRecording || isTranscribing) && !isLiveActive && (
        <div className="mx-auto mb-2 max-w-3xl px-4 sm:px-8 w-full">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#7C3AED]/25 bg-[#7C3AED]/8 dark:bg-[#7C3AED]/15 px-4 py-2 text-xs text-slate-700 dark:text-zinc-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  isRecording ? 'bg-red-500 animate-pulse' : 'bg-[#7C3AED] animate-pulse'
                }`}
                aria-hidden="true"
              />
              <span className="font-semibold shrink-0">
                {isTranscribing
                  ? 'Putting your speech into the text bar...'
                  : `Listening · ${durationSec}s (tap stop to paste into bar)`}
              </span>
              {liveTranscript && (
                <span className="truncate text-slate-600 dark:text-zinc-300 italic">
                  “{liveTranscript}”
                </span>
              )}
            </div>
            {isRecording && (
              <div className="flex items-center gap-1.5 shrink-0" aria-hidden="true">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#10B981] transition-all duration-75"
                    style={{ width: `${Math.max(8, audioLevel)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pinned Bottom Voice Input Dock */}
      <div className="border-t border-slate-200/80 dark:border-zinc-800 bg-white/95 dark:bg-[#09090B]/95 px-4 py-4 sm:px-8">
        <form
          onSubmit={handleSubmitText}
          className="mx-auto flex max-w-3xl items-center gap-3"
        >
          <button
            type="button"
            onClick={handleToggleDictateMic}
            disabled={isSending || isTranscribing}
            aria-label={
              isLiveActive
                ? live.isMuted
                  ? 'Unmute live microphone'
                  : 'Mute live microphone'
                : isRecording
                ? 'Stop recording and paste to text bar'
                : 'Dictate to text bar'
            }
            className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl transition-all shrink-0 cursor-pointer ${
              isLiveActive
                ? live.isMuted
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-[#10B981] text-white shadow-sm'
                : isRecording
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] text-white hover:opacity-95'
            }`}
          >
            {isTranscribing ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : isLiveActive ? (
              live.isMuted ? (
                <MicOff className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Mic className="h-5 w-5" aria-hidden="true" />
              )
            ) : isRecording ? (
              <MicOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Mic className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          <input
            ref={inputRef}
            type="text"
            value={displayedInputValue}
            onChange={(e) => setPromptInput(e.target.value)}
            readOnly={isRecording}
            placeholder={
              isLiveActive
                ? 'Speak out loud anytime, or type a message into the live call...'
                : isRecording
                ? 'Listening... tap stop to keep words in this text bar'
                : isTranscribing
                ? 'Pasting your words here...'
                : 'Tap mic to dictate into this box, or type to ask...'
            }
            aria-label="Voice conversation message"
            className="h-12 flex-1 min-w-0 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 px-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-[#7C3AED] focus:outline-none"
          />

          <button
            type="submit"
            disabled={isSending || isRecording || !displayedInputValue.trim()}
            aria-label="Send voice conversation message"
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-slate-900 dark:bg-white px-5 text-sm font-semibold text-white dark:text-slate-900 hover:bg-[#7C3AED] dark:hover:bg-[#7C3AED] dark:hover:text-white disabled:opacity-50 transition-colors shrink-0 cursor-pointer"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
