import { IMPROVEMENTS_CONSTANTS } from '../../constants.js';
import { createArmy } from '../../types.js';
import { empireHasTag } from '../../../utils/tags.js';
import {
  MODIFIER_ARMY_ORG_SCALE,
  MODIFIER_EMPIRE_APPROVAL_SCALE,
  POPULATION_GROWTH_SCALE,
  BIOLOGIC_TAG,
  BIOLOGIC_GROWTH_BONUS_MULTIPLIER,
  improvementHasTag
} from '../types.js';

/**
 * Apply improvement modifiers to game state
 */
export function applyImprovementModifiers(state) {
  const improvements = state.improvements;

  // Reset per-empire improvement modifiers each tick
  if (!improvements.empireModifiers) {
    improvements.empireModifiers = {};
  } else {
    improvements.empireModifiers = {};
  }

  // Collect all active improvement modifiers
  const activeImprovements = improvements.queue.filter(i => i.state === 'ACTIVE');

  // Apply modifiers to empires
  activeImprovements.forEach(improvement => {
    const empire = state.empires.find(e => e.id === improvement.empireId);
    if (!empire) return;

    if (!improvements.empireModifiers[empire.id]) {
      improvements.empireModifiers[empire.id] = {};
    }

    // Apply stat modifiers
    for (const [stat, value] of Object.entries(improvement.modifiers)) {
      if (stat === 'army_organization') {
        // Apply to all armies of this empire (small boost per tick)
        state.armies
          .filter(a => a.empireId === improvement.empireId)
          .forEach(army => {
            army.organization = Math.min(100, army.organization + value / MODIFIER_ARMY_ORG_SCALE);
          });
      } else if (stat === 'empire_approval') {
        // Very small boost per tick
        empire.approval = Math.min(100, Math.max(0, empire.approval + value / MODIFIER_EMPIRE_APPROVAL_SCALE));
      } else if (stat === 'trade_income') {
        // Generate credits
        empire.budget_credits = (empire.budget_credits || 0) + value;
      } else if (stat === 'population_growth') {
        const baseGrowth = value / POPULATION_GROWTH_SCALE;
        const biologicBoost = improvementHasTag(improvement, BIOLOGIC_TAG) && empireHasTag(empire, BIOLOGIC_TAG)
          ? BIOLOGIC_GROWTH_BONUS_MULTIPLIER
          : 1;
        const growthRate = baseGrowth * biologicBoost;
        if (growthRate !== 0) {
          const currentPopulation = Number.isFinite(empire.stats.population) ? empire.stats.population : 1;
          // Ensure population never goes below 1 to prevent division by zero and game breaks
          empire.stats.population = Math.max(1, Math.floor(currentPopulation * (1 + growthRate)));
        }
      } else if (stat === 'army_fervor') {
        // Apply fervor bonus to all armies of this empire (gradual boost per tick)
        state.armies
          .filter(a => a.empireId === improvement.empireId)
          .forEach(army => {
            army.fervor = Math.min(100, army.fervor + value / MODIFIER_ARMY_ORG_SCALE);
          });
      } else if (stat === 'law_progress_speed') {
        // Store for use in law processing - accumulates to coalitionModifiers
        if (!state.coalitionModifiers.law_progress_speed) {
          state.coalitionModifiers.law_progress_speed = 0;
        }
        state.coalitionModifiers.law_progress_speed += value;
      } else if (stat === 'improvement_queue_capacity') {
        // Increase coalition improvement queue capacity
        if (!state.improvements.maxTotalCapacity) {
          state.improvements.maxTotalCapacity = IMPROVEMENTS_CONSTANTS.INITIAL_MAX_TOTAL_CAPACITY;
        }
        state.improvements.maxTotalCapacity += value;
      } else if (stat === 'hero_siphon_efficiency_mult' || stat === 'hero_siphon_efficiency_add') {
        // Store per-empire modifiers for hero siphon efficiency (applied in hero budget siphon)
        improvements.empireModifiers[empire.id][stat] =
          (improvements.empireModifiers[empire.id][stat] || 0) + value;
      } else if (stat === 'supply_efficiency') {
        // Reduces this empire's (and its armies') consumption; applied in ordersPhase via getEmpireSupplyEfficiency.
        improvements.empireModifiers[empire.id][stat] =
          (improvements.empireModifiers[empire.id][stat] || 0) + value;
      }
      // Other modifiers can be stored and applied elsewhere as needed
    }
  });

  return { success: true };
}

/**
 * Grant army/manpower from improvement completion
 * armyGrant creates a new army with specified manpower (if empire has no army)
 * manpowerGrant adds manpower to existing army
 */
export function grantImprovementUnits(state, improvement) {
  const log = [];
  const empire = state.empires.find(e => e.id === improvement.empireId);
  if (!empire) {
    return log;
  }

  // Handle armyGrant - creates a new army with specified manpower
  if (improvement.armyGrant && improvement.armyGrant.manpower > 0) {
    if (!state.armies) {
      state.armies = [];
    }

    const armyId = `army_${empire.id}`;
    const existingArmy = state.armies.find(a => a.empireId === empire.id && !a.id.startsWith('_'));

    if (!existingArmy) {
      // Create new army with specified manpower
      const newArmy = createArmy(
        armyId,
        empire.id,
        `${empire.name} Expeditionary Force`,
        55,  // fervor
        60,  // organization
        0,   // aggravation
        50,  // command
        50,  // recovery
        improvement.armyGrant.manpower
      );

      state.armies.push(newArmy);
      log.push(`{green-fg}Army raised:{/green-fg} ${newArmy.name} with ${improvement.armyGrant.manpower} manpower`);
    } else {
      // Empire already has an army - add manpower to it instead
      const manpowerToAdd = improvement.armyGrant.manpower;
      existingArmy.manpower += manpowerToAdd;
      existingArmy.mp.max += manpowerToAdd;
      existingArmy.mp.current += manpowerToAdd;
      log.push(`{green-fg}Reinforced:{/green-fg} ${existingArmy.name} +${manpowerToAdd} manpower`);
    }

    return log;
  }

  // Handle manpowerGrant - adds manpower to existing army
  if (improvement.manpowerGrant && improvement.manpowerGrant > 0) {
    if (!state.armies) {
      state.armies = [];
    }

    // Find the empire's army
    let targetArmy = state.armies.find(a => a.empireId === empire.id && !a.id.startsWith('_'));

    if (!targetArmy) {
      // Create a new army for this empire
      const armyId = `army_${empire.id}`;
      targetArmy = createArmy(
        armyId,
        empire.id,
        `${empire.name} Expeditionary Force`,
        55,  // fervor
        60,  // organization
        0,   // aggravation
        50,  // command
        50,  // recovery
        improvement.manpowerGrant
      );
      state.armies.push(targetArmy);
      log.push(`{green-fg}Army raised:{/green-fg} ${targetArmy.name} with ${improvement.manpowerGrant} manpower`);
    } else {
      // Add manpower to existing army
      targetArmy.manpower += improvement.manpowerGrant;
      targetArmy.mp.max += improvement.manpowerGrant;
      targetArmy.mp.current += improvement.manpowerGrant;
      log.push(`{green-fg}Reinforced:{/green-fg} ${targetArmy.name} +${improvement.manpowerGrant} manpower`);
    }

    return log;
  }

  return log;
}
