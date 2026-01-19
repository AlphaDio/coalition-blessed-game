/**
 * Coalition Coloration System
 * 
 * Calculates and tracks the Coalition's ideological "color" based on enacted laws.
 * The color is an aggregate of all axis_vector values from enacted laws, representing
 * the Coalition's ideological position on various axes.
 * 
 * Each axis ranges from -1 to 1:
 * - pacifist_militaristic: Peaceful (-1) <-> Warlike (+1)
 * - authoritarian_liberal: Control (-1) <-> Freedom (+1)
 * - stoicist_hedonistic: Sacrifice (-1) <-> Pleasure (+1)
 * - natural_mechanical: Organic (-1) <-> Synthetic (+1)
 * - essentialist_constructivist: Fixed identity (-1) <-> Malleable identity (+1)
 * - spiritual_materialistic: Transcendent (-1) <-> Pragmatic (+1)
 */

import { TIERED_LAW_DEFINITIONS } from './lawDefinitions.js';

/**
 * The axes used for Coalition coloration
 */
export const COALITION_AXES = [
  'pacifist_militaristic',
  'authoritarian_liberal',
  'stoicist_hedonistic',
  'natural_mechanical',
  'essentialist_constructivist',
  'spiritual_materialistic'
];

/**
 * Create a fresh coalition color object with all axes at 0
 * @returns {Object} Coalition color with all axes at neutral
 */
export function createCoalitionColor() {
  return {
    pacifist_militaristic: 0,
    authoritarian_liberal: 0,
    stoicist_hedonistic: 0,
    natural_mechanical: 0,
    essentialist_constructivist: 0,
    spiritual_materialistic: 0
  };
}

/**
 * Calculate the Coalition's color based on all enacted laws
 * Sums the axis_vector values from each enacted law and clamps to [-1, 1]
 * 
 * @param {Object} state - Game state with enactedLaws array
 * @returns {Object} Coalition color object with axis values
 */
export function calculateCoalitionColor(state) {
  const color = createCoalitionColor();
  const enactedLawIds = state.enactedLaws || [];
  
  if (enactedLawIds.length === 0) {
    return color;
  }
  
  // Sum axis vectors from all enacted laws
  enactedLawIds.forEach(lawId => {
    const lawDef = TIERED_LAW_DEFINITIONS.find(l => l.id === lawId);
    if (lawDef && lawDef.axis_vector) {
      COALITION_AXES.forEach(axis => {
        if (lawDef.axis_vector[axis] !== undefined) {
          color[axis] += lawDef.axis_vector[axis];
        }
      });
    }
  });
  
  // Clamp all values to [-1, 1] range
  COALITION_AXES.forEach(axis => {
    color[axis] = Math.max(-1, Math.min(1, color[axis]));
  });
  
  return color;
}

/**
 * Update the Coalition's color on the game state
 * Should be called whenever a law is enacted
 * 
 * @param {Object} state - Game state to update
 */
export function updateCoalitionColor(state) {
  state.coalitionColor = calculateCoalitionColor(state);
}

/**
 * Get the dominant axis of the Coalition (the axis with the highest absolute value)
 * 
 * @param {Object} coalitionColor - Coalition color object
 * @returns {Object} { axis: string, value: number, direction: 'positive' | 'negative' }
 */
export function getDominantAxis(coalitionColor) {
  if (!coalitionColor) {
    return { axis: null, value: 0, direction: 'neutral' };
  }
  
  let dominantAxis = null;
  let maxAbsValue = 0;
  
  COALITION_AXES.forEach(axis => {
    const absValue = Math.abs(coalitionColor[axis] || 0);
    if (absValue > maxAbsValue) {
      maxAbsValue = absValue;
      dominantAxis = axis;
    }
  });
  
  if (!dominantAxis || maxAbsValue === 0) {
    return { axis: null, value: 0, direction: 'neutral' };
  }
  
  const value = coalitionColor[dominantAxis];
  return {
    axis: dominantAxis,
    value,
    direction: value > 0 ? 'positive' : 'negative'
  };
}

/**
 * Get a human-readable description of the Coalition's ideological position
 * 
 * @param {Object} coalitionColor - Coalition color object
 * @returns {string} Description of the Coalition's character
 */
export function getCoalitionCharacterDescription(coalitionColor) {
  const dominant = getDominantAxis(coalitionColor);
  
  if (!dominant.axis || dominant.value === 0) {
    return 'Neutral - No clear ideological direction';
  }
  
  const axisDescriptions = {
    pacifist_militaristic: {
      negative: 'Pacifist',
      positive: 'Militaristic'
    },
    authoritarian_liberal: {
      negative: 'Authoritarian',
      positive: 'Liberal'
    },
    stoicist_hedonistic: {
      negative: 'Stoic',
      positive: 'Hedonistic'
    },
    natural_mechanical: {
      negative: 'Naturalist',
      positive: 'Mechanist'
    },
    essentialist_constructivist: {
      negative: 'Essentialist',
      positive: 'Constructivist'
    },
    spiritual_materialistic: {
      negative: 'Spiritual',
      positive: 'Materialistic'
    }
  };
  
  const desc = axisDescriptions[dominant.axis];
  const intensity = Math.abs(dominant.value);
  
  let intensityWord = '';
  if (intensity >= 0.7) {
    intensityWord = 'Strongly ';
  } else if (intensity >= 0.4) {
    intensityWord = 'Moderately ';
  } else if (intensity >= 0.2) {
    intensityWord = 'Slightly ';
  } else {
    intensityWord = 'Leaning ';
  }
  
  const directionDesc = dominant.direction === 'positive' ? desc.positive : desc.negative;
  
  return intensityWord + directionDesc;
}

/**
 * Get all significant axes (those with absolute value >= threshold)
 * 
 * @param {Object} coalitionColor - Coalition color object
 * @param {number} threshold - Minimum absolute value to consider significant (default 0.2)
 * @returns {Array} Array of { axis, value, direction } for significant axes
 */
export function getSignificantAxes(coalitionColor, threshold = 0.2) {
  if (!coalitionColor) {
    return [];
  }
  
  return COALITION_AXES
    .map(axis => ({
      axis,
      value: coalitionColor[axis] || 0,
      direction: (coalitionColor[axis] || 0) > 0 ? 'positive' : 'negative'
    }))
    .filter(entry => Math.abs(entry.value) >= threshold)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}
