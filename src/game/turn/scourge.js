import { clampCohesion, clampStat } from '../cohesion.js';
import { getLogger } from '../../modules/logger.js';
import { startScourgeBattle } from '../battles.js';
import { collectScourgeModifierEffects } from '../scourgeModifiers.js';
import { resetDynamicCoalitionModifiers, getThreatScalar } from '../scourgeThreat.js';

export function applyDynamicScourgeModifierEffects(state, log) {
  const effects = collectScourgeModifierEffects(state.scourgeModifiers || [], 'always');
  if (!state.coalitionModifiers?.dynamic) {
    resetDynamicCoalitionModifiers(state);
  }

  state.coalitionModifiers.dynamic.law_progress_speed_bonus += effects.lawProgressSpeedBonus;
  state.coalitionModifiers.dynamic.improvement_build_speed_mult *= effects.improvementBuildSpeedMult;
  state.coalitionModifiers.dynamic.requisition_gen_mult *= effects.requisitionGenMult;

  if (effects.coalitionCohesionAdd) {
    const prevCohesion = state.coalitionCohesion;
    state.coalitionCohesion = clampCohesion(state.coalitionCohesion + effects.coalitionCohesionAdd);
    log.push(`Cohesion ${effects.coalitionCohesionAdd >= 0 ? '+' : ''}${effects.coalitionCohesionAdd.toFixed(2)} (Scourge pressure)`);
    const logger = getLogger();
    logger.debug(`Scourge modifier cohesion: ${prevCohesion.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)}`);
  }

  if (effects.coalitionRequisitionAdd && state.coalitionEconomy) {
    state.coalitionEconomy.requisition = (state.coalitionEconomy.requisition || 0) + effects.coalitionRequisitionAdd;
  }
}

export function tickScourgeRecovery(state) {
  const threat = getThreatScalar(state.coalitionThreat || 0);
  const baseRecovery = 0.6;
  const threatMultiplier = 1 + (threat / 100);
  const effects = collectScourgeModifierEffects(state.scourgeModifiers || [], 'between_attacks_only');
  const recovery = (baseRecovery * threatMultiplier + effects.recoveryRateAdd) * effects.recoveryRateMult;
  state.scourgeRecoveryRate = recovery;
  state.scourgeManpower = clampStat((state.scourgeManpower || 0) + recovery, 0, 100);
}

export function resolvePendingScourgeAttack(state, rng, log, logger) {
  const pending = state.pendingScourgeAttack;
  if (!pending || !pending.ready) return false;

  const participatingArmies = (pending.participatingArmyIds || [])
    .map(id => state.armies.find(army => army.id === id))
    .filter(Boolean);

  if (participatingArmies.length > 0) {
    const battleResult = startScourgeBattle(state, participatingArmies, rng);
    log.push(...battleResult.log);
  } else {
    logger.warn('Pending Scourge battle had no available armies');
  }

  state.pendingScourgeAttack = null;
  return true;
}

