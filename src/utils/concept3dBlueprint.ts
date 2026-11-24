import type { SimpliAnalysis } from '../types/simpli';
import { stripDisplayMarkdown } from './simpliLogic';

export type ConceptSceneArchetype = 'cycle' | 'mechanics' | 'architecture';

export interface ConceptScenePartSpec {
  id: string;
  label: string;
  detail: string;
  role: 'core' | 'satellite' | 'conduit';
  basePosition: [number, number, number];
  explodeOffset: [number, number, number];
  accentHex: number;
}

export interface ConceptSceneBlueprint {
  topic: string;
  archetype: ConceptSceneArchetype;
  archetypeTitle: string;
  primaryHex: number;
  secondaryHex: number;
  horizonHex: number;
  parts: ConceptScenePartSpec[];
}

export function classifyConceptArchetype(topic: string, text = ''): ConceptSceneArchetype {
  const combined = `${topic} ${text}`.toLowerCase();
  if (
    /\b(cell|chloroplast|photosynthesis|dna|molecule|atom|energy|cycle|biology|chem|mitochondria|ecosystem|heart|brain|neuron)\b/.test(
      combined
    )
  ) {
    return 'cycle';
  }
  if (
    /\b(calculus|derivative|integral|force|newton|physics|momentum|gravity|algebra|equation|supply|demand|market|gear|equilibrium|circuit|voltage)\b/.test(
      combined
    )
  ) {
    return 'mechanics';
  }
  return 'architecture';
}

export function buildConceptSceneBlueprint(analysis: SimpliAnalysis): ConceptSceneBlueprint {
  const archetype = classifyConceptArchetype(
    analysis.detectedTopic,
    `${analysis.theGist} ${analysis.madeSimple.join(' ')}`
  );

  const paletteByArchetype: Record<
    ConceptSceneArchetype,
    { title: string; primaryHex: number; secondaryHex: number; horizonHex: number }
  > = {
    cycle: {
      title: 'Orbital Cycle & Energy Flow',
      primaryHex: 0x10b981,
      secondaryHex: 0x3b82f6,
      horizonHex: 0xf4f7fb,
    },
    mechanics: {
      title: 'Equilibrium & Force Balance',
      primaryHex: 0x7c3aed,
      secondaryHex: 0x3b82f6,
      horizonHex: 0xf5f5fa,
    },
    architecture: {
      title: 'Concept Pillars & Causal Bridges',
      primaryHex: 0x3b82f6,
      secondaryHex: 0x7c3aed,
      horizonHex: 0xf4f6fb,
    },
  };

  const palette = paletteByArchetype[archetype];
  const points = (analysis.madeSimple.length > 0
    ? analysis.madeSimple
    : [analysis.theGist, analysis.examCheatcode, analysis.irlExample]
  )
    .map((p) => stripDisplayMarkdown(p))
    .filter(Boolean)
    .slice(0, 4);

  const parts: ConceptScenePartSpec[] = [
    {
      id: 'core-anchor',
      label: analysis.detectedTopic,
      detail: stripDisplayMarkdown(analysis.theGist),
      role: 'core',
      basePosition: [0, 0, 0],
      explodeOffset: [0, 0.85, 0],
      accentHex: palette.primaryHex,
    },
  ];

  const count = Math.max(2, points.length);
  const radius = 2.75;
  const satelliteColors = [0x3b82f6, 0x10b981, 0xf59e0b, 0x7c3aed];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 4;
    const x = Number((Math.cos(angle) * radius).toFixed(3));
    const z = Number((Math.sin(angle) * radius).toFixed(3));
    const y = archetype === 'cycle' ? Number((0.45 + (i % 2) * 0.35).toFixed(3)) : 0;
    const detail = points[i] ?? analysis.examCheatcode;
    const shortWords = detail.split(/\s+/).slice(0, 4).join(' ').replace(/[.,;:!?]+$/, '');

    parts.push({
      id: `sat-${i}`,
      label: shortWords || `Part ${i + 1}`,
      detail,
      role: 'satellite',
      basePosition: [x, y, z],
      explodeOffset: [Number((x * 0.52).toFixed(3)), 0.45 + i * 0.14, Number((z * 0.52).toFixed(3))],
      accentHex: satelliteColors[i % satelliteColors.length],
    });
  }

  return {
    topic: analysis.detectedTopic,
    archetype,
    archetypeTitle: palette.title,
    primaryHex: palette.primaryHex,
    secondaryHex: palette.secondaryHex,
    horizonHex: palette.horizonHex,
    parts,
  };
}
