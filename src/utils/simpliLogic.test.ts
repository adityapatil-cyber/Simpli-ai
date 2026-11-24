import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendVoiceTurn,
  assembleStarterAnswer,
  buildFlashcardTxtExport,
  buildFullAnalysisSpeechScript,
  buildReadingChunks,
  buildReviewFlashcards,
  buildSectionSpeechText,
  buildSprintRecapScript,
  buildStudyPackMarkdown,
  canSubmitAnalysis,
  clampNormalizedRegion,
  cleanWordForLookup,
  computeInsightsSummary,
  createConversation,
  deriveFlowNodesFromPoints,
  estimateWordIndexFromProgress,
  filterConversations,
  findJargonMatch,
  formatSprintClock,
  getBrainModeConfig,
  getCompanionMessageForConfidence,
  parseTemplateParts,
  pickNextExplainStyle,
  sanitizeForSpeech,
  stripDisplayMarkdown,
} from './simpliLogic';
import {
  encodeWavPcm16,
  float32ToPcm16Base64,
  normalizeAudioMimeType,
  pcm16Base64ToFloat32,
  resampleFloat32,
} from './audioUtils';
import {
  buildConceptSceneBlueprint,
  classifyConceptArchetype,
} from './concept3dBlueprint';
import type { SavedClarifySession, SimpliAnalysis } from '../types/simpli';

const SAMPLE_ANALYSIS: SimpliAnalysis = {
  detectedTopic: 'Photosynthesis',
  extractedText: 'Chloroplast diagram text',
  theGist: 'Plants turn sunlight into sugar.',
  madeSimple: [
    'Light enters chlorophyll.',
    'ATP batteries get charged.',
    'Calvin cycle builds glucose.',
  ],
  examCheatcode: 'Remember: light reactions need water and release oxygen.',
  irlExample: 'Like solar panels charging a battery that runs a kitchen.',
  suggestedQuestions: ['What goes into the Calvin cycle?'],
  brainMode: 'step-by-step',
};

test('canSubmitAnalysis requires either an uploaded file or a non-empty query', () => {
  assert.equal(canSubmitAnalysis({ hasFile: false, query: '' }), false);
  assert.equal(canSubmitAnalysis({ hasFile: false, query: '   ' }), false);
  assert.equal(canSubmitAnalysis({ hasFile: true, query: '' }), true);
  assert.equal(canSubmitAnalysis({ hasFile: false, query: 'What is osmosis?' }), true);
});

test('getBrainModeConfig returns matching mode and safely falls back', () => {
  assert.equal(getBrainModeConfig('adhd-turbo').label, 'Focus Mode');
  assert.equal(getBrainModeConfig('eli10').emoji, '👶');
  assert.equal(getBrainModeConfig('story').label, 'Story Mode');
  assert.equal(getBrainModeConfig('academic').label, 'Academic Mode');
  // @ts-expect-error fallback test for unknown mode
  assert.equal(getBrainModeConfig('unknown-mode').id, 'adhd-turbo');
});

test('sanitizeForSpeech strips markdown formatting cleanly', () => {
  const raw = '**Key Point:** Sunlight -> *ATP* & `NADPH` [learn more](https://example.com)';
  assert.equal(sanitizeForSpeech(raw), 'Key Point: Sunlight -> ATP & NADPH learn more');
});

test('buildSectionSpeechText and buildFullAnalysisSpeechScript produce clean audio script', () => {
  const sectionText = buildSectionSpeechText('Made simple', ['First idea', 'Second idea']);
  assert.equal(sectionText, 'Made simple. Point 1. First idea Point 2. Second idea');

  const fullScript = buildFullAnalysisSpeechScript(SAMPLE_ANALYSIS);
  assert.ok(fullScript.includes('Photosynthesis'));
  assert.ok(fullScript.includes('solar panels'));
});

test('createConversation, appendVoiceTurn, and filterConversations manage learning sessions', () => {
  const base = createConversation({
    id: 'c1',
    brainMode: 'easy-read',
    nowIso: '2026-11-16T10:00:00.000Z',
  });
  assert.equal(base.title, 'New Learning Session');

  const withUserTurn = appendVoiceTurn(base, {
    id: 't1',
    role: 'user',
    text: 'Can you break down Newton second law in plain English?',
    timestamp: '2026-11-16T10:01:00.000Z',
  });
  assert.equal(withUserTurn.turns.length, 1);
  assert.equal(withUserTurn.title, 'Can you break down Newton second law in p...');

  const filtered = filterConversations([withUserTurn], 'newton');
  assert.equal(filtered.length, 1);
  assert.equal(filterConversations([withUserTurn], 'mitochondria').length, 0);
});

