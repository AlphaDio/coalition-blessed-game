import { clampStat } from '../cohesion.js';
import { getLogger } from '../../modules/logger.js';
import { recordConsumption } from '../consumptionToRequisition.js';
import { collectArmiesInBattle, isRegularArmy } from './armyUtils.js';

/**
 * Recover organization for all armies
 * Recovery rate is based on:
 * - Army Command stat (0-100, determines base recovery speed)
 * - Reduced during active battles (50% of normal rate)
 * @param {Object} state - Game state
 * @param {Array} activeBattles - Array of active battle fronts
 */
export function recoverArmyOrganization(state, activeBattles) {
  const logger = getLogger();

  const armiesInBattle = collectArmiesInBattle(activeBattles);

  const regularArmies = state.armies.filter(isRegularArmy);

  regularArmies.forEach(army => {
    // Skip if already at max organization
    if (army.organization >= 100) return;

    const inBattle = armiesInBattle.has(army.id);

    // Base recovery rate: Command stat (0-100) determines recovery per tick
    // Scale: 0 command = 0.1 per tick, 100 command = 1.0 per tick
    const baseRecoveryRate = 0.1 + ((army.command || 50) / 100) * 0.9;

    // During battles, recovery is slower (50% of normal rate)
    const effectiveRate = inBattle ? baseRecoveryRate * 0.5 : baseRecoveryRate;

    // Apply organization recovery
    const spaceAvailable = 100 - army.organization;
    const recovered = Math.min(effectiveRate, spaceAvailable);
    army.organization = clampStat(army.organization + recovered, 0, 100);

    // Debug logging for significant recovery
    if (recovered > 0.5) {
      logger.debug(`Organization recovery: ${army.name} +${recovered.toFixed(2)} org (command: ${(army.command || 50).toFixed(0)}, inBattle: ${inBattle}, new: ${army.organization.toFixed(1)})`);
    }
  });
}

/**
 * Replenish manpower for armies not currently in active battles
 * Replenishment rate is based on:
 * - Army fervor (higher fervor = faster replenishment)
 * - Empire size (population - larger empires can replenish faster)
 * @param {Object} state - Game state
 * @param {Array} activeBattles - Array of active battle fronts
 */
export function replenishArmyManpower(state, activeBattles) {
  const logger = getLogger();

  const armiesInBattle = collectArmiesInBattle(activeBattles);

  const regularArmies = state.armies.filter(isRegularArmy);
  const replenishingArmies = regularArmies.filter(army => !armiesInBattle.has(army.id));

  // Build empire lookup map
  const empireMap = new Map(state.empires.map(empire => [empire.id, empire]));

  replenishingArmies.forEach(army => {
    // Skip if already at max
    if (army.mp.current >= army.mp.max) return;

    const empire = empireMap.get(army.empireId);
    if (!empire) {
      logger.debug(`Army ${army.name} has no empire, skipping replenishment`);
      return;
    }

    // Base replenishment rate (per tick)
    const baseRate = army.reinforcementRate || 100;

    // Fervor modifier: 0.5x at 0 fervor, 1.5x at 100 fervor
    // Linear interpolation: 0.5 + (fervor / 100) * 1.0
    // Include both permanent fervorBonus and active timed fervor bonuses
    let totalFervorBonus = (army.fervorBonus || 0);
    if (army.timedFervorBonuses && Array.isArray(army.timedFervorBonuses)) {
      totalFervorBonus += army.timedFervorBonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
    }
    const effectiveFervor = Math.min(100, (army.fervor || 0) + totalFervorBonus);
    const fervorModifier = 0.5 + (effectiveFervor / 100) * 1.0;

    // Empire size modifier based on population
    // Normalize population: log10 scale, then scale to 0.5x - 2.0x range
    const population = empire.stats?.population || 1000;
    const logPopulation = Math.log10(Math.max(1, population));
    // Scale: 1000 (3.0) = 0.5x, 10000 (4.0) = 1.0x, 100000 (5.0) = 1.5x, 1M (6.0) = 2.0x
    // Linear interpolation between breakpoints
    let populationModifier;
    if (logPopulation <= 3.0) {
      // Below 1000: 0.5x
      populationModifier = 0.5;
    } else if (logPopulation <= 4.0) {
      // 1000 to 10000: 0.5x to 1.0x
      populationModifier = 0.5 + (logPopulation - 3.0) * 0.5;
    } else if (logPopulation <= 5.0) {
      // 10000 to 100000: 1.0x to 1.5x
      populationModifier = 1.0 + (logPopulation - 4.0) * 0.5;
    } else if (logPopulation <= 6.0) {
      // 100000 to 1M: 1.5x to 2.0x
      populationModifier = 1.5 + (logPopulation - 5.0) * 0.5;
    } else {
      // Above 1M: cap at 2.0x
      populationModifier = 2.0;
    }

    // Calculate effective replenishment rate
    // Apply multiplicative modifier (default 1.0)
    const replenishmentMultiplier = army.replenishmentMultiplier || 1.0;
    let effectiveRate = baseRate * fervorModifier * populationModifier * replenishmentMultiplier;

    // Apply additive bonus (default 0)
    const replenishmentBonus = army.replenishmentBonus || 0;
    effectiveRate += replenishmentBonus;

    // Ensure rate is non-negative
    effectiveRate = Math.max(0, effectiveRate);

    // Apply replenishment
    const spaceAvailable = army.mp.max - army.mp.current;
    const replenished = Math.min(effectiveRate, spaceAvailable);
    army.mp.current += replenished;

    // Debug logging for significant replenishment
    if (replenished > 50) {
      logger.debug(`Manpower replenishment: ${army.name} +${replenished.toFixed(0)} MP (fervor: ${army.fervor.toFixed(0)}, pop: ${population.toFixed(0)}, rate: ${effectiveRate.toFixed(0)})`);
    }
  });

  // Check signature commodity for bonus manpower (every tick, regardless of MP status or battle state)
  regularArmies.forEach(army => {
    if (!army.signatureCommodity || army.signatureThreshold <= 0) return;

    const empire = empireMap.get(army.empireId);
    if (!empire) return;

    const stockpile = empire.stockpiles || {};
    const available = stockpile[army.signatureCommodity] || 0;

    if (available >= army.signatureThreshold) {
      // Consume ALL of the signature commodity and convert to manpower
      // Conversion rate: 100 manpower per threshold amount
      const conversionRate = 100;
      const manpowerGained = Math.floor(available / army.signatureThreshold) * conversionRate;
      stockpile[army.signatureCommodity] = 0;
      army.manpower += manpowerGained;
      army.mp.max = army.manpower;
      army.mp.current = Math.min(army.mp.current + manpowerGained, army.mp.max);

      // Track consumption for coalition requisition generation
      recordConsumption(army.signatureCommodity, available);

      logger.debug(`Signature commodity trigger: ${army.name} consumed ${available} ${army.signatureCommodity} for +${manpowerGained} manpower`);
    }
  });
}

