import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AutoFlashcard,
  BrainModeId,
  ConfidenceLogEntry,
  SavedClarifySession,
  VoiceConversation,
} from '../types/simpli';

// Validation Synchronicity constants matching firebase-blueprint.json & firestore.rules
export const BLUEPRINT_LIMITS = {
  id: 128,
  displayName: 120,
  email: 254,
  photoURL: 500,
  topic: 200,
  theGist: 2000,
  madeSimpleMaxItems: 10,
  madeSimpleItem: 600,
  examCheatcode: 1500,
  irlExample: 1500,
  extractedText: 4000,
  question: 600,
  answer: 1200,
  conceptTag: 120,
  title: 200,
  summaryText: 2000,
  timestamp: 64,
} as const;

export function sanitizeDocId(rawId: string, prefix = 'item'): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, BLUEPRINT_LIMITS.id);
  if (!cleaned) return `${prefix}-${Date.now()}`;
  return cleaned;
}

function truncateStr(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const s = (val ?? fallback).trim();
  if (!s) return fallback;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const displayName = truncateStr(user.displayName, BLUEPRINT_LIMITS.displayName, 'Simpli Learner');
  const email = truncateStr(user.email, BLUEPRINT_LIMITS.email, '');
  const photoURL = truncateStr(user.photoURL, BLUEPRINT_LIMITS.photoURL, '');

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName,
        email,
        photoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName,
        email,
        photoURL,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncClarifySessionToCloud(
  uid: string,
  session: SavedClarifySession
): Promise<void> {
  const id = sanitizeDocId(session.id, 'clarify');
  const path = `users/${uid}/clarifySessions/${id}`;
  const ref = doc(db, 'users', uid, 'clarifySessions', id);
  const madeSimple = session.analysis.madeSimple
    .slice(0, BLUEPRINT_LIMITS.madeSimpleMaxItems)
    .map((p) => truncateStr(p, BLUEPRINT_LIMITS.madeSimpleItem))
    .filter(Boolean);

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        id,
        ownerId: uid,
        detectedTopic: truncateStr(session.analysis.detectedTopic, BLUEPRINT_LIMITS.topic, 'Study Topic'),
        brainMode: session.analysis.brainMode,
        theGist: truncateStr(session.analysis.theGist, BLUEPRINT_LIMITS.theGist),
        madeSimple,
        examCheatcode: truncateStr(session.analysis.examCheatcode, BLUEPRINT_LIMITS.examCheatcode),
        irlExample: truncateStr(session.analysis.irlExample, BLUEPRINT_LIMITS.irlExample),
        extractedText: truncateStr(session.analysis.extractedText, BLUEPRINT_LIMITS.extractedText),
        clientCreatedAt: truncateStr(session.createdAt, BLUEPRINT_LIMITS.timestamp, new Date().toISOString()),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        detectedTopic: truncateStr(session.analysis.detectedTopic, BLUEPRINT_LIMITS.topic, 'Study Topic'),
        brainMode: session.analysis.brainMode,
        theGist: truncateStr(session.analysis.theGist, BLUEPRINT_LIMITS.theGist),
        madeSimple,
        examCheatcode: truncateStr(session.analysis.examCheatcode, BLUEPRINT_LIMITS.examCheatcode),
        irlExample: truncateStr(session.analysis.irlExample, BLUEPRINT_LIMITS.irlExample),
        extractedText: truncateStr(session.analysis.extractedText, BLUEPRINT_LIMITS.extractedText),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncFlashcardsToCloud(
  uid: string,
  cards: AutoFlashcard[]
): Promise<void> {
  for (const card of cards.slice(0, 25)) {
    const id = sanitizeDocId(card.id, 'fc');
    const path = `users/${uid}/flashcards/${id}`;
    const ref = doc(db, 'users', uid, 'flashcards', id);
    const difficulty =
      card.difficulty === 'Easy' || card.difficulty === 'Hard' ? card.difficulty : 'Medium';

    try {
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        await setDoc(ref, {
          id,
          ownerId: uid,
          question: truncateStr(card.question, BLUEPRINT_LIMITS.question, 'Concept Question'),
          answer: truncateStr(card.answer, BLUEPRINT_LIMITS.answer, 'Core Explanation'),
          difficulty,
          conceptTag: truncateStr(card.conceptTag, BLUEPRINT_LIMITS.conceptTag, 'Concept'),
          topic: truncateStr(card.topic, BLUEPRINT_LIMITS.topic, 'General'),
          clientCreatedAt: truncateStr(card.createdAt, BLUEPRINT_LIMITS.timestamp, new Date().toISOString()),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function syncConfidenceLogToCloud(
  uid: string,
  entry: ConfidenceLogEntry
): Promise<void> {
  const id = sanitizeDocId(entry.id, 'conf');
  const path = `users/${uid}/confidenceLogs/${id}`;
  const ref = doc(db, 'users', uid, 'confidenceLogs', id);

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        id,
        ownerId: uid,
        topic: truncateStr(entry.topic, BLUEPRINT_LIMITS.topic, 'General Topic'),
        level: entry.level,
        difficulty: entry.difficulty,
        clientTimestamp: truncateStr(entry.timestamp, BLUEPRINT_LIMITS.timestamp, new Date().toISOString()),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncVoiceSessionToCloud(
  uid: string,
  conv: VoiceConversation
): Promise<void> {
  const id = sanitizeDocId(conv.id, 'voice');
  const path = `users/${uid}/voiceSessions/${id}`;
  const ref = doc(db, 'users', uid, 'voiceSessions', id);
  const lastAssistant = conv.turns.filter((t) => t.role === 'assistant').slice(-1)[0]?.text ?? '';

  try {
    const existing = await getDoc(ref);
    const payload = {
      title: truncateStr(conv.title, BLUEPRINT_LIMITS.title, 'Voice Session'),
      topicTag: truncateStr(conv.topicTag, BLUEPRINT_LIMITS.topic, 'General Study'),
      brainMode: conv.brainMode,
      turnsCount: Math.max(0, Math.min(500, Math.floor(conv.turns.length))),
      summaryText: truncateStr(lastAssistant, BLUEPRINT_LIMITS.summaryText),
      clientUpdatedAt: truncateStr(conv.updatedAt, BLUEPRINT_LIMITS.timestamp, new Date().toISOString()),
      updatedAt: serverTimestamp(),
    };

    if (!existing.exists()) {
      await setDoc(ref, {
        id,
        ownerId: uid,
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadCloudStudyState(uid: string): Promise<{
  clarifySessions: SavedClarifySession[];
  flashcards: AutoFlashcard[];
  confidenceLogs: ConfidenceLogEntry[];
}> {
  const clarifyPath = `users/${uid}/clarifySessions`;
  const flashcardsPath = `users/${uid}/flashcards`;
  const logsPath = `users/${uid}/confidenceLogs`;

  const clarifySessions: SavedClarifySession[] = [];
  const flashcards: AutoFlashcard[] = [];
  const confidenceLogs: ConfidenceLogEntry[] = [];

  try {
    const qClarify = query(collection(db, clarifyPath), where('ownerId', '==', uid));
    const snap = await getDocs(qClarify);
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      clarifySessions.push({
        id: String(d.id || docSnap.id),
        createdAt: String(d.clientCreatedAt || new Date().toISOString()),
        analysis: {
          detectedTopic: String(d.detectedTopic || 'Study Topic'),
          brainMode: (d.brainMode as BrainModeId) || 'adhd-turbo',
          theGist: String(d.theGist || ''),
          madeSimple: Array.isArray(d.madeSimple) ? d.madeSimple.map(String) : [],
          examCheatcode: String(d.examCheatcode || ''),
          irlExample: String(d.irlExample || ''),
          extractedText: String(d.extractedText || ''),
          suggestedQuestions: [],
        },
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, clarifyPath);
  }

  try {
    const qCards = query(collection(db, flashcardsPath), where('ownerId', '==', uid));
    const snap = await getDocs(qCards);
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      flashcards.push({
        id: String(d.id || docSnap.id),
        question: String(d.question || ''),
        answer: String(d.answer || ''),
        difficulty: (d.difficulty as AutoFlashcard['difficulty']) || 'Medium',
        conceptTag: String(d.conceptTag || ''),
        topic: String(d.topic || ''),
        createdAt: String(d.clientCreatedAt || new Date().toISOString()),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, flashcardsPath);
  }

  try {
    const qLogs = query(collection(db, logsPath), where('ownerId', '==', uid));
    const snap = await getDocs(qLogs);
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      confidenceLogs.push({
        id: String(d.id || docSnap.id),
        topic: String(d.topic || ''),
        level: d.level as ConfidenceLogEntry['level'],
        difficulty: d.difficulty as ConfidenceLogEntry['difficulty'],
        timestamp: String(d.clientTimestamp || new Date().toISOString()),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, logsPath);
  }

  return { clarifySessions, flashcards, confidenceLogs };
}
