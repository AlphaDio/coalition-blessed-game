import { clamp } from '../cohesion.js';
import { HERO_ABILITIES } from '../heroDefinitions.js';
import { getLogger } from '../../modules/logger.js';
import { HERO_CONSTANTS, HERO_STATUS } from './constants.js';
import { getHeroEmpireId, ensureHeroMeters } from './utils.js';

export function applyHeroBudgetSiphon(state, log) {
  if (!state.heroes || state.heroes.length === 0) return;
  if (!state.empires || state.empires.length === 0) return;

  const logger = getLogger();

  state.empires.forEach(empire => {
    const heroes = state.heroes.filter(hero => getHeroEmpireId(hero) === empire.id && hero.status !== HERO_STATUS.EXILED);
    if (heroes.length === 0) return;

    const totalShare = heroes.reduce((sum, hero) => sum + (hero.budget_share || 0), 0);
    if (totalShare <= 0) return;

    const budget = Math.max(0, empire.budget_credits || 0);
    const virtualSiphon = budget * Math.min(totalShare, 0.3);
    if (virtualSiphon <= 0) return;

    const empireMods = state.improvements?.empireModifiers?.[empire.id] || {};
    const globalMult = state.coalitionModifiers?.hero_siphon_efficiency_mult || 0;
    const globalAdd = state.coalitionModifiers?.hero_siphon_efficiency_add || 0;
    const empireMult = empireMods.hero_siphon_efficiency_mult || 0;
    const empireAdd = empireMods.hero_siphon_efficiency_add || 0;
    const efficiencyMult = globalMult + empireMult;
    const efficiencyAdd = globalAdd + empireAdd;
    const chargePerCredit = Math.max(
      0,
      (HERO_CONSTANTS.CHARGE_PER_CREDIT * (1 + efficiencyMult)) + efficiencyAdd
    );

    heroes.forEach(hero => {
      ensureHeroMeters(hero);
      const share = totalShare > 0 ? (hero.budget_share || 0) / totalShare : 0;
      const siphoned = virtualSiphon * share;
      const statusMultiplier = HERO_CONSTANTS.STATUS_CHARGE_MULTIPLIER[hero.status] ?? 1;
      const chargeGain = siphoned * chargePerCredit * statusMultiplier;
      const abilityDef = HERO_ABILITIES[hero.ability_id];
      const chargeMax = abilityDef?.chargeRequired ?? HERO_CONSTANTS.ABILITY_MIN_CHARGE;
      hero.charge = clamp((hero.charge || 0) + chargeGain, 0, chargeMax);
      hero.siphon_bank = (hero.siphon_bank || 0) + siphoned;
      const message = `Hero charge: ${hero.name} accumulates +${chargeGain.toFixed(1)} charge (virtual siphon ${Math.round(siphoned)} credits).`;
      log.push(message);
      logger.debug(message);
    });
  });
}
