// Technology system - accrual, selection, and granting logic
import { TECH_CONSTANTS } from './constants.js';
import { GENERAL_TECHS, ALIGNED_TECHS, UNIQUE_TECHS, TECH_BY_ID } from './technologyDefinitions.js';
import { getLogger } from '../modules/logger.js';

/**
 * Calculate effective research speed for an empire
 * Base is 1.0, modified by improvements and tech modifiers
 * @param {Object} empire - Empire object
 * @param {Object} state - Game state (for improvement modifiers)
 * @returns {number} Effective research speed multiplier
 */
export function getResearchSpeed(empire, state) {
  let speed = TECH_CONSTANTS.BASE_RESEARCH_SPEED;
  
  // Add improvement modifiers (research_speed from active improvements)
  if (state.improvements?.empireModifiers?.[empire.id]?.research_speed) {
    speed += state.improvements.empireModifiers[empire.id].research_speed;
  }
  
  // Add tech modifiers
  if (empire.techModifiers?.research_speed) {
    speed += empire.techModifiers.research_speed;
  }
  
  // Add empire base tech rate bonus as percentage of base tick
  // Instead of multiplying, add a percentage of the base research speed
  if (empire.stats?.tech_rate_bonus) {
    speed += TECH_CONSTANTS.BASE_RESEARCH_SPEED * empire.stats.tech_rate_bonus;
  }

  // Add permanent research speed bonus from consumption
  if (empire.stats?.researchSpeedBonus) {
    speed += empire.stats.researchSpeedBonus;
  }

  return Math.max(0.1, speed); // Minimum 10% research speed
}

/**
 * Calculate tech points gained this tick for an empire
 * @param {Object} empire - Empire object
 * @param {Object} state - Game state
 * @returns {number} Tech points to add
 */
export function calculateTechPointsPerTick(empire, state) {
  const researchSpeed = getResearchSpeed(empire, state);
  return Math.floor(TECH_CONSTANTS.BASE_POINTS_PER_TICK * researchSpeed);
}

/**
 * Check if a technology is available to an empire
 * @param {Object} tech - Technology definition
 * @param {Object} empire - Empire object
 * @returns {boolean} Whether empire can unlock this tech
 */
