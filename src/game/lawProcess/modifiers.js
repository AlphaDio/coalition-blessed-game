import { clampApproval, clampCohesion } from '../cohesion.js';
import { TRADE_INCOME_EFFECT_DIVISOR } from '../constants.js';
import { calculateLawReactions } from '../reactions.js';

/**
 * Apply law modifiers to the coalition when a law is enacted
 * @param {Object} lawDef - Law definition
 * @param {Object} state - Game state
 * @returns {Array} Log messages
 */
export function applyLawModifiers(lawDef, state) {
  const log = [];
  const modifiers = lawDef.modifiers || {};

  // Ensure coalitionModifiers exists
  if (!state.coalitionModifiers) {
    state.coalitionModifiers = {
      industrial_output: 0,
      research_speed: 0,
      army_organization: 0,
      supply_efficiency: 0,
      empire_approval: 0,
      population_growth: 0,
      trade_income: 0,
      empire_production_multiplier: 0,
      cohesionModifier: 1.0,
      army_maintenance_cost_modifier: 1.0,
      relations_strength_modifier: 1.0,
      consumptionShareMultiplier: 1.0,
      consumptionShareBonus: 0,
      law_progress_speed: 0,
      requisition_uptick: 0,
      requisition_gain_multiplier: 1.0
    };
  }
  if (!Number.isFinite(state.coalitionModifiers.law_progress_speed)) {
    state.coalitionModifiers.law_progress_speed = 0;
  }
  if (!Number.isFinite(state.coalitionModifiers.requisition_uptick)) {
    state.coalitionModifiers.requisition_uptick = 0;
  }
  if (!Number.isFinite(state.coalitionModifiers.requisition_gain_multiplier)) {
    state.coalitionModifiers.requisition_gain_multiplier = 1.0;
  }

  // Apply empire approval modifier (applies each tick to all empires)
  if (modifiers.empire_approval) {
    state.coalitionModifiers.empire_approval += modifiers.empire_approval;
    log.push(`Empire approval: +${modifiers.empire_approval} per tick`);
  }

  // Apply trade income modifier
  if (modifiers.trade_income) {
    state.coalitionModifiers.trade_income += modifiers.trade_income;
    const scaledTradeIncome = modifiers.trade_income / TRADE_INCOME_EFFECT_DIVISOR;
    const sign = scaledTradeIncome >= 0 ? '+' : '';
    log.push(`Trade income: ${sign}${scaledTradeIncome.toFixed(3)} credits per tick per empire`);
  }

  // Apply population growth modifier
  if (modifiers.population_growth) {
    state.coalitionModifiers.population_growth += modifiers.population_growth;
    log.push(`Population growth: +${modifiers.population_growth} per tick`);
  }

  // Apply industrial output modifier (percentage bonus)
  if (modifiers.industrial_output) {
    state.coalitionModifiers.industrial_output += modifiers.industrial_output;
    log.push(`Industrial output: +${(modifiers.industrial_output * 100).toFixed(1)}%`);
  }

  // Apply cohesion modifier (multiplier for cohesion recovery)
  if (modifiers.cohesionModifier) {
    state.coalitionModifiers.cohesionModifier *= modifiers.cohesionModifier;
    const bonus = ((modifiers.cohesionModifier - 1) * 100).toFixed(1);
    log.push(`Cohesion recovery: +${bonus}%`);
  }

  // Apply army maintenance cost modifier (multiplier, < 1.0 = cheaper)
  if (modifiers.army_maintenance_cost_modifier) {
    state.coalitionModifiers.army_maintenance_cost_modifier *= modifiers.army_maintenance_cost_modifier;
    const reduction = ((1 - modifiers.army_maintenance_cost_modifier) * 100).toFixed(0);
    log.push(`Army maintenance: -${reduction}%`);
  }

  // Apply relations strength modifier (multiplier for diplomacy improvements)
  if (modifiers.relations_strength_modifier) {
    state.coalitionModifiers.relations_strength_modifier *= modifiers.relations_strength_modifier;
    const bonus = ((modifiers.relations_strength_modifier - 1) * 100).toFixed(1);
    log.push(`Diplomacy strength: +${bonus}%`);
  }

  // Apply research speed modifier
  if (modifiers.research_speed) {
    state.coalitionModifiers.research_speed += modifiers.research_speed;
    log.push(`Research speed: +${(modifiers.research_speed * 100).toFixed(1)}%`);
  }

  // Apply supply efficiency modifier
  if (modifiers.supply_efficiency) {
    state.coalitionModifiers.supply_efficiency += modifiers.supply_efficiency;
    log.push(`Supply efficiency: +${(modifiers.supply_efficiency * 100).toFixed(1)}%`);
  }

  // Apply law process speed modifier
  if (modifiers.law_progress_speed) {
    state.coalitionModifiers.law_progress_speed += modifiers.law_progress_speed;
    log.push(`Law process speed: +${(modifiers.law_progress_speed * 100).toFixed(1)}%`);
  }

  // Apply army organization modifier (immediate bonus to all armies)
  if (modifiers.army_organization) {
    state.coalitionModifiers.army_organization += modifiers.army_organization;
    log.push(`Army organization: +${modifiers.army_organization}`);

    // Apply immediate organization bonus to all armies
    if (state.armies) {
      state.armies.forEach(army => {
        if (army.organization !== undefined) {
          army.organization = Math.min(100, army.organization + modifiers.army_organization);
        }
      });
    }
  }

  // Apply empire production multiplier modifier (multiplies all empire production)
  if (modifiers.empire_production_multiplier) {
    state.coalitionModifiers.empire_production_multiplier += modifiers.empire_production_multiplier;
    log.push(`Empire production multiplier: +${(modifiers.empire_production_multiplier * 100).toFixed(0)}%`);
  }

  // Apply consumption share multiplier (increases coalition's share of empire consumption)
  if (modifiers.consumptionShareMultiplier) {
    state.coalitionModifiers.consumptionShareMultiplier = (state.coalitionModifiers.consumptionShareMultiplier || 1.0) * modifiers.consumptionShareMultiplier;
    log.push(`Coalition consumption share: Ã—${modifiers.consumptionShareMultiplier} (now ${(state.coalitionModifiers.consumptionShareMultiplier * 100).toFixed(0)}%)`);
  }

  // Apply consumption share bonus (additive increase to coalition's share)
  if (modifiers.consumptionShareBonus) {
    state.coalitionModifiers.consumptionShareBonus = (state.coalitionModifiers.consumptionShareBonus || 0) + modifiers.consumptionShareBonus;
    log.push(`Coalition consumption share: +${(modifiers.consumptionShareBonus * 100).toFixed(0)}%`);
  }

  // Apply requisition uptick (flat requisition gain per turn)
  if (Number.isFinite(modifiers.requisition_uptick) && modifiers.requisition_uptick !== 0) {
    state.coalitionModifiers.requisition_uptick = (state.coalitionModifiers.requisition_uptick || 0) + modifiers.requisition_uptick;
    const sign = modifiers.requisition_uptick >= 0 ? '+' : '';
    log.push(`Requisition uptick: ${sign}${modifiers.requisition_uptick.toFixed(3)} per tick`);
  }

  // Apply requisition gain multiplier (affects requisition-generating systems)
  if (Number.isFinite(modifiers.requisition_gain_multiplier) && modifiers.requisition_gain_multiplier !== 1) {
    const current = Number.isFinite(state.coalitionModifiers.requisition_gain_multiplier)
      ? state.coalitionModifiers.requisition_gain_multiplier
      : 1.0;
    state.coalitionModifiers.requisition_gain_multiplier = current * modifiers.requisition_gain_multiplier;
    const bonus = ((modifiers.requisition_gain_multiplier - 1) * 100).toFixed(1);
    const sign = Number(bonus) >= 0 ? '+' : '';
    log.push(`Requisition gains: ${sign}${bonus}%`);
  }

  // Apply immediate empire reactions based on law's axis vector
  if (lawDef.axis_vector && Object.keys(lawDef.axis_vector).length > 0 && state.empires) {
    const lawForReaction = {
      vector: lawDef.axis_vector,
      weights: {},
      tag_effects: []
    };

    // Fill weights from axis_vector
    Object.keys(lawDef.axis_vector).forEach(axis => {
      lawForReaction.weights[axis] = 1.0;
    });

    const reactions = calculateLawReactions(state.empires, lawForReaction);

    Object.entries(reactions).forEach(([empireId, reactionData]) => {
      const empire = state.empires.find(e => e.id === empireId);
      if (empire) {
        empire.approval = clampApproval(empire.approval + reactionData.approvalChange);
        const sign = reactionData.approvalChange >= 0 ? '+' : '';
        log.push(`${empire.name}: ${sign}${reactionData.approvalChange} approval`);
      }
    });
  }

  return log;
}

