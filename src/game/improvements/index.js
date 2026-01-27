/**
 * Improvements Module
 *
 * Main entry point for the improvements system
 */

// Export types and constants
export * from './types.js';

// Export definitions
export * from './definitions.js';

// Export core engine
export * from './engine.js';

// Export UI functions
export * from './ui.js';

// Legacy exports for backward compatibility
export { getImprovementStats } from './ui.js';
export { getSampleImprovementRequests, initializeImprovementSuggestions, acceptImprovementRequest, cancelImprovement, processImprovementsTick, applyImprovementModifiers } from './engine.js';
export { getTieredImprovementRequests, canStartImprovement, generateImprovementSuggestions, generateReplacementSuggestion, MAX_SUGGESTIONS_PER_EMPIRE } from './definitions.js';