export function isTechAvailable(tech, empire) {
  // Already unlocked?
  if (empire.technologies.includes(tech.id)) {
    return false;
  }
  
  // Check axis alignment requirements
  if (tech.requirements.axis) {
    const { axis, direction, threshold } = tech.requirements.axis;
    const empireValue = empire.values?.[axis] || 0;
    
    // direction 1 means positive alignment required, -1 means negative
    if (direction > 0 && empireValue < threshold) {
      return false;
    }
    if (direction < 0 && empireValue > -threshold) {
      return false;
    }
  }
  
  // Check tag requirements
  if (tech.requirements.tags && tech.requirements.tags.length > 0) {
    const empireTags = empire.tags || [];
    const hasRequiredTag = tech.requirements.tags.some(tag => empireTags.includes(tag));
    if (!hasRequiredTag) {
      return false;
    }
  }
  
  // Check prerequisite techs
  if (tech.requirements.techs && tech.requirements.techs.length > 0) {
    const hasAllPrereqs = tech.requirements.techs.every(prereqId => 
      empire.technologies.includes(prereqId)
    );
    if (!hasAllPrereqs) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get all available technologies for an empire
 * @param {Object} empire - Empire object
 * @returns {Array} Array of available technology definitions
 */
export function getAvailableTechs(empire) {
  const allTechs = [...GENERAL_TECHS, ...ALIGNED_TECHS, ...UNIQUE_TECHS];
  return allTechs.filter(tech => isTechAvailable(tech, empire));
}

/**
 * Select N random techs from available pool for event choices
 * @param {Object} empire - Empire object
 * @param {number} count - Number of choices to offer
 * @param {Function} rng - Random number generator function
 * @returns {Array} Array of selected technology definitions
 */
export function selectTechChoices(empire, count = TECH_CONSTANTS.TECH_CHOICES_COUNT, rng = Math.random) {
  const available = getAvailableTechs(empire);
  
  if (available.length <= count) {
    return available;
  }
  
  // Weighted selection: prefer aligned/unique techs that match empire
  const weighted = available.map(tech => {
    let weight = 1;
    if (tech.category === 'aligned') weight = 1.5;
    if (tech.category === 'unique') weight = 2;
    return { tech, weight };
  });
  
  const selected = [];
  const remaining = [...weighted];
  
  while (selected.length < count && remaining.length > 0) {
    const totalWeight = remaining.reduce((sum, item) => sum + item.weight, 0);
    let roll = rng() * totalWeight;
    
    for (let i = 0; i < remaining.length; i++) {
      roll -= remaining[i].weight;
      if (roll <= 0) {
        selected.push(remaining[i].tech);
        remaining.splice(i, 1);
        break;
      }
    }
  }
  
  return selected;
}

/**
 * Grant a technology to an empire
 * Applies immediate effects and adds modifiers
 * @param {Object} empire - Empire object
 * @param {string} techId - Technology ID to grant
 * @param {Object} state - Game state (for cohesion effects)
 * @returns {Object} Summary of effects applied
 */
export function grantTechnology(empire, techId, state) {
  const tech = TECH_BY_ID[techId];
  if (!tech) {
    return { success: false, error: 'Unknown technology' };
  }
  
  if (empire.technologies.includes(techId)) {
    return { success: false, error: 'Technology already unlocked' };
  }
  
  // Add to unlocked techs
  empire.technologies.push(techId);
  
  // Apply immediate effects
  const effects = tech.immediateEffects;
  const appliedEffects = {};
  
  if (effects.approval) {
    empire.approval = Math.min(100, Math.max(0, empire.approval + effects.approval));
    appliedEffects.approval = effects.approval;
  }
  
  if (effects.stability) {
    empire.stability = Math.min(100, Math.max(0, empire.stability + effects.stability));
    appliedEffects.stability = effects.stability;
  }
  
  if (effects.credits) {
    empire.budget_credits += effects.credits;
    appliedEffects.credits = effects.credits;
  }
  
  if (effects.cohesion) {
    state.coalitionCohesion = Math.min(100, Math.max(0, state.coalitionCohesion + effects.cohesion));
    appliedEffects.cohesion = effects.cohesion;
  }
  
  // Aggregate tech modifiers
  empire.techModifiers = empire.techModifiers || {};
  for (const [key, value] of Object.entries(tech.modifiers)) {
    if (value !== 0) {
      empire.techModifiers[key] = (empire.techModifiers[key] || 0) + value;
    }
  }
  
  // Update threshold for next tech using polynomial curve: initial * (n+1)^exponent
  // n = number of techs after this one is added
  const techCount = empire.technologies.length; // Already includes the new tech
  empire.techThreshold = Math.floor(
    TECH_CONSTANTS.INITIAL_THRESHOLD * Math.pow(techCount + 1, TECH_CONSTANTS.THRESHOLD_EXPONENT)
  );
  
  // Reset tech points (optionally keep overflow)
  empire.techPoints = 0;
  
  return {
    success: true,
    techId,
    techName: tech.name,
    immediateEffects: appliedEffects,
    modifiers: tech.modifiers,
    nextThreshold: empire.techThreshold
  };
}

/**
 * Process tech point accrual for all empires
 * Returns list of empires that reached threshold
 * @param {Object} state - Game state
 * @returns {Array} Array of empire IDs that reached tech threshold
 */
export function processTechAccrual(state) {
  const thresholdReached = [];
  
  for (const empire of state.empires) {
    // Initialize tech fields if missing (for existing empires)
    if (empire.techPoints === undefined) empire.techPoints = 0;
    if (empire.techThreshold === undefined) empire.techThreshold = TECH_CONSTANTS.INITIAL_THRESHOLD;
    if (!empire.technologies) empire.technologies = [];
    if (!empire.techModifiers) empire.techModifiers = {};
    
    const pointsGained = calculateTechPointsPerTick(empire, state);
    empire.techPoints += pointsGained;
    
    if (empire.techPoints >= empire.techThreshold) {
      thresholdReached.push(empire.id);
    }
  }
  
  return thresholdReached;
}

// ============================================
// TECH EVENT TEMPLATES
// ============================================

const TECH_EVENT_TEMPLATES = [
  {
    id: 'tech_breakthrough',
    title: 'Research Breakthrough',
    textTemplate: 'Scientists in {empireName} have achieved a major breakthrough! Choose which technology to develop:'
  },
  {
    id: 'tech_convergence',
    title: 'Technology Choice',
    textTemplate: '{empireName} must choose which technology to prioritize for immediate development:'
  },
  {
    id: 'tech_opportunity',
    title: 'Innovation Opportunity',
    textTemplate: 'A unique research opportunity has emerged for {empireName}. Select the most promising direction:'
  }
];

/**
 * Format modifier value for display
 * @param {string} key - Modifier key
 * @param {number} value - Modifier value
 * @returns {string} Formatted string
 */
function formatModifier(key, value) {
  const sign = value > 0 ? '+' : '';
  
  // Percentage modifiers
  const percentageModifiers = [
    'research_speed', 'industrial_output', 'supply_efficiency', 
    'market_efficiency', 'population_growth', 'energy_production'
  ];
  
  if (percentageModifiers.includes(key)) {
    return `${sign}${(value * 100).toFixed(0)}% ${key.replace(/_/g, ' ')}`;
  }
  
  // Flat modifiers
  return `${sign}${value} ${key.replace(/_/g, ' ')}`;
}

/**
 * Generate a tech choice for an event
 * @param {Object} tech - Technology definition
 * @returns {Object} Event choice object
 */
function generateTechChoice(tech) {
  // Create a helpful description based on the technology's main benefits
  let description = tech.description || tech.name;

  // Add hints about major benefits
  const hints = [];
  const modifiers = tech.modifiers || {};

  if (modifiers.army_organization && modifiers.army_organization > 8) {
    hints.push('Strong military boost');
  } else if (modifiers.army_organization && modifiers.army_organization > 3) {
    hints.push('Military enhancement');
  }

  if (modifiers.industrial_output && modifiers.industrial_output > 0.12) {
    hints.push('Major production increase');
  } else if (modifiers.industrial_output && modifiers.industrial_output > 0.04) {
    hints.push('Production boost');
  }

  if (modifiers.research_speed && modifiers.research_speed > 0.12) {
    hints.push('Accelerated research');
  } else if (modifiers.research_speed && modifiers.research_speed > 0.04) {
    hints.push('Research enhancement');
  }

  if (modifiers.population_growth && modifiers.population_growth > 0.03) {
    hints.push('Rapid population growth');
  } else if (modifiers.population_growth && modifiers.population_growth > 0.01) {
    hints.push('Population increase');
  }

  if (modifiers.trade_income && modifiers.trade_income > 100) {
    hints.push('Major trade benefits');
  } else if (modifiers.trade_income && modifiers.trade_income > 25) {
    hints.push('Trade income');
  }

  if (modifiers.empire_approval && modifiers.empire_approval > 5) {
    hints.push('High approval boost');
  } else if (modifiers.empire_approval && modifiers.empire_approval > 2) {
    hints.push('Approval increase');
  }

  // Build effect description from modifiers
  const modifierStrings = Object.entries(tech.modifiers)
    .filter(([_, value]) => value !== 0)
    .map(([key, value]) => formatModifier(key, value));

  const immediateStrings = Object.entries(tech.immediateEffects)
    .filter(([_, value]) => value !== 0)
    .map(([key, value]) => {
      const sign = value > 0 ? '+' : '';
      return `${sign}${value} ${key}`;
    });

  let effectText = [...immediateStrings, ...modifierStrings].join(', ') || 'No direct effects';

  // Combine description with hints and effects
  let choiceText = tech.name;
  if (hints.length > 0) {
    choiceText += ` (${hints.join(', ')})`;
  }

  return {
    text: choiceText,
    effects: {
      // Tech granting is handled specially by handleTechEventChoice
      _grantTech: tech.id
    },
    tooltip: effectText
  };
}

/**
 * Create a tech event for an empire that reached threshold
 * @param {Object} empire - Empire that reached tech threshold
 * @param {Object} state - Game state
 * @param {Function} rng - Random number generator
 * @returns {Object|null} Tech event or null if no techs available
 */
export function createTechEvent(empire, state, rng = Math.random) {
  const techChoices = selectTechChoices(empire, TECH_CONSTANTS.TECH_CHOICES_COUNT, rng);
  
  if (techChoices.length === 0) {
    // No techs available - just reset points and increase threshold using polynomial curve
    empire.techPoints = 0;
    const techCount = empire.technologies?.length || 0;
    empire.techThreshold = Math.floor(
      TECH_CONSTANTS.INITIAL_THRESHOLD * Math.pow(techCount + 1, TECH_CONSTANTS.THRESHOLD_EXPONENT)
    );
    return null;
  }
  
  // Select a random template
  const template = TECH_EVENT_TEMPLATES[Math.floor(rng() * TECH_EVENT_TEMPLATES.length)];
  
  const event = {
    id: `${template.id}_${empire.id}_${state.turn}`,
    title: `${template.title} - ${empire.name}`,
    text: template.textTemplate.replace('{empireName}', empire.name),
    scope: 'TECH',
    empireId: empire.id,
    choices: techChoices.map(tech => generateTechChoice(tech))
  };
  
  return event;
}

/**
 * Handle a tech event choice - grants the selected technology
 * @param {Object} state - Game state
 * @param {Object} event - The tech event
 * @param {number} choiceIndex - Selected choice index
 * @returns {Object} Result with success flag and log
 */
export function handleTechEventChoice(state, event, choiceIndex) {
  const log = [];
  
  if (!event || event.scope !== 'TECH') {
    return { success: false, error: 'Not a tech event', log };
  }
  
  if (choiceIndex < 0 || choiceIndex >= event.choices.length) {
    return { success: false, error: 'Invalid choice index', log };
  }
  
  const empire = state.empires.find(e => e.id === event.empireId);
  if (!empire) {
    return { success: false, error: 'Empire not found', log };
  }
  
  const choice = event.choices[choiceIndex];
  const techId = choice.effects?._grantTech;
  
  if (!techId) {
    return { success: false, error: 'No tech ID in choice', log };
  }
  
  const result = grantTechnology(empire, techId, state);
  
  if (result.success) {
    log.push(`${empire.name} unlocked technology: ${result.techName}`);
    
    // Log immediate effects
    if (Object.keys(result.immediateEffects).length > 0) {
      const effectStrings = Object.entries(result.immediateEffects)
        .map(([key, value]) => `${key} ${value > 0 ? '+' : ''}${value}`)
        .join(', ');
      log.push(`Immediate effects: ${effectStrings}`);
    }
  } else {
    log.push(`Failed to grant technology: ${result.error}`);
  }
  
  // Clear the tech event
  state.activeEvent = null;
  
  // Log tech choice effects at info level
  const logger = getLogger();
  log.forEach(entry => logger.info(entry));
  
  return { success: result.success, log };
}
