import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Type,
  ThinkingLevel,
} from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { getBrainModeConfig } from './src/utils/simpliLogic';
import type {
  BrainModeId,
  ConfidenceLevel,
  ExplainStyleId,
  SimpliMapType,
  VoiceConversation,
} from './src/types/simpli';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '.data');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');

const SEED_CONVERSATIONS: VoiceConversation[] = [
  {
    id: 'seed-photosynthesis',
    title: 'Chloroplast Light vs Calvin Cycle',
    topicTag: 'Biology · Cellular Energy',
    brainMode: 'step-by-step',
    createdAt: '2026-11-15T14:20:00.000Z',
    updatedAt: '2026-11-15T14:24:00.000Z',
    turns: [
      {
        id: 'seed-p-1',
        role: 'user',
        text: 'Why do textbooks split photosynthesis into two separate stages instead of one equation?',
        timestamp: '2026-11-15T14:20:00.000Z',
        brainMode: 'step-by-step',
      },
      {
        id: 'seed-p-2',
        role: 'assistant',
        text: 'Step 1: Light reactions act like solar panels in the thylakoid, capturing sunlight to charge ATP and NADPH batteries. Step 2: The Calvin cycle happens in the stroma and spends those charged batteries to build actual sugar from carbon dioxide. Separating them lets the plant capture energy rapidly when light hits, then assemble molecules steadily.',
        timestamp: '2026-11-15T14:21:00.000Z',
        brainMode: 'step-by-step',
      },
    ],
  },
  {
    id: 'seed-supply-demand',
    title: 'Supply Curve Shift vs Movement',
    topicTag: 'Economics · Equilibrium',
    brainMode: 'exam-grind',
    createdAt: '2026-11-14T18:05:00.000Z',
    updatedAt: '2026-11-14T18:09:00.000Z',
    turns: [
      {
        id: 'seed-e-1',
        role: 'user',
        text: 'What is the fastest way not to mix up a shift in supply with movement along the curve?',
        timestamp: '2026-11-14T18:05:00.000Z',
        brainMode: 'exam-grind',
      },
      {
        id: 'seed-e-2',
        role: 'assistant',
        text: 'Exam rule: Price of the good itself causes movement along the existing curve. Anything else, like input costs, taxes, or technology, shifts the entire curve left or right. When supply drops and shifts left, equilibrium price rises while equilibrium quantity falls.',
        timestamp: '2026-11-14T18:06:00.000Z',
        brainMode: 'exam-grind',
      },
    ],
  },
];

function ensureConversationsStore(): VoiceConversation[] {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONVERSATIONS_FILE)) {
    fs.writeFileSync(
      CONVERSATIONS_FILE,
      JSON.stringify(SEED_CONVERSATIONS, null, 2),
      'utf-8'
    );
    return SEED_CONVERSATIONS;
  }
  try {
    const raw = fs.readFileSync(CONVERSATIONS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_CONVERSATIONS;
  } catch {
    return SEED_CONVERSATIONS;
  }
}

function saveConversationsStore(conversations: VoiceConversation[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(
    CONVERSATIONS_FILE,
    JSON.stringify(conversations, null, 2),
    'utf-8'
  );
}

function getGeminiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseFriendlyGeminiMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return String(parsed.error.message);
  } catch {
    // not JSON
  }
  return raw;
}

function getErrorMessage(err: unknown): { status: number; message: string } {
  if (err instanceof Error) {
    const msg = parseFriendlyGeminiMessage(err.message || 'Unexpected Gemini API error');
    if (msg.includes('GEMINI_API_KEY is not configured')) {
      return { status: 500, message: msg };
    }
    if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
      return {
        status: 403,
        message: 'API permission denied. Please verify GEMINI_API_KEY in Settings > Secrets.',
      };
    }
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      return {
        status: 429,
        message: 'Rate limit reached. Please wait a moment and try again.',
      };
    }
    if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
      return {
        status: 503,
        message: 'Gemini is experiencing a brief demand spike. Please click try again in a second.',
      };
    }
    return { status: 500, message: msg };
  }
  return { status: 500, message: 'Unexpected server error.' };
}

function isTransientError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return (
    text.includes('503') ||
    text.includes('UNAVAILABLE') ||
    text.includes('high demand') ||
    text.includes('429') ||
    text.includes('RESOURCE_EXHAUSTED')
  );
}