export function removeLawModifiers(lawDef, state) {
  const modifiers = lawDef.modifiers || {};
  if (!state.coalitionModifiers) {
    return;
  }
  if (!Number.isFinite(state.coalitionModifiers.law_progress_speed)) {
    state.coalitionModifiers.law_progress_speed = 0;
  }
  if (!Number.isFinite(state.coalitionModifiers.requisition_uptick)) {
    state.coalitionModifiers.requisition_uptick = 0;
  }
  if (!Number.isFinite(state.coalitionModifiers.requisition_gain_multiplier)) {
    state.coalitionModifiers.requisition_gain_multiplier = 1.0;
  }

  if (modifiers.empire_approval) {
    state.coalitionModifiers.empire_approval -= modifiers.empire_approval;
  }
  if (modifiers.trade_income) {
    state.coalitionModifiers.trade_income -= modifiers.trade_income;
  }
  if (modifiers.population_growth) {
    state.coalitionModifiers.population_growth -= modifiers.population_growth;
  }
  if (modifiers.industrial_output) {
    state.coalitionModifiers.industrial_output -= modifiers.industrial_output;
  }
  if (modifiers.research_speed) {
    state.coalitionModifiers.research_speed -= modifiers.research_speed;
  }
  if (modifiers.supply_efficiency) {
    state.coalitionModifiers.supply_efficiency -= modifiers.supply_efficiency;
  }
  if (modifiers.law_progress_speed) {
    state.coalitionModifiers.law_progress_speed -= modifiers.law_progress_speed;
  }
  if (modifiers.empire_production_multiplier) {
    state.coalitionModifiers.empire_production_multiplier -= modifiers.empire_production_multiplier;
  }
  if (modifiers.cohesionModifier) {
    if (modifiers.cohesionModifier !== 0) {
      state.coalitionModifiers.cohesionModifier /= modifiers.cohesionModifier;
    }
  }
  if (modifiers.army_maintenance_cost_modifier) {
    if (modifiers.army_maintenance_cost_modifier !== 0) {
      state.coalitionModifiers.army_maintenance_cost_modifier /= modifiers.army_maintenance_cost_modifier;
    }
  }
  if (modifiers.relations_strength_modifier) {
    if (modifiers.relations_strength_modifier !== 0) {
      state.coalitionModifiers.relations_strength_modifier /= modifiers.relations_strength_modifier;
    }
  }
  if (modifiers.army_organization) {
    state.coalitionModifiers.army_organization -= modifiers.army_organization;
    if (state.armies) {
      state.armies.forEach(army => {
        if (army.organization !== undefined) {
          army.organization = Math.max(0, Math.min(100, army.organization - modifiers.army_organization));
        }
      });
    }
  }
  if (modifiers.consumptionShareMultiplier) {
    if (modifiers.consumptionShareMultiplier !== 0) {
      state.coalitionModifiers.consumptionShareMultiplier /= modifiers.consumptionShareMultiplier;
    }
  }
  if (modifiers.consumptionShareBonus) {
    state.coalitionModifiers.consumptionShareBonus -= modifiers.consumptionShareBonus;
  }
  if (Number.isFinite(modifiers.requisition_uptick) && modifiers.requisition_uptick !== 0) {
    state.coalitionModifiers.requisition_uptick -= modifiers.requisition_uptick;
  }
  if (Number.isFinite(modifiers.requisition_gain_multiplier) && modifiers.requisition_gain_multiplier !== 0) {
    const current = Number.isFinite(state.coalitionModifiers.requisition_gain_multiplier)
      ? state.coalitionModifiers.requisition_gain_multiplier
      : 1.0;
    state.coalitionModifiers.requisition_gain_multiplier = current / modifiers.requisition_gain_multiplier;
  }
}

