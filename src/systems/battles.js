// Battle resolution and casualties

import { clamp, randomFloat } from '../state.js';
import { modifyScourgeCohesion, getScourgeBattlePower } from './scourge.js';
import { modifyCohesion } from './cohesion.js';

export const BATTLE_ORG_WEIGHT = 0.6;
export const BATTLE_FERVOR_WEIGHT = 0.4;
export const BATTLE_NOISE = 0.15; // ±15% random variation

export function calculateArmyPower(army) {
  return (
    army.organization * BATTLE_ORG_WEIGHT +
    army.fervor * BATTLE_FERVOR_WEIGHT
  );
}

export function calculateCoalitionPower(armies) {
  return armies.reduce((sum, army) => sum + calculateArmyPower(army), 0);
}

export function resolveScourgeBattle(state, coalitionArmies, rng) {
  const coalitionPower = calculateCoalitionPower(coalitionArmies);
  const baseScourgePower = 50; // Base enemy strength
  const scourgePower = baseScourgePower * (1 + state.scourgeFervor * 0.1) * (1 + (rng() - 0.5) * BATTLE_NOISE * 2);

  const coalitionWins = coalitionPower > scourgePower;
  const margin = Math.abs(coalitionPower - scourgePower) / Math.max(coalitionPower, scourgePower);

  // Apply casualties and effects
  coalitionArmies.forEach(army => {
    if (coalitionWins) {
      army.organization = clamp(army.organization - 5, 0, 100);
      army.fervor = clamp(army.fervor + 2, 0, 100);
    } else {
      army.organization = clamp(army.organization - 15, 0, 100);
      army.fervor = clamp(army.fervor - 5, 0, 100);
    }
  });

  if (coalitionWins) {
    const cohesionLoss = margin > 0.3 ? -8 : -5; // Decisive vs narrow win
    modifyScourgeCohesion(state, cohesionLoss, 'Battle victory');
    state.log.push(`Victory! Scourge cohesion -${Math.abs(cohesionLoss)}`);
  } else {
    const cohesionLoss = margin > 0.3 ? -12 : -8; // Decisive vs narrow loss
    modifyCohesion(state, cohesionLoss, 'Battle defeat');
    state.log.push(`Defeat! Coalition cohesion -${Math.abs(cohesionLoss)}`);
    
    // Reduce empire approvals
    state.empires.forEach(empire => {
      empire.approval = clamp(empire.approval - 5, -100, 100);
    });
  }

  return { coalitionWins, margin };
}

export function resolveInsurrectionBattle(state, coalitionArmies, insurrectionArmies, rng) {
  const coalitionPower = calculateCoalitionPower(coalitionArmies);
  const insurrectionPower = calculateCoalitionPower(insurrectionArmies) * (1 + (rng() - 0.5) * BATTLE_NOISE * 2);

  const coalitionWins = coalitionPower > insurrectionPower;
  const margin = Math.abs(coalitionPower - insurrectionPower) / Math.max(coalitionPower, insurrectionPower);

  // Apply casualties
  coalitionArmies.forEach(army => {
    if (coalitionWins) {
      army.organization = clamp(army.organization - 3, 0, 100);
    } else {
      army.organization = clamp(army.organization - 10, 0, 100);
    }
  });

  insurrectionArmies.forEach(army => {
    if (coalitionWins) {
      army.fervor = clamp(army.fervor - 20, 0, 100);
      army.aggravation = clamp(army.aggravation - 30, 0, 100);
    }
  });

  if (coalitionWins) {
    modifyCohesion(state, -3, 'Insurrection suppressed');
    state.log.push('Insurrection suppressed');
  } else {
    modifyCohesion(state, -15, 'Insurrection victory');
    state.log.push('Insurrection victory - major cohesion loss');
    
    // Shock to empire approvals
    insurrectionArmies.forEach(army => {
      const empire = state.empires.find(e => e.id === army.empireId);
      if (empire) {
        empire.approval = clamp(empire.approval - 15, -100, 100);
      }
    });
  }

  return { coalitionWins, margin };
}