test('reading chunks, word lookup cleanup, and progress index estimation work accurately', () => {
  const chunks = buildReadingChunks(SAMPLE_ANALYSIS);
  assert.equal(chunks.length, 6);
  assert.equal(chunks[0].title, 'The Gist');
  assert.equal(chunks[1].title, 'Step 1 of 3');
  assert.equal(chunks[5].title, 'Real-Life Example');

  assert.equal(cleanWordForLookup('(chlorophyll),'), 'chlorophyll');
  assert.equal(stripDisplayMarkdown('Creates **ATP** and `NADPH`.'), 'Creates ATP and NADPH.');
  assert.equal(estimateWordIndexFromProgress(10, 0), 0);
  assert.equal(estimateWordIndexFromProgress(10, 0.55), 5);
  assert.equal(estimateWordIndexFromProgress(10, 1), 9);
  assert.equal(estimateWordIndexFromProgress(0, 0.5), -1);
});

test('sentence starter template parsing and assembly work smoothly', () => {
  const template = 'Light reactions happen in ___ to make ___.';
  const parts = parseTemplateParts(template);
  assert.equal(parts.filter((p) => p.type === 'blank').length, 2);

  const assembled = assembleStarterAnswer(template, { 0: 'thylakoids', 1: 'ATP' });
  assert.equal(assembled, 'Light reactions happen in thylakoids to make ATP.');
});

test('buildReviewFlashcards and txt export combine clarify and voice history cleanly', () => {
  const savedClarify: SavedClarifySession[] = [
    {
      id: 'cl-1',
      createdAt: '2026-11-16T09:00:00.000Z',
      analysis: SAMPLE_ANALYSIS,
    },
  ];
  const conv = appendVoiceTurn(
    createConversation({ id: 'v-1', brainMode: 'easy-read', title: 'Cell Respiration' }),
    {
      id: 'vt-1',
      role: 'assistant',
      text: 'Mitochondria release usable ATP from glucose.',
      timestamp: '2026-11-16T09:30:00.000Z',
    }
  );

  const cards = buildReviewFlashcards(savedClarify, [conv]);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].source, 'clarify');
  assert.equal(cards[1].source, 'voice');

  const txt = buildFlashcardTxtExport(cards);
  assert.ok(txt.includes('Photosynthesis'));
  assert.ok(txt.includes('Cell Respiration'));
});

test('encodeWavPcm16 writes valid RIFF/WAVE 16kHz mono PCM header', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1.5, -1.5]);
  const wav = encodeWavPcm16(samples, 16000);
  assert.equal(wav.byteLength, 44 + samples.length * 2);
  const view = new DataView(wav);
  assert.equal(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)), 'RIFF');
  assert.equal(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)), 'WAVE');
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getInt16(44 + 6, true), 32767);
  assert.equal(view.getInt16(44 + 8, true), -32768);
});

