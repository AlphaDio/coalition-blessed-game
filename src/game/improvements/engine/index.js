export { createImprovementRequest, createImprovement } from './core.js';
export {
  initializeImprovementsState,
  getSampleImprovementRequests,
  initializeImprovementSuggestions,
  removeExpiredSuggestions,
  SUGGESTION_MAX_DURATION
} from './state.js';
export { acceptImprovementRequest, cancelImprovement } from './lifecycle.js';
export { processImprovementsTick } from './tick.js';
export { processImprovementSustainment } from './sustainment.js';
export { processImprovementProduction, releaseProductionFromBank } from './production.js';
export { applyImprovementModifiers } from './modifiers.js';
