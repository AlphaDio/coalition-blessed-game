import { EXPEDITION_PLAN, DEVELOPMENT_PROJECTS, EXPEDITION_STARTER_SUPPLIES } from './catalog.js';

export function createExpeditionsState() {
  return {
    version: 1, sequence: 0, active: [], empires: [], discoveries: [], history: [],
    lastProcessedTurn: null,
    catalog: { plans: [structuredClone(EXPEDITION_PLAN)], projects: structuredClone(DEVELOPMENT_PROJECTS) },
    options: [], materialReserves: {}
  };
}

export function ensureExpeditionsState(state) {
  if (!state.expeditions || typeof state.expeditions !== 'object') {
    state.expeditions = createExpeditionsState();
    // Existing campaigns receive the same finite charter as new campaigns.
    // The presence of expedition state prevents repeated migration grants.
    state.stockpiles ||= {};
    for (const [key, amount] of Object.entries(EXPEDITION_STARTER_SUPPLIES)) {
      state.stockpiles[key] = (state.stockpiles[key] || 0) + amount;
    }
  }
  const expeditions = state.expeditions;
  for (const key of ['active', 'empires', 'discoveries', 'history']) {
    if (!Array.isArray(expeditions[key])) expeditions[key] = [];
  }
  if (!Number.isFinite(expeditions.sequence)) expeditions.sequence = 0;
  expeditions.catalog = { plans: [structuredClone(EXPEDITION_PLAN)], projects: structuredClone(DEVELOPMENT_PROJECTS) };
  return expeditions;
}
