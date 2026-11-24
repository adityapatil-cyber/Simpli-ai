export type BrainModeId =
  | 'adhd-turbo'
  | 'easy-read'
  | 'step-by-step'
  | 'exam-grind'
  | 'eli10'
  | 'academic'
  | 'teacher'
  | 'friend'
  | 'story';

export type ConfidenceLevel = 'not-yet' | 'getting-there' | 'got-it';

export type VoiceOption = 'Kore' | 'Zephyr' | 'Puck' | 'Charon';

export type ReadingSurfaceTint = 'default' | 'cream' | 'sage' | 'blue';

export interface ReadingPreferences {
  dyslexiaFont: boolean;
  wideSpacing: boolean;
  surfaceTint: ReadingSurfaceTint;
  focusRuler: boolean;
  tapToDefine: boolean;
  chunkMode: boolean;
}

export interface WordDefinition {
  word: string;
  definition: string;
  pronunciation?: string;
}

export interface MicroCheckQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  encouragingFeedback: string;
  gentleHint: string;
}

export interface BrainModeConfig {
  id: BrainModeId;
  emoji: string;
  label: string;
  shortDesc: string;
  promptDirective: string;
}

export interface ConfusionMeterData {
  level: 'easy' | 'moderate' | 'challenging';
  estimatedComplexity: string;
  cognitiveLoad: 'Low' | 'Medium' | 'High';
  whyFeelsDifficult: string;
  typicalConfusionPoints: string[];
}

export interface WhyNotClickData {
  detectedCauses: string[];
  whatMightMakeDifficult: string;
  whatYouAlreadyUnderstand: string;
  whatToFocusNext: string;
}

export interface ConfusionHeatmapSection {
  sectionTitle: string;
  level: 'easy' | 'moderate' | 'confusing';
  summary: string;
  focusTip: string;
}

export interface JargonTerm {
  term: string;
  plainMeaning: string;
}

export interface MultiDocSynthesis {
  combinedOverview: string;
  sharedPatterns: string[];
  conceptConnections: string[];
}

export interface SimpliAnalysis {
  detectedTopic: string;
  extractedText: string;
  theGist: string;
  madeSimple: string[];
  examCheatcode: string;
  irlExample: string;
  suggestedQuestions: string[];
  brainMode: BrainModeId;
  confusionMeter?: ConfusionMeterData;
  whyNotClick?: WhyNotClickData;
  confusionHeatmap?: ConfusionHeatmapSection[];
  jargonGlossary?: JargonTerm[];
  multiDocSynthesis?: MultiDocSynthesis;
}

export interface ImLostBreakdown {
  oneSentence: string;
  simplestVersion: string;
  fiveBullets: string[];
  analogy: string;
  mostImportantTakeaway: string;
  whatToLearnFirst: string;
}

export type ExplainStyleId =
  | 'visual'
  | 'story'
  | 'analogy'
  | 'teacher'
  | 'friend'
  | 'example-first';

export interface ExplainDifferentlyResult {
  styleUsed: ExplainStyleId;
  styleLabel: string;
  headline: string;
  explanation: string;
  quickExample: string;
  keyShift: string;
}

export type SimpliMapType =
  | 'mind-map'
  | 'concept-map'
  | 'flowchart'
  | 'timeline'
  | 'knowledge-tree'
  | 'relationship-diagram';

export interface SimpliMapNode {
  id: string;
  label: string;
  note: string;
  group?: string;
  relationLabel?: string;
}

export interface SimpliMapResult {
  mapType: SimpliMapType;
  title: string;
  centerConcept: string;
  nodes: SimpliMapNode[];
}

export interface PrerequisiteStep {
  id: string;
  title: string;
  whyNeeded: string;
  quickRefresher: string;
}

export interface KnowledgeWebBranch {
  concept: string;
  relationship: string;
  whyConnected: string;
}

export interface KnowledgeWebResult {
  centerTopic: string;
  branches: KnowledgeWebBranch[];
}

export interface RealWorldConnectionsResult {
  everydayApplications: string[];
  jobsUsingThis: string[];
  realWorldRelevance: string;
  industryExamples: string[];
}