export function applyLawImmediateEffects(lawDef, state, log, context = {}) {
  const effects = lawDef.immediate_effects || {};
  if (!effects || Object.keys(effects).length === 0) return;

  if (effects.cohesion) {
    const before = state.coalitionCohesion;
    state.coalitionCohesion = clampCohesion(state.coalitionCohesion + effects.cohesion);
    log.push(`Cohesion: ${before.toFixed(1)} -> ${state.coalitionCohesion.toFixed(1)}`);
  }

  if (effects.coalition_credits) {
    if (!state.coalitionEconomy) {
      state.coalitionEconomy = {
        requisition: 0,
        treasury_credits: 0,
        allowance_credits: 0,
        consumption_requisition_pool: 0,
        consumption_requisition_pool_turns: 0
      };
    }
    state.coalitionEconomy.treasury_credits =
      (state.coalitionEconomy.treasury_credits || 0) + effects.coalition_credits;
    log.push(`Coalition credits: +${effects.coalition_credits}`);
  }

  if (effects.requisition) {
    if (!state.coalitionEconomy) {
      state.coalitionEconomy = {
        requisition: 0,
        treasury_credits: 0,
        allowance_credits: 0,
        consumption_requisition_pool: 0,
        consumption_requisition_pool_turns: 0
      };
    }
    state.coalitionEconomy.requisition = (state.coalitionEconomy.requisition || 0) + effects.requisition;
    log.push(`Requisition: +${effects.requisition}`);
  }

  if (effects.influence) {
    state.playerInfluence = (state.playerInfluence || 0) + effects.influence;
    log.push(`Influence: +${effects.influence}`);
  }

  if (effects.coalitionIntel) {
    state.coalitionIntel = (state.coalitionIntel || 0) + effects.coalitionIntel;
    log.push(`Intel: ${effects.coalitionIntel >= 0 ? '+' : ''}${effects.coalitionIntel}`);
  }

  if (effects.empire_approval && state.empires) {
    state.empires.forEach(empire => {
      empire.approval = clampApproval(empire.approval + effects.empire_approval);
    });
    log.push(`Empire approval: +${effects.empire_approval} (immediate)`);
  }

  if (effects.army_organization && state.armies) {
    state.armies.forEach((army) => {
      army.organization = Math.max(0, Math.min(100, (army.organization || 0) + effects.army_organization));
    });
    log.push(`Army organization surge: +${effects.army_organization}`);
  }

  if (effects.army_fervor && state.armies) {
    state.armies.forEach((army) => {
      const before = Number(army.fervor || 0);
      army.fervor = Math.max(0, Math.min(100, before + effects.army_fervor));
    });
    log.push(`Army fervor surge: +${effects.army_fervor}`);
  }

  if (effects.army_mp && state.armies) {
    state.armies.forEach((army) => {
      if (!army.mp || typeof army.mp !== 'object') return;
      const max = Number.isFinite(army.mp.max) ? army.mp.max : 0;
      if (max <= 0) return;
      const current = Number.isFinite(army.mp.current) ? army.mp.current : max;
      army.mp.current = Math.max(0, Math.min(max, current + effects.army_mp));
    });
    log.push(`Army manpower reinforcement: +${effects.army_mp} current MP`);
  }

  const sponsorHeroId = context?.lawProcess?.sponsorHeroId || null;
  if (sponsorHeroId && state.heroes && (effects.hero_popularity || effects.hero_heat || effects.hero_grievance)) {
    const sponsorHero = state.heroes.find((hero) => hero.id === sponsorHeroId);
    if (sponsorHero) {
      sponsorHero.meters = sponsorHero.meters || { heat: 0, grievance: 0, popularity: 50 };
      if (effects.hero_popularity) {
        sponsorHero.meters.popularity = Math.max(0, Math.min(100, (sponsorHero.meters.popularity || 0) + effects.hero_popularity));
        log.push(`Sponsor popularity: ${effects.hero_popularity >= 0 ? '+' : ''}${effects.hero_popularity}`);
      }
      if (effects.hero_heat) {
        sponsorHero.meters.heat = Math.max(0, Math.min(100, (sponsorHero.meters.heat || 0) + effects.hero_heat));
        log.push(`Sponsor heat: ${effects.hero_heat >= 0 ? '+' : ''}${effects.hero_heat}`);
      }
      if (effects.hero_grievance) {
        sponsorHero.meters.grievance = Math.max(0, Math.min(100, (sponsorHero.meters.grievance || 0) + effects.hero_grievance));
        log.push(`Sponsor grievance: ${effects.hero_grievance >= 0 ? '+' : ''}${effects.hero_grievance}`);
      }
    }
  }
}
