import { getLogger } from '../../../modules/logger.js';
import { RATIONING_CONSTANTS } from '../../constants.js';
import { getSupplyEfficiencyMultiplier, getEmpireSupplyEfficiency } from '../../economyTick/ordersPhase.js';
import { IMPROVEMENT_SUSTAINMENT_TICKS } from '../types.js';
import { nextOrderId } from './orderIds.js';
import { createBuyOrder } from '../../marketEconomy.js';

const SUSTAINMENT_ORDER_PRIORITY = 800;
const SUSTAINMENT_ORDER_MAX_DURATION = 6;
const SUSTAINMENT_BACKLOG_TICKS = IMPROVEMENT_SUSTAINMENT_TICKS * 2;

/**
 * Process sustainment for an improvement
 * Uses internal stockpile to buffer 10 ticks of sustainment needs
 */
export function processImprovementSustainment(state, improvement) {
  const logger = getLogger();
  const log = [];
  const empire = state.empires.find(e => e.id === improvement.empireId);

  if (!empire) {
    // Empire no longer exists, degrade improvement
    if (improvement.state !== 'DEGRADED') {
      improvement.state = 'DEGRADED';
      improvement.degradedSince = state.turn;
      log.push(`{yellow-fg}DEGRADED:{/yellow-fg} ${improvement.name} (Empire not found)`);
    }
    return { log };
  }

  // Check if sustainment is needed
  const sustainmentNeeds = improvement.sustainmentCost;
  let allSatisfied = true;
  const shortages = [];

  const population = empire.stats?.population || 1;

  // Calculate effective rationing and supply efficiency (matches economyTick consumption)
  const baseRationing = RATIONING_CONSTANTS.BASE_RATIONING;
  const rationingAdd = state.coalitionModifiers?.rationing_add || 0;
  const rationingMult = state.coalitionModifiers?.rationing_mult || 1.0;
  const effectiveRationing = Math.max(
    RATIONING_CONSTANTS.MIN_RATIONING,
    Math.min(RATIONING_CONSTANTS.MAX_RATIONING, (baseRationing + rationingAdd) * rationingMult)
  );
  const supplyEfficiencyMultiplier = getSupplyEfficiencyMultiplier(state);
  const empireEff = getEmpireSupplyEfficiency(empire, state);
  const empireMult = Math.max(0, 1 - empireEff);

  for (const [commodity, qty] of Object.entries(sustainmentNeeds)) {
    const needed = Math.ceil(qty * population * effectiveRationing * supplyEfficiencyMultiplier * empireMult);

    if (needed <= 0) continue;

    // Check internal stockpile first
    const stockpile = improvement.stockpile[commodity] || 0;
    if (stockpile >= needed) {
      improvement.stockpile[commodity] -= needed;
      continue;
    }

    let remainingNeed = needed - stockpile;
    improvement.stockpile[commodity] = 0;

    // Use empire stockpile or requisition if available
    if (commodity === 'requisition') {
      const available = state.coalitionEconomy?.requisition || 0;
      const used = Math.min(available, remainingNeed);
      if (state.coalitionEconomy) {
        state.coalitionEconomy.requisition = available - used;
      }
      remainingNeed -= used;
    } else {
      const empireStockpile = empire.stockpiles?.[commodity] || 0;
      if (empireStockpile >= remainingNeed) {
        empire.stockpiles[commodity] -= remainingNeed;
        remainingNeed = 0;
      } else {
        empire.stockpiles[commodity] = 0;
        remainingNeed -= empireStockpile;
      }
    }

    // Restock internal stockpile if we have extra
    if (remainingNeed <= 0) {
      const remainingStockpileCapacity = improvement.maxStockpile - (improvement.stockpile[commodity] || 0);
      if (remainingStockpileCapacity > 0) {
        const empireStockpile = commodity === 'requisition'
          ? (state.coalitionEconomy?.requisition || 0)
          : (empire.stockpiles?.[commodity] || 0);

        const amountToAdd = Math.min(empireStockpile, remainingStockpileCapacity);
        if (amountToAdd > 0) {
          if (commodity === 'requisition') {
            if (!state.coalitionEconomy) {
              state.coalitionEconomy = { requisition: 0 };
            }
            state.coalitionEconomy.requisition = Math.max(0, (state.coalitionEconomy.requisition || 0) - amountToAdd);
          } else {
            if (!empire.stockpiles) {
              empire.stockpiles = {};
            }
            empire.stockpiles[commodity] -= amountToAdd;
          }
          improvement.stockpile[commodity] = (improvement.stockpile[commodity] || 0) + amountToAdd;
        }
      }
      continue;
    }

    // If still not satisfied, queue a market buy order
    if (remainingNeed > 0) {
      // Create market buy order if market exists
      if (state.market && state.market[commodity]) {
        const marketState = state.market[commodity];
        const maxPrice = marketState.price;

        if (!state.marketOrders) {
          state.marketOrders = { buyOrders: [], sellOffers: [] };
        }

        const existing = state.marketOrders.buyOrders.find(order =>
          order.owner_type === 'empire' &&
          order.owner_id === empire.id &&
          order.commodity === commodity &&
          order.tags?.purpose === 'sustainment' &&
          order.tags?.originator === improvement.id &&
          (order.filled_qty || 0) < order.qty
        );

        const backlogCap = Math.max(needed, Math.ceil(needed * SUSTAINMENT_BACKLOG_TICKS));

        if (existing) {
          const existingFilled = Math.max(0, existing.filled_qty || 0);
          const existingOutstanding = Math.max(0, existing.qty - existingFilled);
          const cappedOutstanding = Math.min(existingOutstanding, backlogCap);
          const room = Math.max(0, backlogCap - cappedOutstanding);
          const queuedNow = Math.min(remainingNeed, room);

          // Clamp legacy oversized orders and only add demand up to backlog cap.
          existing.qty = existingFilled + cappedOutstanding + queuedNow;
          existing.max_price = maxPrice;
          existing.priority = Math.max(existing.priority || 0, SUSTAINMENT_ORDER_PRIORITY);
          existing.category = 'needs';
          existing.duration = 0;
          existing.max_duration = Number.isFinite(existing.max_duration) ? existing.max_duration : SUSTAINMENT_ORDER_MAX_DURATION;
        } else {
          const initialQty = Math.min(remainingNeed, backlogCap);
          const buyOrder = createBuyOrder(
            nextOrderId('sustain'),
            'empire',
            empire.id,
            commodity,
            initialQty,
            maxPrice,
            SUSTAINMENT_ORDER_PRIORITY,
            SUSTAINMENT_ORDER_MAX_DURATION
          );
          buyOrder.category = 'needs';
          buyOrder.fee = 1;
          buyOrder.tags = {
            originator: improvement.id,
            payer: empire.id,
            beneficiary: improvement.id,
            purpose: 'sustainment'
          };
          state.marketOrders.buyOrders.push(buyOrder);
        }
      }

      allSatisfied = false;
      shortages.push(commodity);
    }
  }

  // Update improvement state based on sustainment success
  improvement.ticksSinceSustained++;

  // Skip sustainment check during grace period (first tick after completion)
  const inGracePeriod = improvement.completedAtTick && (state.turn - improvement.completedAtTick) < 1;

  if (allSatisfied) {
    improvement.ticksSinceSustained = 0;

    // Restore to ACTIVE if was DEGRADED
    if (improvement.state === 'DEGRADED') {
      improvement.state = 'ACTIVE';
      improvement.degradedSince = null;
      log.push(`{green-fg}Restored:{/green-fg} ${improvement.name} is now ACTIVE`);
      logger.info(`Improvement restored: ${improvement.name}`);
    }
  } else if (!inGracePeriod && improvement.ticksSinceSustained >= IMPROVEMENT_SUSTAINMENT_TICKS) {
    // Degrade after 10 ticks of failed sustainment
    if (improvement.state !== 'DEGRADED') {
      improvement.state = 'DEGRADED';
      improvement.degradedSince = state.turn;
      log.push(`{yellow-fg}DEGRADED:{/yellow-fg} ${improvement.name} (Missing: ${shortages.join(', ')}, ${improvement.ticksSinceSustained} ticks)`);
      logger.warn(`Improvement degraded: ${improvement.name} - shortages: ${shortages.join(', ')}, ${improvement.ticksSinceSustained} ticks without sustainment`);
    }
  }

  return { log };
}
