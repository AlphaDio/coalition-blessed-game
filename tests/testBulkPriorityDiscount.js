#!/usr/bin/env node

/**
 * Tests for bulk purchase priority and gross discount mechanics.
 * Verifies that larger orders are prioritized and receive a price reduction.
 */

import { initializeLogger, LogLevel } from '../src/modules/logger.js';
import { clearMarket, createMarketState, getBulkDiscount } from '../src/game/marketEconomy.js';
import { MARKET_CONSTANTS } from '../src/game/constants.js';

initializeLogger({
  level: LogLevel.ERROR,
  enableConsole: false,
  enableFile: false,
  enableUI: false
});

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`[PASS] ${message}`);
  } else {
    testsFailed++;
    console.log(`[FAIL] ${message}`);
  }
}

const APPROX_EPSILON = 0.001;

function approxEqual(a, b, epsilon = APPROX_EPSILON) {
  return Math.abs(a - b) < epsilon;
}

console.log('============================================================');
console.log('Bulk Priority & Discount Tests');
console.log('============================================================\n');

console.log('=== Test 1: getBulkDiscount Returns Correct Values ===');
{
  const threshold = MARKET_CONSTANTS.BULK_QTY_THRESHOLD;
  const maxDiscount = MARKET_CONSTANTS.BULK_DISCOUNT_MAX;

  assert(getBulkDiscount(0) === 0, 'Zero qty has no discount');
  assert(getBulkDiscount(threshold) === 0, 'At threshold, no discount');
  assert(getBulkDiscount(threshold - 1) === 0, 'Below threshold, no discount');
  assert(getBulkDiscount(threshold + 1) > 0, 'Just above threshold, some discount');
  assert(
    approxEqual(getBulkDiscount(threshold * 2), maxDiscount),
    'At 2x threshold, discount is at max'
  );
  assert(
    approxEqual(getBulkDiscount(threshold * 10), maxDiscount),
    'Far above threshold, discount caps at max'
  );
  assert(
    approxEqual(getBulkDiscount(threshold * 1.5), maxDiscount * 0.5),
    'At 1.5x threshold, discount is half of max'
  );
}
console.log();

console.log('=== Test 2: Larger Buy Orders Are Prioritized Over Smaller Ones ===');
{
  const marketState = createMarketState('biomass', 5.0);

  // Two buy orders at the same priority and price, but different quantities.
  // The larger one should fill first if supply is limited.
  const buyOrders = [
    {
      id: 'small_buy',
      owner_type: 'empire',
      owner_id: 'empire_1',
      commodity: 'biomass',
      qty: 5,
      filled_qty: 0,
      max_price: 10,
      priority: 1,
      category: 'needs'
    },
    {
      id: 'large_buy',
      owner_type: 'empire',
      owner_id: 'empire_2',
      commodity: 'biomass',
      qty: 50,
      filled_qty: 0,
      max_price: 10,
      priority: 1,
      category: 'needs'
    }
  ];

  const sellOffers = [
    {
      id: 'sell_1',
      owner_type: 'empire',
      owner_id: 'empire_3',
      commodity: 'biomass',
      qty: 30,
      filled_qty: 0,
      ask_price: 5,
      priority: 0
    }
  ];

  const result = clearMarket(buyOrders, sellOffers, marketState);

  // The large buy order (qty=50) should be matched first due to bulk priority.
  // With only 30 supply, the large order gets 30, the small order gets 0.
  const largeFilled = buyOrders.find(o => o.id === 'large_buy').filled_qty;
  const smallFilled = buyOrders.find(o => o.id === 'small_buy').filled_qty;

  assert(largeFilled === 30, 'Large buy order fills first when supply is limited');
  assert(smallFilled === 0, 'Small buy order gets nothing when large order consumes all supply');
}
console.log();

console.log('=== Test 3: Bulk Orders Receive Gross Discount On Trade Price ===');
{
  const marketState = createMarketState('biomass', 10.0);
  const threshold = MARKET_CONSTANTS.BULK_QTY_THRESHOLD;

  // One bulk buy order well above the threshold
  const bulkBuyOrders = [
    {
      id: 'bulk_buy',
      owner_type: 'empire',
      owner_id: 'empire_1',
      commodity: 'biomass',
      qty: threshold * 2, // 40 units - should get max discount
      filled_qty: 0,
      max_price: 10,
      priority: 1,
      category: 'needs'
    }
  ];

  const sellOffers = [
    {
      id: 'sell_bulk',
      owner_type: 'empire',
      owner_id: 'empire_2',
      commodity: 'biomass',
      qty: threshold * 2,
      filled_qty: 0,
      ask_price: 8,
      priority: 0
    }
  ];

  const result = clearMarket(bulkBuyOrders, sellOffers, marketState);

  assert(result.trades.length > 0, 'Bulk order trades are created');
  const tradePrice = result.trades[0].price;
  const expectedPrice = 8 * (1 - MARKET_CONSTANTS.BULK_DISCOUNT_MAX);
  assert(
    approxEqual(tradePrice, expectedPrice),
    `Bulk order gets discounted price (${tradePrice.toFixed(2)} ≈ ${expectedPrice.toFixed(2)})`
  );
}
console.log();

