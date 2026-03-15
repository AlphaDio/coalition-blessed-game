import {
  clampStat,
  clampApproval,
  applyScaledCoalitionCohesionDelta
} from '../cohesion.js';
import { getLogger } from '../../modules/logger.js';
import { isRegularArmy } from './armyUtils.js';
import { resetDynamicCoalitionModifiers } from '../scourgeThreat.js';
import { getActiveEmergencyPowerModifiers } from '../emergencyPowers.js';
import { applyCoalitionIntel } from '../scourgePrediction.js';
import { scalePositiveApprovalGain } from '../approvalUtils.js';
import { addArmyBattlePrep } from '../armyBattlePrep.js';

/**
 * Apply emergency law modifiers to game state
 * These are powerful temporary effects from active emergency laws
 * @param {Object} state - Game state
 * @param {Object} modifiers - Aggregate modifiers from active emergency laws
 * @param {Array} log - Log array to append messages
 */
export function applyEmergencyModifiers(state, modifiers, log) {
  if (!modifiers || Object.keys(modifiers).length === 0) return;

  const logger = getLogger();

  // Apply cohesion modifiers (drain or bonus)
  if (modifiers.cohesion_drain) {
    const prevCohesion = state.coalitionCohesion;
    const appliedDelta = applyScaledCoalitionCohesionDelta(state, modifiers.cohesion_drain);
    if (appliedDelta < 0) {
      logger.debug(`Emergency law cohesion drain: ${prevCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)}`);
    }
  }

  if (modifiers.cohesion_bonus) {
    const prevCohesion = state.coalitionCohesion;
    applyScaledCoalitionCohesionDelta(state, modifiers.cohesion_bonus);
    logger.debug(`Emergency law cohesion bonus: ${prevCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)}`);
  }

  // Apply empire-level modifiers
  if (state.empires) {
    state.empires.forEach(empire => {
      // Apply approval modifier
      if (modifiers.empire_approval) {
        const prevApproval = empire.approval;
        const rawApprovalDelta = Number(modifiers.empire_approval) || 0;
        const approvalDelta = rawApprovalDelta > 0
          ? scalePositiveApprovalGain(empire.approval, rawApprovalDelta)
          : rawApprovalDelta;
        empire.approval = clampApproval(empire.approval + approvalDelta);
        if (Math.abs(modifiers.empire_approval) > 3) {
          logger.debug(`Emergency law approval impact on ${empire.name}: ${prevApproval.toFixed(1)} -> ${empire.approval.toFixed(1)}`);
        }
      }
    });
  }

  // Apply army-level modifiers
  if (state.armies && (modifiers.army_organization_bonus || modifiers.army_fervor_bonus)) {
    state.armies.forEach(army => {
      if (isRegularArmy(army)) {
        // Organization bonus
        if (modifiers.army_organization_bonus) {
          army.organization = clampStat(
            army.organization + modifiers.army_organization_bonus * 0.1, // Apply as gradual bonus
            0, 100
          );
        }

        // Fervor prep for the next battle
        if (modifiers.army_fervor_bonus) {
          addArmyBattlePrep(army, 'fervor', modifiers.army_fervor_bonus * 0.1);
        }
      }
    });
  }

  // Note: Other modifiers (army_damage_multiplier, army_protection_bonus,
  // industrial_output, research_speed, etc.) are read directly from
  // getActiveEmergencyModifiers() in their respective systems
}

export function applyEmergencyPowerDynamicModifiers(state) {
  const modifiers = getActiveEmergencyPowerModifiers(state);
  if (!state.coalitionModifiers?.dynamic) {
    resetDynamicCoalitionModifiers(state);
  }
  state.coalitionModifiers.dynamic.requisition_gen_mult *= modifiers.requisitionGenMult;
  state.coalitionModifiers.dynamic.improvement_build_speed_mult *= modifiers.improvementBuildSpeedMult;
  state.coalitionModifiers.dynamic.law_progress_speed_bonus += modifiers.lawProgressSpeedBonus;
  if (modifiers.intelGainPerTurn > 0) {
    applyCoalitionIntel(state, modifiers.intelGainPerTurn);
  }
}