export interface AutoFlashcard {
  id: string;
  question: string;
  answer: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  conceptTag: string;
  topic: string;
  createdAt: string;
}

export interface SmartQuizQuestion {
  id: string;
  difficulty: 'Easy' | 'Medium' | 'Challenge';
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  conceptTag: string;
}

export interface SmartQuizData {
  topic: string;
  questions: SmartQuizQuestion[];
}

export interface StudyPackData {
  topic: string;
  summary: string;
  keyPoints: string[];
  flashcards: Array<{
    question: string;
    answer: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    conceptTag: string;
  }>;
  quizQuestions: Array<{
    difficulty: 'Easy' | 'Medium' | 'Challenge';
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    conceptTag: string;
  }>;
  revisionSheet: string[];
  commonMistakes: string[];
  importantDefinitions: JargonTerm[];
  practiceQuestions: string[];
  learningRoadmap: string[];
}

export interface ResearchPaperDecodeResult {
  titleGuess: string;
  whatWasStudied: string;
  whyItWasStudied: string;
  whatWasDiscovered: string;
  whyItMatters: string;
  explainLikeIm15: string;
}

export interface PanicModePack {
  topic: string;
  twoMinuteSummary: string;
  mostImportantConcepts: string[];
  likelyExamTopics: string[];
  quickRevisionSheet: string[];
  memoryTricks: string[];
}

export interface ConfidenceLogEntry {
  id: string;
  topic: string;
  level: ConfidenceLevel;
  difficulty: 'easy' | 'moderate' | 'challenging';
  timestamp: string;
}

export interface InsightsSummary {
  topicsMastered: number;
  totalTracked: number;
  learningStreakDays: number;
  confidenceCounts: {
    notYet: number;
    gettingThere: number;
    gotIt: number;
  };
  masteredTopics: string[];
  mostDifficultSubjects: string[];
  areasNeedingReview: Array<{ topic: string; level: ConfidenceLevel; timestamp: string }>;
}

export interface SavedClarifySession {
  id: string;
  createdAt: string;
  analysis: SimpliAnalysis;
}

export interface ReadingChunk {
  id: string;
  title: string;
  emoji: string;
  text: string;
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface VoiceTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  brainMode?: BrainModeId;
}

export interface VoiceConversation {
  id: string;
  title: string;
  topicTag: string;
  brainMode: BrainModeId;
  createdAt: string;
  updatedAt: string;
  turns: VoiceTurn[];
}

export interface SampleStudyItem {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  defaultQuery: string;
}

export type WritingDraftFormat = 'sentences' | 'bullets' | 'paragraph';

export interface WritingAssistResult {
  cleanDraft: string;
  preservedVoiceNote: string;
}

export interface HandwritingSuggestion {
  original: string;
  suggestion: string;
  reason: string;
}

export interface HandwritingCheckResult {
  transcription: string;
  whatsWorkingWell: string[];
  gentleSuggestions: HandwritingSuggestion[];
  improvedVersion: string;
}

export interface SentenceStarterItem {
  label: string;
  template: string;
}

export interface ReviewFlashcard {
  id: string;
  source: 'clarify' | 'voice' | 'generated';
  title: string;
  subtitle: string;
  promptQuestion: string;
  recapScript: string;
  keyTakeaway: string;
  examTip?: string;
  difficultyTag?: 'Easy' | 'Medium' | 'Hard';
  conceptTag?: string;
  createdAt: string;
}

export type FlashcardMastery = 'unseen' | 'got-it' | 'review-again';

export interface NormalizedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlowNode {
  id: string;
  title: string;
  detail: string;
  kind?: 'start' | 'process' | 'outcome';
}

export interface MathWhyStep {
  stepNumber: number;
  expression: string;
  why: string;
  checkTip?: string;
}

export interface MicroStepItem {
  stepNumber: number;
  title: string;
  action: string;
  estimatedMinutes: number;
  quickTip: string;
}

export interface TeachBackResult {
  topic: string;
  whatYouGotRight: string[];
  missingLink: string;
  friendlyPatch: string;
  confidenceNote: string;
}


