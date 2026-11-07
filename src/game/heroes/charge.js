import { HERO_ABILITIES } from '../heroDefinitions.js';
import { getLogger } from '../../modules/logger.js';
import { HERO_CONSTANTS, HERO_STATUS } from './constants.js';
import { computeAlignmentScore, getHeroEmpireId, getLawValues } from './utils.js';
import { migrateHeroProgression } from './progression.js';
import { triggerHeroAbilities } from './abilities.js';

const CHARGE_EVENTS = new Set([
  'LAW_PROPOSED', 'LAW_ENACTED', 'LAW_REJECTED',
  'BATTLE_STARTED', 'BATTLE_WON', 'BATTLE_LOST',
  'TECH_UNLOCKED', 'IMPROVEMENT_STARTED', 'IMPROVEMENT_COMPLETED'
]);

export function getActiveHeroLawProcess(state, preferred = null) {
  const isActive = process => process && !['ENACTED', 'BURIED'].includes(process.phase);
  return isActive(preferred) ? preferred : (state.lawProcesses || []).find(isActive) || null;
}

function getEventId(event, payload) {
  if (typeof payload.eventId === 'string' && payload.eventId.length > 0) return payload.eventId;
  const process = payload.lawProcess || payload.law_process;
  if (event === 'LAW_PROPOSED' && payload.proposal?.proposalId) return `proposal:${payload.proposal.proposalId}`;
  if (['LAW_ENACTED', 'LAW_REJECTED'].includes(event) && process?.lawId) {
    return `${process.hero_event_id || `law:${process.lawId}:${process.startTick ?? 0}`}:${event === 'LAW_ENACTED' ? 'enacted' : 'rejected'}`;
  }
  if (event === 'TECH_UNLOCKED' && payload.empireId && payload.techId) return `tech:${payload.empireId}:${payload.techId}`;
  if (event.startsWith('IMPROVEMENT_') && payload.improvement?.id) {
    return `improvement:${payload.improvement.id}:${payload.improvement.startedAtTick ?? 0}:${event}`;
  }
  // A per-tick fallback would double-award delayed observations of the same event.
  return null;
}

function matchesTrigger(hero, rule, event, payload, state) {
  if (rule.event !== event || !Number.isFinite(rule.amount) || rule.amount <= 0) return false;
  if (rule.empire_scope && !['own', 'participant', 'any'].includes(rule.empire_scope)) return false;
  if (rule.alignment && !['support', 'oppose', 'either'].includes(rule.alignment)) return false;
  const empireId = getHeroEmpireId(hero);
  const process = payload.lawProcess || payload.law_process;
  const proposal = payload.proposal || (state.proposedLaws || []).find(entry => entry.proposalId === process?.proposalId);
  const proposerId = proposal?.proposerHeroId || payload.proposerHero?.id || process?.sponsorHeroId;
  const proposer = (state.heroes || []).find(entry => entry.id === proposerId);
  const eventEmpireId = payload.empireId || proposal?.proposerEmpireId || (payload.proposerHero || proposer)?.empireId;
  if (rule.empire_scope === 'own' && (!eventEmpireId || eventEmpireId !== empireId)) return false;
  if (rule.empire_scope === 'participant' && !payload.participatingEmpireIds?.includes(empireId)) return false;
  if (rule.proposer_only && proposerId !== hero.id) return false;

  const law = payload.lawDef || payload.law || (state.lawDefinitions || []).find(entry => entry.id === process?.lawId);
  if (rule.alignment) {
    if (!law) return false;
    const alignment = computeAlignmentScore(hero.values, getLawValues(law));
    if (rule.alignment === 'support' && alignment < 0.15) return false;
    if (rule.alignment === 'oppose' && alignment > -0.15) return false;
    if (rule.alignment === 'either' && Math.abs(alignment) < 0.15) return false;
  }
  if (Array.isArray(rule.law_tags_any) && rule.law_tags_any.length > 0) {
    const tags = new Set([...(law?.tags || []), ...(law?.law_tags || []), law?.category]);
    if (!rule.law_tags_any.some(tag => tags.has(tag))) return false;
  }
  return true;
}

/** One stable game event can award each eligible Hero once, across observers and saves. */
export function triggerHeroEvent(state, event, payload = {}, log = []) {
  if (!CHARGE_EVENTS.has(event)) return;
  const eventId = getEventId(event, payload);
  if (eventId) {
    for (const hero of state.heroes || []) {
      if (hero.status === HERO_STATUS.EXILED || !(state.empires || []).some(empire => empire.id === getHeroEmpireId(hero))) continue;
      migrateHeroProgression(hero);
      if (hero.charge_events.includes(eventId)) continue;
      const matches = hero.charge_triggers.filter(rule => matchesTrigger(hero, rule, event, payload, state));
      if (matches.length === 0) continue;
      // Matching reasons explain eligibility; they never stack rewards for one occurrence.
      const rule = matches.reduce((best, next) => next.amount > best.amount ? next : best);
      hero.charge_events.push(eventId);
      const multiplier = HERO_CONSTANTS.STATUS_CHARGE_MULTIPLIER[hero.status] ?? 1;
      const cap = HERO_ABILITIES[hero.ability_id]?.chargeRequired ?? HERO_CONSTANTS.ABILITY_DEFAULT_CHARGE;
      const before = hero.charge;
      hero.charge = Math.min(cap, before + rule.amount * multiplier);
      if (hero.charge > before) {
        const message = `Hero charge: ${hero.name} +${(hero.charge - before).toFixed(1)} Charge (${rule.description || event}; ${hero.charge.toFixed(1)}/${cap}).`;
        log.push(message);
        getLogger().info(message);
      }
    }
  }
  triggerHeroAbilities(state, getActiveHeroLawProcess(state, payload.lawProcess || payload.law_process), log);
}
