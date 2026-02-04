import { getLogger } from '../../../modules/logger.js';
import { releaseProductionFromBank, processImprovementProduction } from './production.js';
import { processImprovementSustainment } from './sustainment.js';
import { grantImprovementUnits } from './modifiers.js';

/**
 * Process improvements each tick
 */
export function processImprovementsTick(state) {
  const logger = getLogger();
  const log = [];
  const improvements = state.improvements;

  // Update current capacity (BUILDING improvements only)
  improvements.currentCapacity = improvements.queue
    .filter(i => i.state === 'BUILDING')
    .reduce((sum, i) => sum + i.capacity, 0);

  // Get construction value (how much progress ALL building items get per tick)
  let effectiveConstruction = Number.isFinite(state.coalitionConstruction) ? state.coalitionConstruction : 1;

  // Apply modifiers from active improvements
  const activeImprovements = improvements.queue.filter(i => i.state === 'ACTIVE');
  let addModifier = 0;
  let multModifier = 1;

  activeImprovements.forEach(improvement => {
    const mods = improvement.modifiers || {};
    if (mods.coalition_construction_add) {
      addModifier += mods.coalition_construction_add;
    }
    if (mods.coalition_construction_mult) {
      multModifier *= (1 + mods.coalition_construction_mult);
    }
  });

  effectiveConstruction = (effectiveConstruction + addModifier) * multModifier;
  const dynamicBuildMult = state.coalitionModifiers?.dynamic?.improvement_build_speed_mult || 1.0;
  effectiveConstruction *= dynamicBuildMult;
  const constructionValue = Math.max(0, effectiveConstruction);

  improvements.queue.forEach(improvement => {
    if (improvement.state === 'BUILDING') {
      // Advance build progress by construction value
      improvement.buildProgress += constructionValue;

      // Check if build is complete
      if (improvement.buildProgress >= improvement.build) {
        improvement.state = 'ACTIVE';
        improvement.completedAtTick = state.turn; // Give grace period before sustainment
        const empire = state.empires.find(e => e.id === improvement.empireId);
        const empireName = empire ? empire.name : 'Unknown Empire';
        logger.info(`Improvement built: ${improvement.name} (${empireName})`);
        log.push(`{green-fg}Completed:{/green-fg} ${improvement.name} (${empireName}) is now ACTIVE`);
        const grantLog = grantImprovementUnits(state, improvement);
        log.push(...grantLog);
      }
    }

    if (improvement.state === 'ACTIVE' || improvement.state === 'DEGRADED') {
      // Release accumulated production from bank to market (happens first)
      const releaseResult = releaseProductionFromBank(state, improvement);
      log.push(...releaseResult.log);

      // Process requisition upkeep (only for ACTIVE improvements)
      if (improvement.state === 'ACTIVE' && improvement.requisitionUpkeep > 0) {
        if (!state.coalitionEconomy) {
          state.coalitionEconomy = { requisition: 0 };
        }
        if (state.coalitionEconomy.requisition === undefined || state.coalitionEconomy.requisition === null) {
          state.coalitionEconomy.requisition = 0;
        }

        // Allow requisition to go negative
        state.coalitionEconomy.requisition -= improvement.requisitionUpkeep;

        // Only log if this is a significant upkeep cost
        if (improvement.requisitionUpkeep >= 5) {
          log.push(`{yellow-fg}Upkeep:{/yellow-fg} ${improvement.name} (-${improvement.requisitionUpkeep} requisition)`);
        }
      }

      // Process sustainment
      const sustainmentResult = processImprovementSustainment(state, improvement);
      log.push(...sustainmentResult.log);

      // Process production (only if ACTIVE) - accumulates in productionBank
      if (improvement.state === 'ACTIVE') {
        const productionResult = processImprovementProduction(state, improvement);
        log.push(...productionResult.log);
      }
    }
  });

  return { log };
}