test('normalizeAudioMimeType preserves native compressed formats cleanly', () => {
  assert.equal(normalizeAudioMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(normalizeAudioMimeType('video/webm;codecs=vp8,opus'), 'audio/webm');
  assert.equal(normalizeAudioMimeType('audio/ogg;codecs=opus'), 'audio/ogg');
  assert.equal(normalizeAudioMimeType('audio/x-wav'), 'audio/wav');
  assert.equal(normalizeAudioMimeType(''), 'audio/webm');
});

test('resampleFloat32 and PCM16 base64 round-trip accurately for Live API', () => {
  const input48k = new Float32Array(480);
  for (let i = 0; i < input48k.length; i++) {
    input48k[i] = Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.5;
  }
  const resampled16k = resampleFloat32(input48k, 48000, 16000);
  assert.equal(resampled16k.length, 160);

  const b64 = float32ToPcm16Base64(input48k, 48000, 16000);
  const decoded = pcm16Base64ToFloat32(b64);
  assert.equal(decoded.length, 160);
  assert.ok(Math.abs(decoded[10] - resampled16k[10]) < 0.001);
});

test('clampNormalizedRegion enforces bounds and minimum selection size', () => {
  const clamped = clampNormalizedRegion({ x: -0.2, y: 0.9, width: 0.01, height: 0.5 });
  assert.equal(clamped.x, 0);
  assert.equal(clamped.y, 0.9);
  assert.equal(clamped.width, 0.05);
  assert.ok(clamped.y + clamped.height <= 1.0001);
});

test('deriveFlowNodesFromPoints creates connected start, process, and outcome nodes', () => {
  const nodes = deriveFlowNodesFromPoints(
    [
      'Sunlight: Hits chlorophyll inside thylakoid.',
      'ATP Batteries: Energy carriers get charged.',
      'Sugar Output: Calvin cycle builds glucose.',
    ],
    'Photosynthesis'
  );
  assert.equal(nodes.length, 3);
  assert.equal(nodes[0].title, 'Sunlight');
  assert.equal(nodes[0].kind, 'start');
  assert.equal(nodes[1].kind, 'process');
  assert.equal(nodes[2].kind, 'outcome');
});

test('formatSprintClock and buildSprintRecapScript handle timers and recaps cleanly', () => {
  assert.equal(formatSprintClock(605), '10:05');
  assert.equal(formatSprintClock(-5), '00:00');
  const script = buildSprintRecapScript({
    activeTopic: 'Supply & Demand',
    activeGist: 'Higher supply lowers equilibrium price.',
    clarifySessions: [],
    conversations: [],
  });
  assert.ok(script.includes('Supply & Demand'));
  assert.ok(script.includes('Higher supply lowers equilibrium price.'));
});

test('Vision 2.0 jargon matcher, explain style cycling, companion copy, and insights summary work', () => {
  const glossary = [{ term: 'Mitochondria', plainMeaning: 'Cell powerhouses that make energy.' }];
  assert.equal(findJargonMatch('mitochondria,', glossary)?.plainMeaning, 'Cell powerhouses that make energy.');
  assert.equal(findJargonMatch('apple', glossary), undefined);

  assert.equal(pickNextExplainStyle('visual'), 'story');
  assert.equal(pickNextExplainStyle('example-first'), 'visual');

  assert.ok(getCompanionMessageForConfidence('not-yet').quote.includes('another way'));

  const insights = computeInsightsSummary(
    [
      { id: '1', topic: 'Photosynthesis', level: 'got-it', difficulty: 'moderate', timestamp: '2026-11-22T01:00:00Z' },
      { id: '2', topic: 'Calculus Limits', level: 'not-yet', difficulty: 'challenging', timestamp: '2026-11-22T02:00:00Z' },
    ],
    [],
    []
  );
  assert.equal(insights.topicsMastered, 1);
  assert.equal(insights.confidenceCounts.gotIt, 1);
  assert.equal(insights.confidenceCounts.notYet, 1);
  assert.ok(insights.mostDifficultSubjects.includes('Calculus Limits'));

  const md = buildStudyPackMarkdown({
    topic: 'Photosynthesis',
    summary: 'Plants turn sun into sugar.',
    keyPoints: ['Light reactions charge ATP.'],
    flashcards: [{ question: 'What charges ATP?', answer: 'Light reactions', difficulty: 'Easy', conceptTag: 'Thylakoid' }],
    quizQuestions: [],
    revisionSheet: ['Stroma = Calvin cycle'],
    commonMistakes: ['Confusing stroma and stomata'],
    importantDefinitions: glossary,
    practiceQuestions: ['Where does the Calvin cycle occur?'],
    learningRoadmap: ['Learn Chloroplast structure first'],
  });
  assert.ok(md.includes('SIMPLI STUDY PACK: Photosynthesis'));
  assert.ok(md.includes('Light reactions charge ATP.'));
});

test('concept3dBlueprint classifies topics and builds balanced spatial parts', () => {
  assert.equal(classifyConceptArchetype('Photosynthesis: Chloroplast'), 'cycle');
  assert.equal(classifyConceptArchetype('Newton Laws & Force Equilibrium'), 'mechanics');
  assert.equal(classifyConceptArchetype('Renaissance Trade Routes'), 'architecture');

  const bp = buildConceptSceneBlueprint(SAMPLE_ANALYSIS);
  assert.equal(bp.archetype, 'cycle');
  assert.equal(bp.parts[0].role, 'core');
  assert.equal(bp.parts.length, 4); // 1 core + 3 madeSimple points
  assert.ok(bp.parts.every((p) => p.explodeOffset.length === 3));
});



