import { PRODUCTION_EFFICIENCY_CONSTANTS } from '../constants.js';
import { applySupplyCommodityMultiplier } from '../economyBalance.js';
import { allocateSustainmentFromLocalProduction } from '../improvements/engine/sustainment.js';

export function emitEmpireProduction(state, aggregateSellOffer) {
  state.empires.forEach(empire => {
    if (!empire.production || !empire.production.outputs_per_tick) return;

    const population = empire.stats?.population || 1;
    const empireMultiplier = empire.modifiers?.multiplication || 1.0;
    const productionMultiplier = (1 + (state.coalitionModifiers.empire_production_multiplier || 0)) * empireMultiplier;

    // Calculate effective production efficiency with modifiers
    const baseEfficiency = PRODUCTION_EFFICIENCY_CONSTANTS.BASE_EFFICIENCY;
    const efficiencyAdd = state.coalitionModifiers?.production_efficiency_add || 0;
    const efficiencyMult = state.coalitionModifiers?.production_efficiency_mult || 1.0;
    const effectiveEfficiency = Math.max(
      PRODUCTION_EFFICIENCY_CONSTANTS.MIN_EFFICIENCY,
      Math.min(PRODUCTION_EFFICIENCY_CONSTANTS.MAX_EFFICIENCY, (baseEfficiency + efficiencyAdd) * efficiencyMult)
    );

    Object.entries(empire.production.outputs_per_tick).forEach(([commodity, qty]) => {
      if (qty > 0) {
        const rawQty = qty * population * productionMultiplier * effectiveEfficiency *
          (1 + (state.coalitionModifiers.industrial_output || 0) + (state.coalitionModifiers.industrialOutputBonus || 0));
        const modifiedQty = applySupplyCommodityMultiplier(commodity, rawQty);
        const reservedForSustainment = allocateSustainmentFromLocalProduction(state, empire.id, commodity, modifiedQty);
        const qtyForMarket = Math.max(0, modifiedQty - reservedForSustainment);
        if (qtyForMarket <= 0) {
          return;
        }
        const marketPrice = state.market[commodity]?.price || 1.0;
        const askPrice = marketPrice;

        aggregateSellOffer('empire', empire.id, commodity, qtyForMarket, askPrice, 0);
      }
    });
  });
}