async function generateWithResilience<T>(
  runner: (model: string) => Promise<T>,
  primaryModel = 'gemini-4-hydrogen',
  fallbackModel = 'gemini-3.1-flash-lite'
): Promise<T> {
  const models = [primaryModel, fallbackModel];
  let lastError: unknown;

  for (let i = 0; i < models.length; i++) {
    try {
      return await runner(models[i]);
    } catch (err) {
      lastError = err;
      if (!isTransientError(err) || i === models.length - 1) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Analyze uploaded images/PDFs (single or multi-doc) + optional text query
  app.post('/api/analyze', async (req, res) => {
    try {
      const {
        fileBase64,
        mimeType,
        files = [],
        query = '',
        brainMode = 'adhd-turbo',
        isRegionCrop = false,
        confidenceLevel,
      } = req.body as {
        fileBase64?: string;
        mimeType?: string;
        files?: Array<{ fileBase64: string; mimeType: string; fileName?: string }>;
        query?: string;
        brainMode?: BrainModeId;
        isRegionCrop?: boolean;
        confidenceLevel?: ConfidenceLevel;
      };

      const normalizedFiles =
        Array.isArray(files) && files.length > 0
          ? files.filter((f) => f?.fileBase64 && f?.mimeType)
          : fileBase64 && mimeType
          ? [{ fileBase64, mimeType, fileName: 'Uploaded Study Material' }]
          : [];

      if (normalizedFiles.length === 0 && !query.trim()) {
        return res.status(400).json({
          error: 'Please drop a photo/PDF or type what is confusing you.',
        });
      }

      const ai = getGeminiClient();
      const modeCfg = getBrainModeConfig(brainMode);

      const parts: Array<
        | { inlineData: { mimeType: string; data: string } }
        | { text: string }
      > = [];

      normalizedFiles.forEach((file, idx) => {
        const cleanBase64 = file.fileBase64.includes(',')
          ? file.fileBase64.split(',')[1]
          : file.fileBase64;
        if (normalizedFiles.length > 1 && file.fileName) {
          parts.push({ text: `Document ${idx + 1}: ${file.fileName}` });
        }
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: cleanBase64,
          },
        });
      });

      const regionHint = isRegionCrop
        ? 'The learner specifically highlighted and zoomed into this exact region because ONLY this spot feels confusing. Focus 100% on explaining what is inside this highlighted crop clearly without overwhelming them with unrelated details.\n\n'
        : '';

      const adaptiveHint =
        confidenceLevel === 'not-yet'
          ? 'Adaptive Pacing: The learner recently marked "Not Yet" on similar material—use extra-gentle scaffolding, shorter sentences, and crystal-clear foundational links.\n\n'
          : confidenceLevel === 'got-it'
          ? 'Adaptive Pacing: The learner recently felt confident—you can connect ideas briskly while keeping calm clarity.\n\n'
          : '';

      const multiDocHint =
        normalizedFiles.length > 1
          ? `Multi-Document Mode (${normalizedFiles.length} documents attached): Synthesize all documents together, identify shared patterns, and connect concepts across them in multiDocSynthesis.\n\n`
          : '';

      const userQueryPart = query.trim()
        ? `User's specific question/focus: "${query.trim()}". Address this directly while explaining the full concept.`
        : 'Analyze the uploaded material completely and diagnose why it might feel confusing before explaining it clearly.';

      parts.push({
        text: `${regionHint}${adaptiveHint}${multiDocHint}${userQueryPart}\n\nExplanation mode: ${modeCfg.label}.\nStyle directive: ${modeCfg.promptDirective}`,
      });

      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            systemInstruction:
              'You are Simpli ("From Huh? -> To Ohhh."), a calm, empathetic personalized understanding engine for neurodivergent and curious learners. Diagnose why material feels confusing BEFORE explaining it, highlight jargon in plain English, score section cognitive load calmly, and deliver high-signal clarity.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                detectedTopic: {
                  type: Type.STRING,
                  description: 'Concise 2-6 word title of the core subject.',
                },
                extractedText: {
                  type: Type.STRING,
                  description:
                    'Accurate OCR summary or structured readout of key text, labels, equations, or concepts observed.',
                },
                theGist: {
                  type: Type.STRING,
                  description: '1-2 crystal clear sentences capturing the core idea.',
                },
                madeSimple: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    '3 to 5 clear, bite-sized bullet points explaining how it works in the requested Brain Mode.',
                },
                examCheatcode: {
                  type: Type.STRING,
                  description:
                    'High-yield memory trick, key distinction, or common mistake to avoid.',
                },
                irlExample: {
                  type: Type.STRING,
                  description:
                    'One concrete, memorable real-world analogy that makes the concept click.',
                },
                suggestedQuestions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 smart, short follow-up questions a learner would ask next.',
                },
                confusionMeter: {
                  type: Type.OBJECT,
                  properties: {
                    level: {
                      type: Type.STRING,
                      description: 'Must be strictly one of: easy, moderate, challenging',
                    },
                    estimatedComplexity: {
                      type: Type.STRING,
                      description: 'Short label e.g. "Foundational" or "Multi-step reasoning"',
                    },
                    cognitiveLoad: {
                      type: Type.STRING,
                      description: 'Must be strictly one of: Low, Medium, High',
                    },
                    whyFeelsDifficult: {
                      type: Type.STRING,
                      description: '1-2 empathetic sentences on why learners find this tricky.',
                    },
                    typicalConfusionPoints: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: '2-3 specific traps or stumbling blocks.',
                    },
                  },
                  required: [
                    'level',
                    'estimatedComplexity',
                    'cognitiveLoad',
                    'whyFeelsDifficult',
                    'typicalConfusionPoints',
                  ],
                },
                whyNotClick: {
                  type: Type.OBJECT,
                  properties: {
                    detectedCauses: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description:
                        '1-3 root causes such as Too much information at once, Dense vocabulary, Missing prerequisite knowledge, Abstract concepts, Multiple concepts overlapping.',
                    },
                    whatMightMakeDifficult: {
                      type: Type.STRING,
                      description: 'What might be making this difficult right now.',
                    },
                    whatYouAlreadyUnderstand: {
                      type: Type.STRING,
                      description: 'Reassuring note on intuitive pieces the learner already knows.',
                    },
                    whatToFocusNext: {
                      type: Type.STRING,
                      description: 'Single concrete next thing to anchor on.',
                    },
                  },
                  required: [
                    'detectedCauses',
                    'whatMightMakeDifficult',
                    'whatYouAlreadyUnderstand',
                    'whatToFocusNext',
                  ],
                },
                confusionHeatmap: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      sectionTitle: { type: Type.STRING },
                      level: {
                        type: Type.STRING,
                        description: 'Strictly one of: easy, moderate, confusing',
                      },
                      summary: { type: Type.STRING },
                      focusTip: { type: Type.STRING },
                    },
                    required: ['sectionTitle', 'level', 'summary', 'focusTip'],
                  },
                  description: '3 to 4 logical sections ranked by difficulty.',
                },
                jargonGlossary: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      term: { type: Type.STRING },
                      plainMeaning: {
                        type: Type.STRING,
                        description: 'Short 6-15 word plain-English definition.',
                      },
                    },
                    required: ['term', 'plainMeaning'],
                  },
                  description: '4 to 8 technical or tricky terms used in the topic and their plain-English meanings.',
                },
                multiDocSynthesis: {
                  type: Type.OBJECT,
                  properties: {
                    combinedOverview: { type: Type.STRING },
                    sharedPatterns: { type: Type.ARRAY, items: { type: Type.STRING } },
                    conceptConnections: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['combinedOverview', 'sharedPatterns', 'conceptConnections'],
                },
              },
              required: [
                'detectedTopic',
                'extractedText',
                'theGist',
                'madeSimple',
                'examCheatcode',
                'irlExample',
                'suggestedQuestions',
                'confusionMeter',
                'whyNotClick',
                'confusionHeatmap',
                'jargonGlossary',
              ],
            },
          },
        })
      );

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      if (normalizedFiles.length <= 1) {
        delete parsed.multiDocSynthesis;
      }
      return res.json({
        ...parsed,
        brainMode,
      });
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Follow-up Ask Anything chat
  app.post('/api/chat', async (req, res) => {
    try {
      const {
        message,
        history = [],
        brainMode = 'adhd-turbo',
        contextSummary = '',
      } = req.body as {
        message: string;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        brainMode?: BrainModeId;
        contextSummary?: string;
      };

      if (!message?.trim()) {
        return res.status(400).json({ error: 'Message cannot be empty.' });
      }

      const ai = getGeminiClient();
      const modeCfg = getBrainModeConfig(brainMode);

      const historyText = history
        .slice(-8)
        .map((h) => `${h.role === 'user' ? 'Learner' : 'Simpli'}: ${h.content}`)
        .join('\n');

      const prompt = [
        contextSummary ? `Study Context:\n${contextSummary}` : '',
        historyText ? `Recent Thread:\n${historyText}` : '',
        `Learner Question: ${message.trim()}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            systemInstruction: `You are Simpli's follow-up clarity tutor. Mode: ${modeCfg.label}. ${modeCfg.promptDirective} Keep answers concise (under 110 words), direct, and easy to skim or listen to.`,
          },
        })
      );

      return res.json({
        reply: response.text?.trim() || 'Let me rephrase that clearly for you.',
      });
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Voice Conversation Studio turn
  app.post('/api/voice-turn', async (req, res) => {
    try {
      const {
        message,
        history = [],
        brainMode = 'easy-read',
        topicContext = '',
      } = req.body as {
        message: string;
        history?: Array<{ role: 'user' | 'assistant'; text: string }>;
        brainMode?: BrainModeId;
        topicContext?: string;
      };

      if (!message?.trim()) {
        return res.status(400).json({ error: 'Voice prompt cannot be empty.' });
      }

      const ai = getGeminiClient();
      const modeCfg = getBrainModeConfig(brainMode);

      const transcript = history
        .slice(-10)
        .map((t) => `${t.role === 'user' ? 'Student' : 'Simpli'}: ${t.text}`)
        .join('\n');

      const prompt = [
        topicContext ? `Active Study Material:\n${topicContext}` : '',
        transcript ? `Conversation History:\n${transcript}` : '',
        `Student (spoken): ${message.trim()}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            systemInstruction: `You are Simpli, a calm, articulate voice learning partner. Mode: ${modeCfg.label}. ${modeCfg.promptDirective} Write natural spoken prose with NO markdown asterisks, bullet symbols, or hashtags so it sounds smooth when read aloud. Keep replies focused (2 to 4 crisp sentences) and end with a quick optional check-in question when helpful.`,
          },
        })
      );

      return res.json({
        reply:
          response.text?.trim() ||
          'I heard you clearly. Could you share which part you want to unpack first?',
      });
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Audio Transcription for Voice Conversation & Talk-to-Write mic input
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/wav' } = req.body as {
        audioBase64: string;
        mimeType?: string;
      };

      if (!audioBase64) {
        return res.status(400).json({ error: 'No audio data received.' });
      }

      let cleanBase64 = audioBase64;
      let detectedMime = mimeType;
      if (audioBase64.startsWith('data:')) {
        const commaIdx = audioBase64.indexOf(',');
        if (commaIdx !== -1) {
          const header = audioBase64.slice(5, commaIdx);
          const semiIdx = header.indexOf(';');
          const headerMime = (semiIdx !== -1 ? header.slice(0, semiIdx) : header).trim();
          if (!mimeType && headerMime) {
            detectedMime = headerMime;
          }
          cleanBase64 = audioBase64.slice(commaIdx + 1);
        }
      }

      let cleanMimeType =
        (detectedMime || 'audio/wav').split(';')[0].trim().toLowerCase() || 'audio/wav';
      if (cleanMimeType === 'audio/x-wav' || cleanMimeType === 'audio/wave') {
        cleanMimeType = 'audio/wav';
      }

      const ai = getGeminiClient();

      const audioPart = {
        inlineData: {
          mimeType: cleanMimeType,
          data: cleanBase64,
        },
      };

      const runMultimodalTranscribe = async (model: string) => {
        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [
              audioPart,
              {
                text: 'Transcribe the exact spoken words from this audio clip. Return only the transcribed text with normal punctuation.',
              },
            ],
          },
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
          },
        });
        return (response.text ?? '').trim();
      };

      const runTranscribeFallback = async (): Promise<string> => {
        try {
          const v1betaAi = getGeminiClient('v1beta');
          const trRes = await v1betaAi.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: { parts: [audioPart, { text: 'Transcribe this audio.' }] },
          });
          const text = (trRes.text ?? '').trim();
          if (text) return text;
        } catch {
          // Proceed to gemini-3.1-flash-lite fallback
        }
        return runMultimodalTranscribe('gemini-3.1-flash-lite');
      };

      let rawText = '';
      try {
        rawText = await runMultimodalTranscribe('gemini-4-hydrogen');
      } catch (primaryErr) {
        try {
          rawText = await runTranscribeFallback();
        } catch {
          if (!isTransientError(primaryErr)) throw primaryErr;
          rawText = await runMultimodalTranscribe('gemini-3.1-flash-lite');
        }
      }

      if (!rawText) {
        try {
          rawText = await runTranscribeFallback();
        } catch {
          // Keep empty string if all fallback attempts returned empty
        }
      }

      const normalized = rawText.replace(/^["'`]+|["'`]+$/g, '').trim();
      return res.json({ text: normalized });
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Text-to-Speech Hearing Option via Gemini 3.8 Flash Lite TTS
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voiceName = 'Kore' } = req.body as {
        text: string;
        voiceName?: string;
      };

      if (!text?.trim()) {
        return res.status(400).json({ error: 'Text is required for speech playback.' });
      }

      const allowedVoices = ['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir'];
      const chosenVoice = allowedVoices.includes(voiceName) ? voiceName : 'Kore';

      const ai = getGeminiClient('v1beta');
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.slice(0, 2800),
                speechMetadata: {
                  style: 'Clear, warm, articulate educator explaining concepts calmly',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: chosenVoice },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        return res.status(502).json({ error: 'Audio synthesis returned empty payload.' });
      }

      return res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Tap-to-Define Jargon: 1-line plain-English meaning + pronunciation hint
  app.post('/api/define', async (req, res) => {
    try {
      const { word, context = '' } = req.body as {
        word?: string;
        context?: string;
      };
      if (!word?.trim()) {
        return res.status(400).json({ error: 'Word is required.' });
      }
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Word: "${word.trim()}"\nContext: "${context.slice(0, 350)}"\nGive a 1-sentence plain-English definition a neurodivergent student gets instantly, plus a simple phonetic pronunciation.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                definition: {
                  type: Type.STRING,
                  description: 'One short plain-English sentence (under 20 words).',
                },
                pronunciation: {
                  type: Type.STRING,
                  description: 'Easy phonetic guide, e.g. klo-roh-fil.',
                },
              },
              required: ['word', 'definition', 'pronunciation'],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Quick "Did It Click?" 1-tap micro-check question
  app.post('/api/micro-check', async (req, res) => {
    try {
      const { topic, theGist, brainMode = 'easy-read' } = req.body as {
        topic?: string;
        theGist?: string;
        brainMode?: BrainModeId;
      };
      if (!topic?.trim() && !theGist?.trim()) {
        return res.status(400).json({ error: 'Topic summary is required.' });
      }
      const ai = getGeminiClient();
      const modeCfg = getBrainModeConfig(brainMode);
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\nSummary: ${theGist}\nMode: ${modeCfg.label}\nCreate 1 friendly, low-pressure comprehension check question with 3 short answer choices.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            systemInstruction:
              'You create supportive 1-question comprehension checks for neurodivergent learners. Keep wording clear, encouraging, and free of trick phrasing.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.INTEGER },
                encouragingFeedback: {
                  type: Type.STRING,
                  description: 'Warm, concise affirmation when answered correctly.',
                },
                gentleHint: {
                  type: Type.STRING,
                  description: 'Kind, calm nudge toward the right idea without harsh tone.',
                },
              },
              required: [
                'question',
                'options',
                'correctIndex',
                'encouragingFeedback',
                'gentleHint',
              ],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Writing Support 1: Talk-to-Write (Messy spoken/typed thoughts -> Clean Draft)
  app.post('/api/writing-assist', async (req, res) => {
    try {
      const {
        rawThoughts,
        format = 'sentences',
        brainMode = 'easy-read',
      } = req.body as {
        rawThoughts?: string;
        format?: 'sentences' | 'bullets' | 'paragraph';
        brainMode?: BrainModeId;
      };
      if (!rawThoughts?.trim()) {
        return res.status(400).json({ error: 'Speak or enter your thoughts first.' });
      }
      const ai = getGeminiClient();
      const formatDirective =
        format === 'bullets'
          ? 'Organize into crisp, logical bullet points.'
          : format === 'paragraph'
          ? 'Organize into one smooth, cohesive paragraph.'
          : 'Organize into clean, clear standalone sentences.';

      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Messy thoughts from learner:\n"${rawThoughts.trim()}"\n\nOutput style: ${formatDirective}\nMode context: ${getBrainModeConfig(brainMode).label}`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            systemInstruction:
              'You help neurodivergent learners with dysgraphia or blank-page paralysis turn spoken or messy thoughts into clean writing. Preserve the user’s authentic voice and ideas; fix only spelling, grammar, and order.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                cleanDraft: { type: Type.STRING },
                preservedVoiceNote: {
                  type: Type.STRING,
                  description: 'Short reassuring 1-line note on how their ideas were organized.',
                },
              },
              required: ['cleanDraft', 'preservedVoiceNote'],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Writing Support 2: Handwriting & Draft Helper (Photo or text check)
  app.post('/api/writing-check', async (req, res) => {
    try {
      const { fileBase64, mimeType, draftText = '' } = req.body as {
        fileBase64?: string;
        mimeType?: string;
        draftText?: string;
      };
      if (!fileBase64 && !draftText.trim()) {
        return res
          .status(400)
          .json({ error: 'Upload a handwritten photo or paste a draft to check.' });
      }

      const ai = getGeminiClient();
      const parts: Array<
        | { inlineData: { mimeType: string; data: string } }
        | { text: string }
      > = [];

      if (fileBase64 && mimeType) {
        const cleanBase64 = fileBase64.includes(',')
          ? fileBase64.split(',')[1]
          : fileBase64;
        parts.push({ inlineData: { mimeType, data: cleanBase64 } });
      }

      parts.push({
        text: draftText.trim()
          ? `Additional typed draft/context: "${draftText.trim()}". Read the handwritten/typed work, transcribe accurately, celebrate what is already clear first, and suggest gentle spelling or clarity improvements.`
          : 'Transcribe this handwritten note or essay draft cleanly, list what is already strong/clear first, and provide gentle spelling/clarity swaps plus a polished version.',
      });

      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            systemInstruction:
              'You are a supportive writing coach for neurodivergent students. Always highlight strengths first, never shame spelling mistakes, and keep suggestions brief and kind.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                transcription: { type: Type.STRING },
                whatsWorkingWell: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '2-3 specific things that are already clear or strong.',
                },
                gentleSuggestions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      original: { type: Type.STRING },
                      suggestion: { type: Type.STRING },
                      reason: { type: Type.STRING },
                    },
                    required: ['original', 'suggestion', 'reason'],
                  },
                },
                improvedVersion: { type: Type.STRING },
              },
              required: [
                'transcription',
                'whatsWorkingWell',
                'gentleSuggestions',
                'improvedVersion',
              ],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Writing Support 3: Low-Friction Sentence Starters
  app.post('/api/sentence-starters', async (req, res) => {
    try {
      const { promptText = '', fileBase64, mimeType } = req.body as {
        promptText?: string;
        fileBase64?: string;
        mimeType?: string;
      };
      if (!promptText.trim() && !fileBase64) {
        return res
          .status(400)
          .json({ error: 'Enter a question/prompt or attach a worksheet photo.' });
      }

      const ai = getGeminiClient();
      const parts: Array<
        | { inlineData: { mimeType: string; data: string } }
        | { text: string }
      > = [];

      if (fileBase64 && mimeType) {
        const cleanBase64 = fileBase64.includes(',')
          ? fileBase64.split(',')[1]
          : fileBase64;
        parts.push({ inlineData: { mimeType, data: cleanBase64 } });
      }

      parts.push({
        text: `${promptText.trim() ? `Assignment/Question: "${promptText.trim()}"\n` : ''}Generate 3 fill-in-the-blank sentence starters using "___" for each blank slot so the student can easily fill in their own ideas without staring at a blank page.`,
      });

      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                detectedQuestion: { type: Type.STRING },
                starters: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: {
                        type: Type.STRING,
                        description: 'Short label like Opening Hook, Main Evidence, or Summary.',
                      },
                      template: {
                        type: Type.STRING,
                        description: 'Sentence containing 1 to 3 "___" blank placeholders.',
                      },
                    },
                    required: ['label', 'template'],
                  },
                },
              },
              required: ['detectedQuestion', 'starters'],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Visual Concept Map ("Show as Flow")
  app.post('/api/flow-map', async (req, res) => {
    try {
      const { topic = '', madeSimple = [], theGist = '' } = req.body as {
        topic?: string;
        madeSimple?: string[];
        theGist?: string;
      };
      if (!topic.trim() && madeSimple.length === 0) {
        return res.status(400).json({ error: 'Topic or explanation points are required.' });
      }
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\nThe Gist: ${theGist}\nPoints:\n${madeSimple.join('\n')}\n\nConvert this concept into a crisp causal 4-to-5 node visual flow map (like Sunlight -> Light Reaction -> ATP Batteries -> Calvin Cycle -> Sugar).`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            systemInstruction:
              'You create ultra-clean visual concept flow nodes for visual-spatial learners. Each node title must be 2 to 4 words max, with a 1-sentence plain-English detail.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                nodes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      detail: { type: Type.STRING },
                      kind: { type: Type.STRING },
                    },
                    required: ['id', 'title', 'detail', 'kind'],
                  },
                },
              },
              required: ['nodes'],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{"nodes":[]}').trim());
      return res.json(parsed);
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Step-by-Step Math & Equation "Why" Stepper
  app.post('/api/math-stepper', async (req, res) => {
    try {
      const {
        topic = '',
        extractedText = '',
        query = '',
        fileBase64,
        mimeType,
        brainMode = 'step-by-step',
      } = req.body as {
        topic?: string;
        extractedText?: string;
        query?: string;
        fileBase64?: string;
        mimeType?: string;
        brainMode?: BrainModeId;
      };

      if (!topic.trim() && !extractedText.trim() && !query.trim() && !fileBase64) {
        return res.status(400).json({ error: 'Provide an equation, sheet, or topic first.' });
      }

      const ai = getGeminiClient();
      const parts: Array<
        | { inlineData: { mimeType: string; data: string } }
        | { text: string }
      > = [];

      if (fileBase64 && mimeType && mimeType.startsWith('image/')) {
        const cleanBase64 = fileBase64.includes(',')
          ? fileBase64.split(',')[1]
          : fileBase64;
        parts.push({ inlineData: { mimeType, data: cleanBase64 } });
      }

      parts.push({
        text: `Topic: ${topic}\nQuestion: ${query}\nNotes/Equation: ${extractedText}\nMode: ${getBrainModeConfig(brainMode).label}\n\nBreak the worked equation, reaction, or quantitative logic into 3 to 6 sequential single-line steps so working memory is never overloaded. Pair each line with a short plain-English "why we did this" note.`,
      });

      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            systemInstruction:
              'You are Simpli’s step-by-step math and science coach for learners with working-memory overload. Reveal only ONE clean transformation per step and always explain WHY that change happened in plain English.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                problemTitle: { type: Type.STRING },
                steps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      stepNumber: { type: Type.INTEGER },
                      expression: {
                        type: Type.STRING,
                        description: 'The single clean equation, formula, or transition line for this step.',
                      },
                      why: {
                        type: Type.STRING,
                        description: 'Short plain-English "why we did this" explanation.',
                      },
                      checkTip: {
                        type: Type.STRING,
                        description: 'Optional 1-line sanity check.',
                      },
                    },
                    required: ['stepNumber', 'expression', 'why'],
                  },
                },
              },
              required: ['problemTitle', 'steps'],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Assignment & Worksheet "Micro-Step Chunker" (Anti-Freeze Checklist)
  app.post('/api/micro-steps', async (req, res) => {
    try {
      const {
        promptText = '',
        fileBase64,
        mimeType,
        brainMode = 'adhd-turbo',
      } = req.body as {
        promptText?: string;
        fileBase64?: string;
        mimeType?: string;
        brainMode?: BrainModeId;
      };

      if (!promptText.trim() && !fileBase64) {
        return res.status(400).json({
          error: 'Paste an assignment prompt or upload a worksheet/rubric first.',
        });
      }

      const ai = getGeminiClient();
      const parts: Array<
        | { inlineData: { mimeType: string; data: string } }
        | { text: string }
      > = [];

      if (fileBase64 && mimeType) {
        const cleanBase64 = fileBase64.includes(',')
          ? fileBase64.split(',')[1]
          : fileBase64;
        parts.push({ inlineData: { mimeType, data: cleanBase64 } });
      }

      parts.push({
        text: `${promptText.trim() ? `Assignment/Rubric/Worksheet:\n"${promptText.trim()}"\n\n` : ''}Break this task into 4 to 6 tiny, concrete sequential 2-minute micro-steps for someone experiencing task paralysis (${getBrainModeConfig(brainMode).label} style).`,
      });

      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            systemInstruction:
              'You help neurodivergent learners overcome executive dysfunction and blank-page freeze. Never give huge vague instructions like "Write essay". Every step must be tiny, concrete, take ~2 minutes, and feel easy to start right now.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                assignmentTitle: { type: Type.STRING },
                steps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      stepNumber: { type: Type.INTEGER },
                      title: { type: Type.STRING },
                      action: { type: Type.STRING },
                      estimatedMinutes: { type: Type.INTEGER },
                      quickTip: { type: Type.STRING },
                    },
                    required: ['stepNumber', 'title', 'action', 'estimatedMinutes', 'quickTip'],
                  },
                },
              },
              required: ['assignmentTitle', 'steps'],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // "Teach It Back" (Feynman Check in Voice Tutor)
  app.post('/api/teach-back', async (req, res) => {
    try {
      const {
        topic = 'Current Topic',
        referenceContext = '',
        learnerExplanation = '',
        brainMode = 'easy-read',
      } = req.body as {
        topic?: string;
        referenceContext?: string;
        learnerExplanation?: string;
        brainMode?: BrainModeId;
      };

      if (!learnerExplanation.trim()) {
        return res
          .status(400)
          .json({ error: 'Speak or type your explanation in your own words first.' });
      }

      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\n${referenceContext ? `Reference Context:\n${referenceContext}\n\n` : ''}Learner's messy own-words explanation:\n"${learnerExplanation.trim()}"\n\nEvaluate kindly using Feynman style (${getBrainModeConfig(brainMode).label}). Praise what they already nailed, identify at most ONE missing link or gentle clarification, and end with confidence—zero grades or red marks.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            systemInstruction:
              'You are Simpli’s supportive Feynman tutor for neurodivergent learners. Celebrate their reasoning first, never grade them, never sound harsh, and gently patch only the single missing link.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                whatYouGotRight: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                missingLink: { type: Type.STRING },
                friendlyPatch: { type: Type.STRING },
                confidenceNote: { type: Type.STRING },
              },
              required: [
                'topic',
                'whatYouGotRight',
                'missingLink',
                'friendlyPatch',
                'confidenceNote',
              ],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Emergency "🆘 I'm Lost" calming ultra-simple breakdown
  app.post('/api/im-lost', async (req, res) => {
    try {
      const { topic = '', theGist = '', extractedText = '' } = req.body as {
        topic?: string;
        theGist?: string;
        extractedText?: string;
      };
      if (!topic.trim() && !theGist.trim()) {
        return res.status(400).json({ error: 'Topic or explanation context is required.' });
      }
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\nCurrent Summary: ${theGist}\nNotes: ${extractedText.slice(0, 1200)}\n\nThe learner clicked "I'm Lost". Slow everything down and build the gentlest, simplest possible reset.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            systemInstruction:
              'You are Simpli’s calming reset engine. Speak gently, use zero intimidating jargon, keep sentences short, and focus only on what unlocks immediate relief and clarity.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                oneSentence: { type: Type.STRING },
                simplestVersion: { type: Type.STRING },
                fiveBullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                analogy: { type: Type.STRING },
                mostImportantTakeaway: { type: Type.STRING },
                whatToLearnFirst: { type: Type.STRING },
              },
              required: [
                'oneSentence',
                'simplestVersion',
                'fiveBullets',
                'analogy',
                'mostImportantTakeaway',
                'whatToLearnFirst',
              ],
            },
          },
        })
      );
      return res.json(JSON.parse((response.text ?? '{}').trim()));
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // "🔄 Explain Differently" style switcher
  app.post('/api/explain-differently', async (req, res) => {
    try {
      const {
        topic = '',
        theGist = '',
        style = 'visual',
      } = req.body as {
        topic?: string;
        theGist?: string;
        style?: ExplainStyleId;
      };
      if (!topic.trim() && !theGist.trim()) {
        return res.status(400).json({ error: 'Topic context is required.' });
      }
      const styleMap: Record<ExplainStyleId, string> = {
        visual: 'Visual Spatial Sketch (paint a clear mental picture with positions, colors, or flow)',
        story: 'Short Narrative Story (characters & action showing cause and effect)',
        analogy: 'Fresh Everyday Analogy (kitchen, sports, video game, or city traffic)',
        teacher: 'Warm Classroom Teacher (structured scaffold with clear signposts)',
        friend: 'Smart Friend Over Coffee (casual, encouraging, zero stiff wording)',
        'example-first': 'Concrete Example First (start with real numbers/scene, then state the rule)',
      };
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\nSummary: ${theGist}\nRequested Style: ${styleMap[style] || styleMap.visual}\n\nRe-explain this concept completely fresh in that exact style.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                styleUsed: { type: Type.STRING },
                styleLabel: { type: Type.STRING },
                headline: { type: Type.STRING },
                explanation: { type: Type.STRING },
                quickExample: { type: Type.STRING },
                keyShift: {
                  type: Type.STRING,
                  description: 'One short sentence on what new mental angle makes it click.',
                },
              },
              required: [
                'styleUsed',
                'styleLabel',
                'headline',
                'explanation',
                'quickExample',
                'keyShift',
              ],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({ ...parsed, styleUsed: style });
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Simpli Maps (Visual Learning Engine - 6 visual map types)
  app.post('/api/simpli-map', async (req, res) => {
    try {
      const {
        topic = '',
        theGist = '',
        madeSimple = [],
        mapType = 'mind-map',
      } = req.body as {
        topic?: string;
        theGist?: string;
        madeSimple?: string[];
        mapType?: SimpliMapType;
      };
      if (!topic.trim() && !theGist.trim()) {
        return res.status(400).json({ error: 'Topic context is required.' });
      }
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\nSummary: ${theGist}\nKey points: ${madeSimple.join(' | ')}\nRequested Map Type: ${mapType}\n\nBuild 5 to 6 clean visual nodes tailored specifically to a "${mapType}" layout (e.g., stages for timeline, root/sub-branches for knowledge-tree, cause-links for relationship-diagram).`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                mapType: { type: Type.STRING },
                title: { type: Type.STRING },
                centerConcept: { type: Type.STRING },
                nodes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      label: { type: Type.STRING },
                      note: { type: Type.STRING },
                      group: { type: Type.STRING },
                      relationLabel: { type: Type.STRING },
                    },
                    required: ['id', 'label', 'note', 'group', 'relationLabel'],
                  },
                },
              },
              required: ['mapType', 'title', 'centerConcept', 'nodes'],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({ ...parsed, mapType });
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Learn Before This (Prerequisite Builder)
  app.post('/api/prerequisites', async (req, res) => {
    try {
      const { topic = '', theGist = '' } = req.body as {
        topic?: string;
        theGist?: string;
      };
      if (!topic.trim()) {
        return res.status(400).json({ error: 'Topic is required.' });
      }
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\nSummary: ${theGist}\n\nIdentify 4 essential prerequisite concepts a learner should grasp BEFORE mastering ${topic}, ordered from foundational to immediate, each with a 2-sentence plain-English refresher.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                steps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      whyNeeded: { type: Type.STRING },
                      quickRefresher: { type: Type.STRING },
                    },
                    required: ['id', 'title', 'whyNeeded', 'quickRefresher'],
                  },
                },
              },
              required: ['steps'],
            },
          },
        })
      );
      return res.json(JSON.parse((response.text ?? '{"steps":[]}').trim()));
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Knowledge Web (Concept Explorer)
  app.post('/api/knowledge-web', async (req, res) => {
    try {
      const { topic = '', theGist = '' } = req.body as {
        topic?: string;
        theGist?: string;
      };
      if (!topic.trim()) {
        return res.status(400).json({ error: 'Topic is required.' });
      }
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\nSummary: ${theGist}\n\nGenerate 5 interconnected neighboring concepts forming a Knowledge Web around "${topic}" so the learner sees the big picture.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                centerTopic: { type: Type.STRING },
                branches: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      concept: { type: Type.STRING },
                      relationship: { type: Type.STRING },
                      whyConnected: { type: Type.STRING },
                    },
                    required: ['concept', 'relationship', 'whyConnected'],
                  },
                },
              },
              required: ['centerTopic', 'branches'],
            },
          },
        })
      );
      return res.json(JSON.parse((response.text ?? '{}').trim()));
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Real-World Connections ("Why Does This Matter?")
  app.post('/api/real-world', async (req, res) => {
    try {
      const { topic = '', theGist = '' } = req.body as {
        topic?: string;
        theGist?: string;
      };
      if (!topic.trim()) {
        return res.status(400).json({ error: 'Topic is required.' });
      }
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\nSummary: ${theGist}\n\nAnswer "Why Does This Matter?" vividly with everyday uses, real jobs that rely on it, real-world relevance, and industry examples.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                everydayApplications: { type: Type.ARRAY, items: { type: Type.STRING } },
                jobsUsingThis: { type: Type.ARRAY, items: { type: Type.STRING } },
                realWorldRelevance: { type: Type.STRING },
                industryExamples: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: [
                'everydayApplications',
                'jobsUsingThis',
                'realWorldRelevance',
                'industryExamples',
              ],
            },
          },
        })
      );
      return res.json(JSON.parse((response.text ?? '{}').trim()));
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Instant Flashcard Generator ("⚡ Generate Flashcards")
  app.post('/api/generate-flashcards', async (req, res) => {
    try {
      const { topic = '', theGist = '', madeSimple = [] } = req.body as {
        topic?: string;
        theGist?: string;
        madeSimple?: string[];
      };
      if (!topic.trim() && !theGist.trim()) {
        return res.status(400).json({ error: 'Topic summary is required.' });
      }
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\nSummary: ${theGist}\nDetails: ${madeSimple.join(' | ')}\n\nCreate 5 crisp Q&A flashcards ranging across Easy, Medium, and Hard with clear concept tags.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                flashcards: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      answer: { type: Type.STRING },
                      difficulty: {
                        type: Type.STRING,
                        description: 'Strictly one of: Easy, Medium, Hard',
                      },
                      conceptTag: { type: Type.STRING },
                    },
                    required: ['question', 'answer', 'difficulty', 'conceptTag'],
                  },
                },
              },
              required: ['flashcards'],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{"flashcards":[]}').trim());
      const now = new Date().toISOString();
      const cards = (parsed.flashcards ?? []).map(
        (c: { question: string; answer: string; difficulty: string; conceptTag: string }, idx: number) => ({
          id: `fc-${Date.now()}-${idx}`,
          question: c.question,
          answer: c.answer,
          difficulty:
            c.difficulty === 'Hard' || c.difficulty === 'Medium' ? c.difficulty : 'Easy',
          conceptTag: c.conceptTag || topic,
          topic,
          createdAt: now,
        })
      );
      return res.json({ flashcards: cards });
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Smart Quiz Mode ("🧠 Test Me")
  app.post('/api/smart-quiz', async (req, res) => {
    try {
      const { topic = '', theGist = '', madeSimple = [] } = req.body as {
        topic?: string;
        theGist?: string;
        madeSimple?: string[];
      };
      if (!topic.trim() && !theGist.trim()) {
        return res.status(400).json({ error: 'Topic summary is required.' });
      }
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\nSummary: ${theGist}\nPoints: ${madeSimple.join(' | ')}\n\nCreate 4 multiple-choice questions progressively ordered: 1 Easy, 2 Medium, 1 Challenge. Keep options concise, 4 choices each, with kind explanations.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      difficulty: {
                        type: Type.STRING,
                        description: 'Strictly one of: Easy, Medium, Challenge',
                      },
                      question: { type: Type.STRING },
                      options: { type: Type.ARRAY, items: { type: Type.STRING } },
                      correctIndex: { type: Type.INTEGER },
                      explanation: { type: Type.STRING },
                      conceptTag: { type: Type.STRING },
                    },
                    required: [
                      'id',
                      'difficulty',
                      'question',
                      'options',
                      'correctIndex',
                      'explanation',
                      'conceptTag',
                    ],
                  },
                },
              },
              required: ['topic', 'questions'],
            },
          },
        })
      );
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({ topic: parsed.topic || topic, questions: parsed.questions || [] });
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // One-Click Study Pack
  app.post('/api/study-pack', async (req, res) => {
    try {
      const { topic = '', theGist = '', madeSimple = [], extractedText = '' } = req.body as {
        topic?: string;
        theGist?: string;
        madeSimple?: string[];
        extractedText?: string;
      };
      if (!topic.trim() && !theGist.trim()) {
        return res.status(400).json({ error: 'Topic context is required.' });
      }
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\nSummary: ${theGist}\nPoints: ${madeSimple.join(' | ')}\nSource: ${extractedText.slice(0, 1200)}\n\nBuild a complete, calm, printable Study Pack with flashcards, quiz questions, revision sheet, common mistakes, key definitions, practice prompts, and a learning roadmap.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                summary: { type: Type.STRING },
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                flashcards: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      answer: { type: Type.STRING },
                      difficulty: { type: Type.STRING },
                      conceptTag: { type: Type.STRING },
                    },
                    required: ['question', 'answer', 'difficulty', 'conceptTag'],
                  },
                },
                quizQuestions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      difficulty: { type: Type.STRING },
                      question: { type: Type.STRING },
                      options: { type: Type.ARRAY, items: { type: Type.STRING } },
                      correctIndex: { type: Type.INTEGER },
                      explanation: { type: Type.STRING },
                      conceptTag: { type: Type.STRING },
                    },
                    required: [
                      'difficulty',
                      'question',
                      'options',
                      'correctIndex',
                      'explanation',
                      'conceptTag',
                    ],
                  },
                },
                revisionSheet: { type: Type.ARRAY, items: { type: Type.STRING } },
                commonMistakes: { type: Type.ARRAY, items: { type: Type.STRING } },
                importantDefinitions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      term: { type: Type.STRING },
                      plainMeaning: { type: Type.STRING },
                    },
                    required: ['term', 'plainMeaning'],
                  },
                },
                practiceQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                learningRoadmap: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: [
                'topic',
                'summary',
                'keyPoints',
                'flashcards',
                'quizQuestions',
                'revisionSheet',
                'commonMistakes',
                'importantDefinitions',
                'practiceQuestions',
                'learningRoadmap',
              ],
            },
          },
        })
      );
      return res.json(JSON.parse((response.text ?? '{}').trim()));
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Research Paper Decoder
  app.post('/api/research-decoder', async (req, res) => {
    try {
      const { topic = '', extractedText = '', theGist = '' } = req.body as {
        topic?: string;
        extractedText?: string;
        theGist?: string;
      };
      if (!topic.trim() && !extractedText.trim()) {
        return res.status(400).json({ error: 'Research text or topic is required.' });
      }
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic/Paper: ${topic}\nSummary: ${theGist}\nExtracted Text: ${extractedText.slice(0, 1800)}\n\nDecode this like a clear research paper breakdown: What was studied, Why it was studied, What was discovered, Why it matters, and Explain like I'm 15.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                titleGuess: { type: Type.STRING },
                whatWasStudied: { type: Type.STRING },
                whyItWasStudied: { type: Type.STRING },
                whatWasDiscovered: { type: Type.STRING },
                whyItMatters: { type: Type.STRING },
                explainLikeIm15: { type: Type.STRING },
              },
              required: [
                'titleGuess',
                'whatWasStudied',
                'whyItWasStudied',
                'whatWasDiscovered',
                'whyItMatters',
                'explainLikeIm15',
              ],
            },
          },
        })
      );
      return res.json(JSON.parse((response.text ?? '{}').trim()));
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Panic Mode ("🚨 Exam Tomorrow")
  app.post('/api/panic-mode', async (req, res) => {
    try {
      const { topic = '', theGist = '', madeSimple = [], examCheatcode = '' } = req.body as {
        topic?: string;
        theGist?: string;
        madeSimple?: string[];
        examCheatcode?: string;
      };
      if (!topic.trim() && !theGist.trim()) {
        return res.status(400).json({ error: 'Topic context is required.' });
      }
      const ai = getGeminiClient();
      const response = await generateWithResilience((model) =>
        ai.models.generateContent({
          model,
          contents: `Topic: ${topic}\nGist: ${theGist}\nKey points: ${madeSimple.join(' | ')}\nCheatcode: ${examCheatcode}\n\nThe learner clicked "🚨 Exam Tomorrow". Give them a calm, rapid high-yield survival kit: a 2-minute spoken summary, most important concepts, likely exam topics, quick revision bullets, and sticky memory tricks.`,
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                twoMinuteSummary: { type: Type.STRING },
                mostImportantConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                likelyExamTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                quickRevisionSheet: { type: Type.ARRAY, items: { type: Type.STRING } },
                memoryTricks: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: [
                'topic',
                'twoMinuteSummary',
                'mostImportantConcepts',
                'likelyExamTopics',
                'quickRevisionSheet',
                'memoryTricks',
              ],
            },
          },
        })
      );
      return res.json(JSON.parse((response.text ?? '{}').trim()));
    } catch (err) {
      const { status, message } = getErrorMessage(err);
      return res.status(status).json({ error: message });
    }
  });

  // Persistent Saved Learning Conversations API
  app.get('/api/conversations', (_req, res) => {
    const list = ensureConversationsStore();
    res.json({ conversations: list });
  });

  app.post('/api/conversations', (req, res) => {
    const incoming = req.body as VoiceConversation;
    if (!incoming?.id) {
      return res.status(400).json({ error: 'Conversation id is required.' });
    }
    const list = ensureConversationsStore();
    const updated = [incoming, ...list.filter((c) => c.id !== incoming.id)];
    saveConversationsStore(updated);
    res.json({ conversation: incoming, conversations: updated });
  });

  app.put('/api/conversations/:id', (req, res) => {
    const { id } = req.params;
    const incoming = req.body as VoiceConversation;
    const list = ensureConversationsStore();
    const exists = list.some((c) => c.id === id);
    const updated = exists
      ? list.map((c) => (c.id === id ? { ...c, ...incoming, id } : c))
      : [{ ...incoming, id }, ...list];
    saveConversationsStore(updated);
    res.json({ conversation: { ...incoming, id }, conversations: updated });
  });

  app.delete('/api/conversations/:id', (req, res) => {
    const { id } = req.params;
    const list = ensureConversationsStore();
    const updated = list.filter((c) => c.id !== id);
    saveConversationsStore(updated);
    res.json({ conversations: updated });
  });

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url || '';
    if (!reqUrl.startsWith('/api/live-voice')) {
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (clientWs) => {
    let session: Awaited<
      ReturnType<ReturnType<typeof getGeminiClient>['live']['connect']>
    > | null = null;
    let isClosing = false;

    const sendJson = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const closeAll = () => {
      if (isClosing) return;
      isClosing = true;
      try {
        session?.close();
      } catch {
        // ignore close error
      }
      session = null;
    };

    clientWs.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type?: string;
          data?: string;
          text?: string;
          voiceName?: string;
          brainMode?: BrainModeId;
          topicContext?: string;
          historySummary?: string;
        };

        if (msg.type === 'start') {
          if (session) return;
          const ai = getGeminiClient('v1beta');
          const allowedVoices = ['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir'];
          const chosenVoice = allowedVoices.includes(msg.voiceName || '')
            ? msg.voiceName!
            : 'Kore';
          const modeCfg = getBrainModeConfig(msg.brainMode || 'easy-read');

          const instructionParts = [
            `You are Simpli, a calm, friendly, neurodivergent-inclusive real-time voice learning tutor.`,
            `Active Brain Mode: ${modeCfg.label}. ${modeCfg.promptDirective}`,
            `Speak clearly and warmly in short, digestible spoken sentences (2 to 4 sentences per turn) and check in naturally so the learner never feels overwhelmed.`,
            msg.topicContext ? `Active Study Context:\n${msg.topicContext}` : '',
            msg.historySummary ? `Recent Conversation:\n${msg.historySummary}` : '',
          ].filter(Boolean);

          session = await ai.live.connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: chosenVoice },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: instructionParts.join('\n\n'),
            },
            callbacks: {
              onopen: () => {
                sendJson({ type: 'ready' });
              },
              onmessage: (message: LiveServerMessage) => {
                const content = message.serverContent;
                if (content?.inputTranscription?.text) {
                  sendJson({
                    type: 'inputTranscript',
                    text: content.inputTranscription.text,
                  });
                }
                if (content?.outputTranscription?.text) {
                  sendJson({
                    type: 'outputTranscript',
                    text: content.outputTranscription.text,
                  });
                }
                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    sendJson({
                      type: 'audio',
                      data: part.inlineData.data,
                    });
                  }
                }
                if (content?.interrupted) {
                  sendJson({ type: 'interrupted' });
                }
                if (content?.turnComplete) {
                  sendJson({ type: 'turnComplete' });
                }
              },
              onerror: (err: unknown) => {
                const eObj = err as { message?: string; error?: { message?: string } };
                const errMsg =
                  (err instanceof Error ? err.message : undefined) ||
                  eObj?.error?.message ||
                  eObj?.message ||
                  'Live voice session encountered an error.';
                sendJson({ type: 'error', message: String(errMsg) });
              },
              onclose: (ev: unknown) => {
                const cObj = ev as { code?: number; reason?: string };
                sendJson({
                  type: 'closed',
                  code: cObj?.code,
                  reason: cObj?.reason,
                });
              },
            },
          });
          return;
        }

        if (msg.type === 'audio' && msg.data && session) {
          session.sendRealtimeInput({
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          });
          return;
        }

        if (msg.type === 'text' && msg.text && session) {
          session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: msg.text }] }],
            turnComplete: true,
          });
          return;
        }

        if (msg.type === 'stop') {
          closeAll();
        }
      } catch (err) {
        const { message } = getErrorMessage(err);
        sendJson({ type: 'error', message });
      }
    });

    clientWs.on('close', closeAll);
    clientWs.on('error', closeAll);
  });

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Simpli server running at http://localhost:${PORT}`);
  });
}

startServer();
