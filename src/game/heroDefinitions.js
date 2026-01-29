/**
 * Hero ability and passive definitions (v0.3)
 */

import { getLogger } from '../modules/logger.js';

export const HERO_ARCHETYPES = [
  {
    id: 'ARCHETYPAL_DIPLOMAT',
    title: 'Diplomat',
    tagline: 'A patient negotiator who cools tempers while nudging consensus.',
    tags: ['diplomatic', 'moderate'],
    ability_id: 'ABILITY_PUBLIC_MANDATE',
    passive_id: 'PASSIVE_VOTING_START_WHIP'
  },
  {
    id: 'ARCHETYPAL_ORATOR',
    title: 'Orator',
    tagline: 'A firebrand speaker who accelerates debate momentum.',
    tags: ['rhetoric', 'debate'],
    ability_id: 'ABILITY_LEGISLATIVE_SURGE',
    passive_id: 'PASSIVE_DEBATE_TICK_ORATOR'
  },
  {
    id: 'ARCHETYPAL_PATRON',
    title: 'Patron',
    tagline: 'A political broker who keeps credits flowing in a crisis.',
    tags: ['patronage', 'finance'],
    ability_id: 'ABILITY_EMERGENCY_FUNDS',
    passive_id: 'PASSIVE_FALLOUT_START_CREDIT_GRANT'
  }
];

export const HERO_PASSIVES = {
  PASSIVE_FALLOUT_START_CREDIT_GRANT: {
    id: 'PASSIVE_FALLOUT_START_CREDIT_GRANT',
    phase: 'FALLOUT',
    cadence: 'OnStart',
    description: 'Grant credits to the hero empire at the start of Fallout.',
    apply({ hero, empire, popularityScalar, log }) {
      const baseGrant = 1000;
      const grant = Math.round(baseGrant * popularityScalar);
      empire.budget_credits = (empire.budget_credits || 0) + grant;
      const message = `Hero Passive triggered: ${hero.name} granted ${grant} credits to ${empire.name}.`;
      log.push(message);
      getLogger().debug(message);
    }
  },
  PASSIVE_DEBATE_TICK_ORATOR: {
    id: 'PASSIVE_DEBATE_TICK_ORATOR',
    phase: 'DEBATE',
    cadence: 'OnTick',
    description: 'Boost momentum slightly each debate tick if the law aligns with hero domain.',
    apply({ hero, lawProcess, lawDef, popularityScalar, log }) {
      const lawTags = lawDef.tags || lawDef.law_tags || [];
      const heroTags = hero.tags || [];
      const matches = lawTags.some(tag => heroTags.includes(tag));
      if (!matches) return;
      const bonus = 0.02 * popularityScalar;
      lawProcess.meters.momentum = Math.min(1, lawProcess.meters.momentum + bonus);
      const message = `Hero Passive triggered: ${hero.name} orates (+${(bonus * 100).toFixed(1)}% momentum).`;
      log.push(message);
      getLogger().debug(message);
    }
  },
  PASSIVE_VOTING_START_WHIP: {
    id: 'PASSIVE_VOTING_START_WHIP',
    phase: 'VOTING',
    cadence: 'OnStart',
    description: 'Nudge legitimacy upward at the start of voting.',
    apply({ hero, lawProcess, popularityScalar, log }) {
      const bonus = 0.03 * popularityScalar;
      lawProcess.meters.legitimacy = Math.min(1, lawProcess.meters.legitimacy + bonus);
      const message = `Hero Passive triggered: ${hero.name} rallies votes (+${(bonus * 100).toFixed(1)}% legitimacy).`;
      log.push(message);
      getLogger().debug(message);
    }
  }
};

export const HERO_ABILITIES = {
  ABILITY_PUBLIC_MANDATE: {
    id: 'ABILITY_PUBLIC_MANDATE',
    description: 'Convert popularity into short-term stability: reduce heat/grievance, boost popularity.',
    cost_credits: 1500,
    cooldown: 10,
    trigger({ hero, popularityScalar, log }) {
      const heatReduction = 10 * popularityScalar;
      const grievanceReduction = 6 * popularityScalar;
      const popularityBoost = 4 * popularityScalar;
      hero.meters.heat = Math.max(0, hero.meters.heat - heatReduction);
      hero.meters.grievance = Math.max(0, hero.meters.grievance - grievanceReduction);
      hero.meters.popularity = Math.min(100, hero.meters.popularity + popularityBoost);
      const message = `Hero Ability: ${hero.name} invoked Public Mandate (heat -${heatReduction.toFixed(1)}, grievance -${grievanceReduction.toFixed(1)}).`;
      log.push(message);
      getLogger().info(message);
    }
  },
  ABILITY_LEGISLATIVE_SURGE: {
    id: 'ABILITY_LEGISLATIVE_SURGE',
    description: 'Add immediate law phase progress if a law is active.',
    cost_credits: 2000,
    cooldown: 12,
    trigger({ hero, lawProcess, popularityScalar, log }) {
      if (!lawProcess) return;
      const bonus = 0.08 * popularityScalar;
      const before = lawProcess.phaseProgress;
      lawProcess.phaseProgress = Math.min(2.0, lawProcess.phaseProgress + bonus);
      const message = `Hero Ability: ${hero.name} surged law progress ${before.toFixed(2)} -> ${lawProcess.phaseProgress.toFixed(2)}.`;
      log.push(message);
      getLogger().info(message);
    }
  },
  ABILITY_EMERGENCY_FUNDS: {
    id: 'ABILITY_EMERGENCY_FUNDS',
    description: 'Inject credits into the hero empire.',
    cost_credits: 2500,
    cooldown: 8,
    trigger({ hero, empire, popularityScalar, log }) {
      const baseGrant = 2000;
      const grant = Math.round(baseGrant * popularityScalar);
      empire.budget_credits = (empire.budget_credits || 0) + grant;
      const message = `Hero Ability: ${hero.name} released ${grant} emergency credits for ${empire.name}.`;
      log.push(message);
      getLogger().info(message);
    }
  }
};