console.log('=== Test 4: Small Orders Pay Full Price (No Discount) ===');
{
  const marketState = createMarketState('biomass', 10.0);
  const threshold = MARKET_CONSTANTS.BULK_QTY_THRESHOLD;

  // One small buy order below the threshold
  const smallBuyOrders = [
    {
      id: 'small_buy',
      owner_type: 'empire',
      owner_id: 'empire_1',
      commodity: 'biomass',
      qty: threshold - 5, // well below threshold
      filled_qty: 0,
      max_price: 10,
      priority: 1,
      category: 'needs'
    }
  ];

  const sellOffers = [
    {
      id: 'sell_small',
      owner_type: 'empire',
      owner_id: 'empire_2',
      commodity: 'biomass',
      qty: threshold,
      filled_qty: 0,
      ask_price: 8,
      priority: 0
    }
  ];

  const result = clearMarket(smallBuyOrders, sellOffers, marketState);

  assert(result.trades.length > 0, 'Small order trades are created');
  const tradePrice = result.trades[0].price;
  assert(
    approxEqual(tradePrice, 8),
    `Small order pays full ask price (${tradePrice.toFixed(2)} = 8.00)`
  );
}
console.log();

console.log('=== Test 5: Priority Tier Still Takes Precedence Over Bulk Size ===');
{
  const marketState = createMarketState('biomass', 10.0);

  // A small high-priority order should fill before a large low-priority order
  const buyOrders = [
    {
      id: 'large_low_pri',
      owner_type: 'empire',
      owner_id: 'empire_1',
      commodity: 'biomass',
      qty: 100,
      filled_qty: 0,
      max_price: 10,
      priority: 0, // low priority
      category: 'wants'
    },
    {
      id: 'small_high_pri',
      owner_type: 'empire',
      owner_id: 'empire_2',
      commodity: 'biomass',
      qty: 5,
      filled_qty: 0,
      max_price: 10,
      priority: 2, // high priority
      category: 'needs'
    }
  ];

  const sellOffers = [
    {
      id: 'sell_limited',
      owner_type: 'empire',
      owner_id: 'empire_3',
      commodity: 'biomass',
      qty: 5,
      filled_qty: 0,
      ask_price: 5,
      priority: 0
    }
  ];

  const result = clearMarket(buyOrders, sellOffers, marketState);

  const highPriFilled = buyOrders.find(o => o.id === 'small_high_pri').filled_qty;
  const lowPriFilled = buyOrders.find(o => o.id === 'large_low_pri').filled_qty;

  assert(highPriFilled === 5, 'High priority order fills fully despite being smaller');
  assert(lowPriFilled === 0, 'Low priority large order gets nothing when high priority consumes all');
}
console.log();

console.log('=== Test 6: Partial Bulk Discount Scales Linearly ===');
{
  const marketState = createMarketState('biomass', 10.0);
  const threshold = MARKET_CONSTANTS.BULK_QTY_THRESHOLD;
  const maxDiscount = MARKET_CONSTANTS.BULK_DISCOUNT_MAX;

  // Order at 1.5x threshold should get 50% of max discount
  const partialBulkOrders = [
    {
      id: 'partial_bulk',
      owner_type: 'empire',
      owner_id: 'empire_1',
      commodity: 'biomass',
      qty: Math.round(threshold * 1.5),
      filled_qty: 0,
      max_price: 10,
      priority: 1,
      category: 'needs'
    }
  ];

  const sellOffers = [
    {
      id: 'sell_partial',
      owner_type: 'empire',
      owner_id: 'empire_2',
      commodity: 'biomass',
      qty: 100,
      filled_qty: 0,
      ask_price: 8,
      priority: 0
    }
  ];

  const result = clearMarket(partialBulkOrders, sellOffers, marketState);

  const tradePrice = result.trades[0].price;
  const expectedDiscount = maxDiscount * 0.5;
  const expectedPrice = 8 * (1 - expectedDiscount);
  assert(
    approxEqual(tradePrice, expectedPrice),
    `Partial bulk order gets proportional discount (${tradePrice.toFixed(3)} ≈ ${expectedPrice.toFixed(3)})`
  );
}
console.log();

console.log('=== Test 7: Bulk Constants Are Exported Correctly ===');
{
  assert(
    typeof MARKET_CONSTANTS.BULK_QTY_THRESHOLD === 'number' && MARKET_CONSTANTS.BULK_QTY_THRESHOLD > 0,
    'BULK_QTY_THRESHOLD is a positive number'
  );
  assert(
    typeof MARKET_CONSTANTS.BULK_DISCOUNT_MAX === 'number' &&
    MARKET_CONSTANTS.BULK_DISCOUNT_MAX > 0 &&
    MARKET_CONSTANTS.BULK_DISCOUNT_MAX < 1,
    'BULK_DISCOUNT_MAX is between 0 and 1'
  );
}
console.log();

console.log(`============================================================`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`============================================================`);

if (testsFailed > 0) {
  process.exit(1);
}
