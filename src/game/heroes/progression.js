import { HERO_ABILITIES, HERO_CONTENT } from '../heroDefinitions.js';
import { HERO_CONSTANTS } from './constants.js';

// Older/custom Heroes without a content definition still have political agency.
export const LEGACY_CHARGE_TRIGGERS = [
  { event: 'LAW_ENACTED', amount: 55, alignment: 'support', description: 'An aligned law is enacted' },
  { event: 'LAW_ENACTED', amount: 60, alignment: 'oppose', description: 'An opposed law is enacted' },
  { event: 'LAW_REJECTED', amount: 75, alignment: 'support', description: 'An aligned agenda is rejected' },
  { event: 'BATTLE_LOST', amount: 80, empire_scope: 'participant', description: 'The empire suffers a battle defeat' },
  { event: 'LAW_PROPOSED', amount: 12, alignment: 'either', description: 'A proposal mobilizes support or opposition' }
];

export function copyChargeTriggers(triggers) {
  return (Array.isArray(triggers) ? triggers : []).filter(trigger => trigger && typeof trigger === 'object' &&
    typeof trigger.event === 'string' && Number.isFinite(trigger.amount) && trigger.amount > 0)
    .map(trigger => ({
      ...trigger,
      ...(Array.isArray(trigger.law_tags_any) ? { law_tags_any: [...trigger.law_tags_any] } : {})
    }));
}

export function getDefaultChargeTriggers(heroId) {
  return copyChargeTriggers(HERO_CONTENT[heroId]?.charge_triggers || LEGACY_CHARGE_TRIGGERS);
}

/** Preserve earned Charge; virtual legacy credits were never real funding or debt. */
export function migrateHeroProgression(hero) {
  if (!Array.isArray(hero.charge_triggers)) hero.charge_triggers = getDefaultChargeTriggers(hero.id);
  else hero.charge_triggers = copyChargeTriggers(hero.charge_triggers);
  if (!Array.isArray(hero.charge_events)) hero.charge_events = [];
  hero.charge_events = [...new Set(hero.charge_events.filter(id => typeof id === 'string'))];
  const chargeMax = HERO_ABILITIES[hero.ability_id]?.chargeRequired ?? HERO_CONSTANTS.ABILITY_DEFAULT_CHARGE;
  hero.charge = Math.max(0, Math.min(chargeMax, Number.isFinite(hero.charge) ? hero.charge : 0));
  hero.funding = Math.max(0, Math.min(HERO_CONSTANTS.FUNDING_MAX, Number.isFinite(hero.funding) ? hero.funding : 0));
  // Actual historical payments cannot be inferred from a decaying rating or a virtual bank.
  hero.funding_total = Math.max(0, Number.isFinite(hero.funding_total) ? hero.funding_total : 0);
  hero.funding_last_paid = Math.max(0, Number.isFinite(hero.funding_last_paid) ? hero.funding_last_paid : 0);
  delete hero.siphon_bank;
  return hero;
}
