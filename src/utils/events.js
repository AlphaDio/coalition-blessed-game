/**
 * Event utility functions
 */

/**
 * Get the display title of an event
 * Events may have title, name, or id properties
 * @param {Object} event - Event object
 * @returns {string} Event title for display
 */
export function getEventTitle(event) {
  if (!event) return 'Unknown Event';
  return event.title || event.name || event.id || 'Unknown Event';
}

/**
 * Check if an event has valid choices
 * @param {Object} event - Event object
 * @returns {boolean} True if event has at least one choice
 */
export function hasValidChoices(event) {
  return event?.choices && Array.isArray(event.choices) && event.choices.length > 0;
}
