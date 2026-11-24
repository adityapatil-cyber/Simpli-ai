import type {
  AutoFlashcard,
  BrainModeConfig,
  BrainModeId,
  ConfidenceLevel,
  ConfidenceLogEntry,
  ExplainStyleId,
  FlowNode,
  InsightsSummary,
  JargonTerm,
  NormalizedRegion,
  ReadingChunk,
  ReadingPreferences,
  ReviewFlashcard,
  SavedClarifySession,
  SimpliAnalysis,
  StudyPackData,
  VoiceConversation,
  VoiceTurn,
} from '../types/simpli';

export const BRAIN_MODES: BrainModeConfig[] = [
  {
    id: 'adhd-turbo',
    emoji: '🌀',
    label: 'Focus Mode',
    shortDesc: 'ADHD-friendly short chunks, reduced distractions, important info only.',
    promptDirective:
      'Use Focus Mode: ultra-concise, high-signal chunks, zero filler, crisp bolded keywords, important information only.',
  },
  {
    id: 'easy-read',
    emoji: '📖',
    label: 'Easy Read',
    shortDesc: 'Dyslexia-friendly spacing, calm pacing, simpler wording.',
    promptDirective:
      'Use Easy Read mode: calm, plain everyday English with short sentences and clear spacing. Avoid dense jargon or double negatives.',
  },
  {
    id: 'step-by-step',
    emoji: '🧩',
    label: 'Step-by-Step',
    shortDesc: 'Sequential explanations with zero skipped reasoning.',
    promptDirective:
      'Break everything down into a strict numbered causal chain (Step 1 -> Step 2 -> Step 3) with zero skipped reasoning.',
  },
  {
    id: 'exam-grind',
    emoji: '🎯',
    label: 'Exam Mode',
    shortDesc: 'Quick revision, frequently tested points, high-priority cues.',
    promptDirective:
      'Focus on Exam Mode precision: frequently tested definitions, common grading traps, formula edge cases, and memory mnemonics.',
  },
  {
    id: 'eli10',
    emoji: '👶',
    label: "Explain Like I'm 10",
    shortDesc: 'Child-friendly language with everyday analogies everywhere.',
    promptDirective:
      'Explain using crystal-clear intuition and relatable everyday analogies a curious 10-year-old immediately grasps.',
  },
  {
    id: 'academic',
    emoji: '🎓',
    label: 'Academic Mode',
    shortDesc: 'Scholarly rigor preserving formal definitions & original terminology.',
    promptDirective:
      'Use Academic Mode: scholarly clarity that preserves accurate disciplinary terminology, formal mechanisms, and research precision.',
  },
  {
    id: 'teacher',
    emoji: '🧑‍🏫',
    label: 'Teacher Mode',
    shortDesc: 'Structured, supportive instructor framing with guided signposts.',
    promptDirective:
      'Adopt a warm, skilled classroom teacher voice: clear signposting, structured scaffolds, and anticipation of common student mistakes.',
  },
  {
    id: 'friend',
    emoji: '🧑',
    label: 'Friend Mode',
    shortDesc: 'Casual, encouraging conversational style over coffee.',
    promptDirective:
      'Explain in Friend Mode: warm, relaxed conversational wording as if a smart friend is sketching it on a napkin for you.',
  },
  {
    id: 'story',
    emoji: '📚',
    label: 'Story Mode',
    shortDesc: 'Turns concepts into vivid narrative scenes & characters.',
    promptDirective:
      'Use Story Mode: turn abstract actors, molecules, or variables into a short, memorable mini-story with clear cause and effect.',
  },
];

export const DEFAULT_READING_PREFS: ReadingPreferences = {
  dyslexiaFont: false,
  wideSpacing: false,
  surfaceTint: 'default',
  focusRuler: false,
  tapToDefine: false,
  chunkMode: false,
};

export const LOADING_STAGES = [
  '🧠 cooking...',
  '✨ untangling...',
  '👀 aha, got it.',
] as const;

