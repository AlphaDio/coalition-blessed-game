import { EMPIRE_TEMPLATES, EXPEDITION_PLAN, EXPEDITION_RULES, EXPEDITION_STARTER_SUPPLIES } from './catalog.js';

export function createExpeditionsState() {
  return {
    version: 2, sequence: 0, active: [], empires: [], discoveries: [], history: [],
    lastProcessedTurn: null,
    catalog: { plans: [structuredClone(EXPEDITION_PLAN)] },
    occupationUnrestLimit: EXPEDITION_RULES.occupationUnrestLimit,
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
  if (!(expeditions.version >= 2)) {
    for (const minor of expeditions.empires) {
      // The old unrest value accumulated across paid turns and isn't a missed-payment streak.
      minor.occupationUnrest = 0;
      const template = EMPIRE_TEMPLATES.find(entry => entry.id === minor.id);
      if (minor.interest && template) minor.interest.description = template.interest.description;
    }
    expeditions.version = 2;
  }
  expeditions.catalog = { plans: [structuredClone(EXPEDITION_PLAN)] };
  expeditions.occupationUnrestLimit = EXPEDITION_RULES.occupationUnrestLimit;
  return expeditions;
}
