import { useState } from 'react';
import { findJargonMatch, stripDisplayMarkdown } from '../utils/simpliLogic';
import type { JargonTerm } from '../types/simpli';

interface JargonTextProps {
  text: string;
  glossary?: JargonTerm[];
  className?: string;
}

/**
 * Feature #9: Jargon Destroyer
 * Automatically highlights terms found in `jargonGlossary` with subtle dotted underline.
 * Hovering, focusing, or tapping reveals an instant plain-English definition tooltip.
 */
export function JargonText({ text, glossary = [], className = '' }: JargonTextProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const cleanText = stripDisplayMarkdown(text);

  if (!glossary.length) {
    return <span className={className}>{cleanText}</span>;
  }

  const tokens = cleanText.split(/(\s+)/);

  return (
    <span className={className}>
      {tokens.map((part, idx) => {
        if (/^\s+$/.test(part)) {
          return <span key={idx}>{part}</span>;
        }
        const match = findJargonMatch(part, glossary);
        if (!match) {
          return <span key={idx}>{part}</span>;
        }
        const key = `${idx}-${match.term}`;
        const isOpen = activeKey === key;

        return (
          <span
            key={key}
            className="relative inline-block"
            onMouseEnter={() => setActiveKey(key)}
            onMouseLeave={() => setActiveKey((curr) => (curr === key ? null : curr))}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveKey((curr) => (curr === key ? null : key));
              }}
              onFocus={() => setActiveKey(key)}
              onBlur={() => setActiveKey((curr) => (curr === key ? null : curr))}
              aria-label={`${match.term}: ${match.plainMeaning}`}
              className="inline rounded px-0.5 font-medium text-slate-900 dark:text-white underline decoration-[#7C3AED]/60 decoration-dotted underline-offset-4 hover:bg-[#7C3AED]/10 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/40 cursor-pointer"
            >
              {part}
            </button>

            {isOpen && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-0 bottom-full z-30 mb-1.5 w-60 rounded-xl border border-[#7C3AED]/30 bg-white dark:bg-zinc-900 px-3 py-2 text-left text-xs shadow-md"
              >
                <span className="block font-bold text-[#7C3AED] dark:text-[#A78BFA]">
                  {match.term}
                </span>
                <span className="mt-0.5 block leading-snug text-slate-700 dark:text-zinc-200">
                  {match.plainMeaning}
                </span>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
