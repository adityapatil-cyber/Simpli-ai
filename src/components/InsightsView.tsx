import { useMemo } from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  Flame,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { computeInsightsSummary } from '../utils/simpliLogic';
import type {
  ConfidenceLogEntry,
  SavedClarifySession,
  VoiceConversation,
} from '../types/simpli';

interface InsightsViewProps {
  confidenceLogs: ConfidenceLogEntry[];
  clarifySessions: SavedClarifySession[];
  conversations: VoiceConversation[];
  onRevisitTopic: (topic: string) => void;
}

export function InsightsView({
  confidenceLogs,
  clarifySessions,
  conversations,
  onRevisitTopic,
}: InsightsViewProps) {
  const summary = useMemo(
    () => computeInsightsSummary(confidenceLogs, clarifySessions, conversations),
    [confidenceLogs, clarifySessions, conversations]
  );

  const totalRated =
    summary.confidenceCounts.notYet +
    summary.confidenceCounts.gettingThere +
    summary.confidenceCounts.gotIt;

  const pct = (count: number) =>
    totalRated > 0 ? Math.round((count / totalRated) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8" data-testid="insights-view">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            Simpli Insights
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Your personal clarity journey — topics mastered, confidence shifts, and calm next reviews.
          </p>
        </div>

        {/* 4 Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">
              <Award className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
              <span>Topics Mastered</span>
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold font-mono-tabular text-slate-900 dark:text-white">
              {summary.topicsMastered}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">
              <Flame className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span>Learning Streak</span>
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold font-mono-tabular text-slate-900 dark:text-white">
              {summary.learningStreakDays}d
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">
              <TrendingUp className="h-4 w-4 text-[#7C3AED]" aria-hidden="true" />
              <span>Tracked Topics</span>
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold font-mono-tabular text-slate-900 dark:text-white">
              {summary.totalTracked}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">
              <BarChart3 className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
              <span>Needs Review</span>
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold font-mono-tabular text-slate-900 dark:text-white">
              {summary.areasNeedingReview.length}
            </p>
          </div>
        </div>

        {/* Confidence Growth Breakdown */}
        <section className="rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Confidence Growth
            </h2>
            <span className="font-mono-tabular text-xs text-slate-500 dark:text-zinc-400">
              {totalRated} check-ins logged
            </span>
          </div>

          {totalRated === 0 ? (
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Tap 😬 Not Yet, 🙂 Getting There, or 😎 Got It after any explanation in Clarify Studio to track your confidence over time.
            </p>
          ) : (
            <div className="space-y-3">
              {[
                {
                  label: '😎 Got It',
                  count: summary.confidenceCounts.gotIt,
                  color: 'bg-[#10B981]',
                },
                {
                  label: '🙂 Getting There',
                  count: summary.confidenceCounts.gettingThere,
                  color: 'bg-[#3B82F6]',
                },
                {
                  label: '😬 Not Yet',
                  count: summary.confidenceCounts.notYet,
                  color: 'bg-amber-500',
                },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-zinc-200">
                      {row.label}
                    </span>
                    <span className="font-mono-tabular text-slate-500 dark:text-zinc-400">
                      {row.count} ({pct(row.count)}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${row.color}`}
                      style={{ width: `${pct(row.count)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Areas Needing Review + Most Difficult Subjects */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-3">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span>Areas Needing Review</span>
            </h2>
            {summary.areasNeedingReview.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                No topics flagged for review right now.
              </p>
            ) : (
              <div className="space-y-2">
                {summary.areasNeedingReview.map((item) => (
                  <div
                    key={item.topic}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {item.topic}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {item.level === 'not-yet' ? '😬 Needs slower angle' : '🙂 Getting there'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRevisitTopic(item.topic)}
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl bg-slate-900 dark:bg-white px-3 text-[11px] font-semibold text-white dark:text-slate-900 cursor-pointer"
                    >
                      <span>Revisit</span>
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-3">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Most Challenging Subjects
            </h2>
            {summary.mostDifficultSubjects.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Challenging topics detected by the Confusion Meter will show up here.
              </p>
            ) : (
              <div className="space-y-2">
                {summary.mostDifficultSubjects.map((topic) => (
                  <div
                    key={topic}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-3"
                  >
                    <span className="truncate text-xs font-semibold text-slate-800 dark:text-zinc-100">
                      {topic}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRevisitTopic(topic)}
                      className="text-xs font-semibold text-[#7C3AED] dark:text-[#A78BFA] hover:underline shrink-0 cursor-pointer"
                    >
                      Clarify again
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