export function getBrainModeConfig(mode: BrainModeId): BrainModeConfig {
  return BRAIN_MODES.find((m) => m.id === mode) ?? BRAIN_MODES[0];
}

export function canSubmitAnalysis(params: {
  hasFile: boolean;
  query: string;
}): boolean {
  return params.hasFile || params.query.trim().length > 0;
}

export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/^>\s+/gm, '')
    .replace(/[*_`#~]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSectionSpeechText(
  title: string,
  content: string | string[]
): string {
  const body = Array.isArray(content)
    ? content.map((item, idx) => `Point ${idx + 1}. ${item}`).join(' ')
    : content;
  return sanitizeForSpeech(`${title}. ${body}`);
}

export function buildFullAnalysisSpeechScript(analysis: SimpliAnalysis): string {
  const sections = [
    buildSectionSpeechText(`Topic: ${analysis.detectedTopic}. The gist`, analysis.theGist),
    buildSectionSpeechText('Made simple', analysis.madeSimple),
    buildSectionSpeechText('Exam cheatcode', analysis.examCheatcode),
    buildSectionSpeechText('In real life example', analysis.irlExample),
  ];
  return sections.join(' ');
}

export function deriveConversationTitle(
  firstPrompt: string,
  fallback = 'New Learning Session'
): string {
  const cleaned = firstPrompt.replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= 44) return cleaned;
  return `${cleaned.slice(0, 41).trimEnd()}...`;
}

export function createConversation(params: {
  id: string;
  title?: string;
  topicTag?: string;
  brainMode: BrainModeId;
  nowIso?: string;
}): VoiceConversation {
  const now = params.nowIso ?? new Date().toISOString();
  return {
    id: params.id,
    title: params.title?.trim() || 'New Learning Session',
    topicTag: params.topicTag?.trim() || 'General Study',
    brainMode: params.brainMode,
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
}

export function appendVoiceTurn(
  conversation: VoiceConversation,
  turn: VoiceTurn
): VoiceConversation {
  const shouldRetitle =
    conversation.turns.length === 0 &&
    turn.role === 'user' &&
    conversation.title === 'New Learning Session';

  return {
    ...conversation,
    title: shouldRetitle
      ? deriveConversationTitle(turn.text, conversation.title)
      : conversation.title,
    updatedAt: turn.timestamp,
    turns: [...conversation.turns, turn],
  };
}

export function filterConversations(
  conversations: VoiceConversation[],
  searchQuery: string
): VoiceConversation[] {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return conversations;
  return conversations.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.topicTag.toLowerCase().includes(q) ||
      c.turns.some((t) => t.text.toLowerCase().includes(q))
  );
}

export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function stripDisplayMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .trim();
}

export function splitWordTokens(text: string): string[] {
  return stripDisplayMarkdown(text).split(/\s+/).filter(Boolean);
}

export function cleanWordForLookup(token: string): string {
  return token.replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '');
}

export function estimateWordIndexFromProgress(
  totalWords: number,
  progressRatio: number
): number {
  if (totalWords <= 0) return -1;
  const clamped = Math.max(0, Math.min(1, progressRatio));
  return Math.min(totalWords - 1, Math.floor(clamped * totalWords));
}

export function buildReadingChunks(analysis: SimpliAnalysis): ReadingChunk[] {
  const chunks: ReadingChunk[] = [
    {
      id: 'chunk-gist',
      title: 'The Gist',
      emoji: '💡',
      text: analysis.theGist,
    },
  ];

  analysis.madeSimple.forEach((point, idx) => {
    chunks.push({
      id: `chunk-simple-${idx}`,
      title: `Step ${idx + 1} of ${analysis.madeSimple.length}`,
      emoji: '🧩',
      text: point,
    });
  });

  chunks.push({
    id: 'chunk-cheatcode',
    title: 'Exam Cheatcode',
    emoji: '🎯',
    text: analysis.examCheatcode,
  });

  chunks.push({
    id: 'chunk-irl',
    title: 'Real-Life Example',
    emoji: '🌍',
    text: analysis.irlExample,
  });

  return chunks;
}

export function parseTemplateParts(
  template: string
): Array<{ type: 'text' | 'blank'; value: string }> {
  const segments = template.split(/(___+)/g);
  return segments
    .filter((s) => s.length > 0)
    .map((segment) =>
      /^___+$/.test(segment)
        ? { type: 'blank' as const, value: segment }
        : { type: 'text' as const, value: segment }
    );
}

export function assembleStarterAnswer(
  template: string,
  blankValues: Record<number, string>
): string {
  const parts = parseTemplateParts(template);
  let blankIdx = 0;
  return parts
    .map((part) => {
      if (part.type === 'text') return part.value;
      const filled = (blankValues[blankIdx] ?? '').trim();
      blankIdx += 1;
      return filled || '___';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildReviewFlashcards(
  clarifySessions: SavedClarifySession[],
  conversations: VoiceConversation[],
  generatedFlashcards: AutoFlashcard[] = []
): ReviewFlashcard[] {
  const autoCards: ReviewFlashcard[] = generatedFlashcards.map((fc) => ({
    id: `rg-${fc.id}`,
    source: 'generated',
    title: fc.conceptTag || fc.topic,
    subtitle: `⚡ ${fc.difficulty} Flashcard · ${fc.topic}`,
    promptQuestion: fc.question,
    keyTakeaway: fc.answer,
    recapScript: sanitizeForSpeech(`${fc.question} Answer: ${fc.answer}`),
    difficultyTag: fc.difficulty,
    conceptTag: fc.conceptTag,
    createdAt: fc.createdAt,
  }));

  const clarifyCards: ReviewFlashcard[] = clarifySessions.map((session) => {
    const a = session.analysis;
    const summaryPoints = a.madeSimple.slice(0, 2).join(' ');
    const promptQuestion =
      a.suggestedQuestions?.[0]?.trim() ||
      `How would you explain ${a.detectedTopic} in one or two simple sentences?`;
    return {
      id: `rc-${session.id}`,
      source: 'clarify',
      title: a.detectedTopic,
      subtitle: `${getBrainModeConfig(a.brainMode).emoji} Clarify Recap`,
      promptQuestion,
      keyTakeaway: a.theGist,
      examTip: a.examCheatcode,
      recapScript: sanitizeForSpeech(
        `Quick recap on ${a.detectedTopic}. ${a.theGist} Key points: ${summaryPoints} Exam tip: ${a.examCheatcode}`
      ),
      createdAt: session.createdAt,
    };
  });

  const voiceCards: ReviewFlashcard[] = conversations
    .filter((c) => c.turns.length > 0)
    .map((conv) => {
      const userTurns = conv.turns.filter((t) => t.role === 'user');
      const assistantTurns = conv.turns.filter((t) => t.role === 'assistant');
      const promptQuestion =
        userTurns[0]?.text?.trim() ||
        `What is the main takeaway from ${conv.title}?`;
      const lastReply =
        assistantTurns[assistantTurns.length - 1]?.text ??
        conv.turns[conv.turns.length - 1]?.text ??
        '';
      return {
        id: `rv-${conv.id}`,
        source: 'voice',
        title: conv.title,
        subtitle: `${getBrainModeConfig(conv.brainMode).emoji} Voice Recap · ${conv.turns.length} turns`,
        promptQuestion,
        keyTakeaway: lastReply,
        recapScript: sanitizeForSpeech(
          `Voice session recap for ${conv.title}. ${lastReply}`
        ),
        createdAt: conv.updatedAt,
      };
    });

  return [...autoCards, ...clarifyCards, ...voiceCards];
}

export function buildFlashcardTxtExport(cards: ReviewFlashcard[]): string {
  if (cards.length === 0) return 'SIMPLI Quick Review — No saved cards yet.';
  return cards
    .map(
      (c, idx) =>
        `[${idx + 1}] ${c.title} (${c.subtitle})\nPrompt: ${c.promptQuestion}\nKey takeaway: ${c.keyTakeaway}\nAudio script: ${c.recapScript}\n`
    )
    .join('\n---\n\n');
}

export function clampNormalizedRegion(region: NormalizedRegion): NormalizedRegion {
  const x = Math.max(0, Math.min(0.95, region.x));
  const y = Math.max(0, Math.min(0.95, region.y));
  const width = Math.max(0.05, Math.min(1 - x, region.width));
  const height = Math.max(0.05, Math.min(1 - y, region.height));
  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    width: Number(width.toFixed(4)),
    height: Number(height.toFixed(4)),
  };
}

export function deriveFlowNodesFromPoints(
  points: string[],
  topic = 'Concept Flow'
): FlowNode[] {
  const cleanPoints = points
    .map((p) => stripDisplayMarkdown(p))
    .filter((p) => p.length > 0);
  if (cleanPoints.length === 0) {
    return [
      {
        id: 'node-0',
        title: topic,
        detail: 'Core idea simplified.',
        kind: 'start',
      },
    ];
  }

  return cleanPoints.map((point, idx) => {
    const colonSplit = point.split(/[:—–-]\s+/);
    let title = '';
    if (colonSplit.length > 1 && colonSplit[0].trim().length <= 36) {
      title = colonSplit[0].trim();
    } else {
      const words = point.split(/\s+/).filter(Boolean);
      title = words.slice(0, 4).join(' ').replace(/[.,;:!?]+$/, '');
      if (words.length > 4) title += '…';
    }
    const kind: FlowNode['kind'] =
      idx === 0 ? 'start' : idx === cleanPoints.length - 1 ? 'outcome' : 'process';
    return {
      id: `node-${idx}`,
      title: title || `Step ${idx + 1}`,
      detail: point,
      kind,
    };
  });
}

export function formatSprintClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function buildSprintRecapScript(params: {
  activeTopic?: string;
  activeGist?: string;
  clarifySessions: SavedClarifySession[];
  conversations: VoiceConversation[];
}): string {
  const cards = buildReviewFlashcards(params.clarifySessions, params.conversations);
  if (params.activeTopic && params.activeGist) {
    return sanitizeForSpeech(
      `Nice study sprint. Here is your 30-second recap on ${params.activeTopic}. ${params.activeGist} Take a breath, you made real progress.`
    );
  }
  if (cards.length > 0) {
    const topTwo = cards
      .slice(0, 2)
      .map((c) => `${c.title}: ${c.keyTakeaway}`)
      .join(' Next, ');
    return sanitizeForSpeech(
      `Nice work finishing your focus sprint. Quick recap: ${topTwo}`
    );
  }
  return 'Nice work finishing your study sprint. Take a gentle stretch break whenever you are ready.';
}

export const EXPLAIN_STYLES: ExplainStyleId[] = [
  'visual',
  'story',
  'analogy',
  'teacher',
  'friend',
  'example-first',
];

export function pickNextExplainStyle(current?: ExplainStyleId): ExplainStyleId {
  if (!current) return EXPLAIN_STYLES[0];
  const idx = EXPLAIN_STYLES.indexOf(current);
  return EXPLAIN_STYLES[(idx + 1) % EXPLAIN_STYLES.length];
}

export function findJargonMatch(
  word: string,
  glossary: JargonTerm[]
): JargonTerm | undefined {
  const cleaned = cleanWordForLookup(word).toLowerCase();
  if (!cleaned || cleaned.length < 3) return undefined;
  return glossary.find((g) => {
    const term = g.term.toLowerCase();
    return term === cleaned || term.split(/\s+/).includes(cleaned);
  });
}

export function getCompanionMessageForConfidence(level?: ConfidenceLevel): {
  quote: string;
  suggestion: string;
} {
  if (level === 'not-yet') {
    return {
      quote: "Let's try another way — zero rush.",
      suggestion: 'Want me to slow it down or sketch it visually?',
    };
  }
  if (level === 'getting-there') {
    return {
      quote: "You're connecting the pieces nicely.",
      suggestion: 'One quick example or Teach It Back locks it in.',
    };
  }
  if (level === 'got-it') {
    return {
      quote: 'That clicked cleanly — save flashcards for later.',
      suggestion: 'Ready for a 3-question check whenever you are.',
    };
  }
  return {
    quote: "Different brains learn differently — let's find your angle.",
    suggestion: 'Switch styles or zoom into any confusing piece anytime.',
  };
}

export function computeInsightsSummary(
  confidenceLogs: ConfidenceLogEntry[],
  clarifySessions: SavedClarifySession[],
  conversations: VoiceConversation[]
): InsightsSummary {
  const latestByTopic = new Map<string, ConfidenceLogEntry>();
  for (const entry of confidenceLogs) {
    const existing = latestByTopic.get(entry.topic);
    if (!existing || entry.timestamp > existing.timestamp) {
      latestByTopic.set(entry.topic, entry);
    }
  }

  const latestEntries = Array.from(latestByTopic.values());
  const masteredTopics = latestEntries
    .filter((e) => e.level === 'got-it')
    .map((e) => e.topic);

  const areasNeedingReview = latestEntries
    .filter((e) => e.level === 'not-yet' || e.level === 'getting-there')
    .map((e) => ({ topic: e.topic, level: e.level, timestamp: e.timestamp }));

  const difficultFromLogs = latestEntries
    .filter((e) => e.difficulty === 'challenging' || e.level === 'not-yet')
    .map((e) => e.topic);
  const difficultFromClarify = clarifySessions
    .filter((s) => s.analysis.confusionMeter?.level === 'challenging')
    .map((s) => s.analysis.detectedTopic);

  const mostDifficultSubjects = Array.from(
    new Set([...difficultFromLogs, ...difficultFromClarify])
  ).slice(0, 6);

  const uniqueDays = new Set<string>();
  confidenceLogs.forEach((l) => uniqueDays.add(l.timestamp.slice(0, 10)));
  clarifySessions.forEach((s) => uniqueDays.add(s.createdAt.slice(0, 10)));
  conversations.forEach((c) => uniqueDays.add(c.updatedAt.slice(0, 10)));

  return {
    topicsMastered: masteredTopics.length,
    totalTracked: Math.max(latestEntries.length, clarifySessions.length),
    learningStreakDays: Math.max(1, uniqueDays.size),
    confidenceCounts: {
      notYet: latestEntries.filter((e) => e.level === 'not-yet').length,
      gettingThere: latestEntries.filter((e) => e.level === 'getting-there').length,
      gotIt: masteredTopics.length,
    },
    masteredTopics,
    mostDifficultSubjects,
    areasNeedingReview,
  };
}

export function buildStudyPackMarkdown(pack: StudyPackData): string {
  return [
    `# SIMPLI STUDY PACK: ${pack.topic}`,
    '',
    '## Summary',
    pack.summary,
    '',
    '## Key Points',
    ...pack.keyPoints.map((p, i) => `${i + 1}. ${p}`),
    '',
    '## Revision Sheet',
    ...pack.revisionSheet.map((r) => `- ${r}`),
    '',
    '## Important Definitions',
    ...pack.importantDefinitions.map((d) => `- **${d.term}**: ${d.plainMeaning}`),
    '',
    '## Common Mistakes to Avoid',
    ...pack.commonMistakes.map((m) => `- ${m}`),
    '',
    '## Flashcards',
    ...pack.flashcards.map(
      (f, i) => `### Card ${i + 1} [${f.difficulty} · ${f.conceptTag}]\nQ: ${f.question}\nA: ${f.answer}`
    ),
    '',
    '## Practice Questions',
    ...pack.practiceQuestions.map((q, i) => `${i + 1}. ${q}`),
    '',
    '## Learning Roadmap',
    ...pack.learningRoadmap.map((step, i) => `Step ${i + 1}: ${step}`),
  ].join('\n');
}


