import { clamp } from '../cohesion.js';
import { HERO_CONSTANTS } from './constants.js';

export function getLawValues(lawDef) {
  return lawDef.axis_vector || lawDef.values || {};
}

export function getHeroEmpireId(hero) {
  return hero.empireId || null;
}

export function ensureHeroMeters(hero) {
  if (!hero.meters) {
    hero.meters = { heat: 0, grievance: 0, popularity: 50 };
    return;
  }
  if (!Number.isFinite(hero.meters.heat)) hero.meters.heat = 0;
  if (!Number.isFinite(hero.meters.grievance)) hero.meters.grievance = 0;
  if (!Number.isFinite(hero.meters.popularity)) hero.meters.popularity = 50;
}

export function computeAlignmentScore(valuesA = {}, valuesB = {}) {
  const axes = new Set([...Object.keys(valuesA || {}), ...Object.keys(valuesB || {})]);
  if (axes.size === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  axes.forEach(axis => {
    const a = Number.isFinite(valuesA[axis]) ? valuesA[axis] : 0;
    const b = Number.isFinite(valuesB[axis]) ? valuesB[axis] : 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  });

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom <= 0) return 0;

  // Clamp to [-1, 1] in case of floating point drift.
  return clamp(dot / denom, -1, 1);
}

export function getPopularityCap(hero) {
  ensureHeroMeters(hero);
  const cap = 100 - (hero.meters.grievance * HERO_CONSTANTS.POPULARITY_CAP_FACTOR);
  return clamp(cap, 10, 100);
}

export function getPopularityScalar(hero) {
  ensureHeroMeters(hero);
  const cap = getPopularityCap(hero);
  const effectivePopularity = Math.min(hero.meters.popularity, cap);
  return clamp(0.3 + (effectivePopularity / 100) * 0.7, 0.3, 1.0);
}
