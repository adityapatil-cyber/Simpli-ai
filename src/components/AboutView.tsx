export function AboutView({ onStartClarifying }: { onStartClarifying: () => void }) {
  const steps = [
    {
      emoji: '📸',
      title: 'drop it',
      detail:
        'Upload a screenshot, diagram, handwritten page, PDF, or enter a question directly.',
    },
    {
      emoji: '🧠',
      title: 'ai gets it',
      detail:
        'Gemini reads every label, equation, and context cue — then adapts to your brain mode.',
    },
    {
      emoji: '✨',
      title: 'you get it',
      detail:
        'Scan crisp cards, hear any section read aloud, or talk it through in Voice Tutor.',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-4xl space-y-10">
        {/* About Block */}
        <section className="rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/50 p-7 sm:p-10">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            built for every brain.
          </h2>
          <p className="mt-3 text-base sm:text-lg text-slate-600 dark:text-zinc-300 leading-relaxed max-w-2xl">
            Simpli turns screenshots, documents, diagrams, notes, and confusing content into explanations that actually click.
          </p>
          <button
            type="button"
            onClick={onStartClarifying}
            className="mt-6 inline-flex min-h-[42px] items-center rounded-2xl bg-slate-900 dark:bg-white px-5 py-2 text-sm font-semibold text-white dark:text-slate-900 hover:bg-[#7C3AED] dark:hover:bg-[#7C3AED] dark:hover:text-white transition-colors cursor-pointer"
          >
            Try Clarify Studio
          </button>
        </section>

        {/* How It Works */}
        <section>
          <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mb-5">
            how it works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl" aria-hidden="true">
                    {step.emoji}
                  </span>
                  <span className="font-mono-tabular text-xs font-medium text-slate-400">
                    0{index + 1}
                  </span>
                </div>
                <h4 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {step.title}
                </h4>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                  {step.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-slate-200/80 dark:border-zinc-800 pt-6 text-center">
          <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">
            because &apos;just read it again&apos; isn&apos;t helpful.
          </p>
        </footer>
      </div>
    </div>
  );
}
