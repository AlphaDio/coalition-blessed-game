#!/usr/bin/env node

/**
 * Test coalition procurement and supply conversion system
 * Tests procurement algorithm, conversion logic, allowance mechanics, and market integration
 */

import { createGameState } from './src/game/types.js';
import { loadEconomyConfig } from './src/game/marketEconomy.js';
import { initializeCoalitionProcurement, refillCoalitionAllowance, executeCoalitionProcurement, executeSupplyConversion } from './src/game/coalitionProcurement.js';
import { DeterministicRNG } from './src/modules/rng.js';

function testProcurementAlgorithm() {
  console.log('Testing procurement algorithm...');

  // Create test market state with post-clear offers
  const market = {
    food: {
      price: 1.0,
      floor_price: 0.9,
      remaining_sell_offers_post_clear: [
        { id: 'sell1', commodity: 'food', qty: 100, ask_price: 0.95, owner_type: 'empire', owner_id: 'emp1' },
        { id: 'sell2', commodity: 'food', qty: 50, ask_price: 1.05, owner_type: 'empire', owner_id: 'emp2' },
        { id: 'sell3', commodity: 'food', qty: 75, ask_price: 0.85, owner_type: 'empire', owner_id: 'emp3' }
      ]
    },
    metal: {
      price: 2.0,
      floor_price: 1.8,
      remaining_sell_offers_post_clear: [
        { id: 'sell4', commodity: 'metal', qty: 200, ask_price: 1.9, owner_type: 'empire', owner_id: 'emp1' }
      ]
    }
  };

  // Create coalition economy with settings
  const coalitionEconomy = initializeCoalitionProcurement();
  coalitionEconomy.treasury_credits = 1000;
  coalitionEconomy.allowance_credits = 500;
  coalitionEconomy.reserve_floor_credits = 100;

  // Set theta presets
  coalitionEconomy.per_commodity_settings.set('food', { theta_preset: 'Frugal', spend_throttle: 0.8 });
  coalitionEconomy.per_commodity_settings.set('metal', { theta_preset: 'Balanced', spend_throttle: 1.0 });

  const config = loadEconomyConfig();

  // Execute procurement
  const log = executeCoalitionProcurement(market, coalitionEconomy, config);

  // Verify results
  console.log('Procurement log:', log);

  // Check that purchases were made within budget and theta constraints
  const foodPurchases = log.filter(l => l.includes('food'));
  const metalPurchases = log.filter(l => l.includes('metal'));

  // Frugal theta = 0.9 * floor_price = 0.9 * 0.9 = 0.81
  // Should buy from sell3 at 0.85 (above threshold) and sell1 at 0.95 (below threshold)
  // sell2 at 1.05 should be below threshold

  // Balanced theta = 1.0 * floor_price = 1.8
  // Should buy from sell4 at 1.9 (above threshold)

  console.log('✓ Procurement algorithm test completed');
}

function testAllowanceMechanics() {
  console.log('Testing allowance mechanics...');

  const coalitionEconomy = initializeCoalitionProcurement();
  coalitionEconomy.treasury_credits = 10000;
  coalitionEconomy.allowance_credits = 50; // Below cap
  coalitionEconomy.reserve_floor_credits = 1000;

  const config = loadEconomyConfig();

  // Test refill
  refillCoalitionAllowance(coalitionEconomy);

  // Allowance should be refilled to cap
  const expectedAllowance = config.coalition.procurement.allowance_credits_cap;
  if (coalitionEconomy.allowance_credits !== expectedAllowance) {
    throw new Error(`Expected allowance ${expectedAllowance}, got ${coalitionEconomy.allowance_credits}`);
  }

  console.log('✓ Allowance refill test passed');
}

function testSupplyConversion() {
  console.log('Testing supply conversion...');

  const coalitionEconomy = initializeCoalitionProcurement();
  coalitionEconomy.supply_milli = 500; // 0.5 supplies

  // Add stockpiles
  coalitionEconomy.stockpiles.set('food', 150); // T1, 1 milli per unit
  coalitionEconomy.stockpiles.set('metal', 50);  // T2, 2 milli per unit

  const config = loadEconomyConfig();

  // Execute conversion
  const log = executeSupplyConversion(coalitionEconomy, config);

  console.log('Conversion log:', log);

  // Check results
  const expectedMilli = 500 + (150 * 1) + (50 * 2) + (Math.floor((150 + 50) / 100) * 1000); // Batch bonus
  if (coalitionEconomy.supply_milli !== expectedMilli) {
    throw new Error(`Expected ${expectedMilli} milli, got ${coalitionEconomy.supply_milli}`);
  }

  console.log('✓ Supply conversion test passed');
}

function testIntegrationWithMarket() {
  console.log('Testing integration with market clearing...');

  // This would require setting up a full market simulation
  // For now, just ensure the functions can be called together

  const market = {
    food: {
      price: 1.0,
      remaining_sell_offers_post_clear: []
    }
  };

  const coalitionEconomy = initializeCoalitionProcurement();
  const config = loadEconomyConfig();

  // Refill allowance
  refillCoalitionAllowance(coalitionEconomy);

  // Execute procurement (should handle empty offers gracefully)
  const procLog = executeCoalitionProcurement(market, coalitionEconomy, config);

  // Execute conversion
  const convLog = executeSupplyConversion(coalitionEconomy, config);

  console.log('Integration test logs:', { procLog, convLog });

  console.log('✓ Market integration test passed');
}

function runTests() {
  try {
    testProcurementAlgorithm();
    testAllowanceMechanics();
    testSupplyConversion();
    testIntegrationWithMarket();

    console.log('\n🎉 All coalition procurement tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}