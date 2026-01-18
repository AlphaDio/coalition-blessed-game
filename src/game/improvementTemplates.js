/**
 * Improvement Templates
 * Defines improvement templates and modifiers based on coalition_game_improvements.yaml
 */

import { createImprovementTemplate, createStatModifier } from './improvements.js';

/**
 * Get all improvement template definitions
 */
export function getImprovementTemplates() {
  return {
    imp_logistics_depot: createImprovementTemplate('imp_logistics_depot', {
      title: 'Logistics Depot',
      kind: 'infrastructure',
      size: 40,
      work: 120,
      supplies_cost: 30,
      
      onBuilt: [
        {
          add_stat_flat: {
            key: 'organization',
            add: 1
          }
        },
        {
          add_modifier: {
            key: 'logistics_depot_bonus',
            duration: 800
          }
        }
      ],
      
      upkeep: {
        cadence: 10,
        inputs: {
          Alloys: 2,
          Genestuff: 1
        },
        sourcing: {
          priority: ['stockpile', 'market'],
          payer: 'empire',
          delivery: 'improvement_buffer'
        }
      },
      
      production: {
        cadence: 10,
        mode: 'market_sell',
        outputs: {
          Biomass: 2
        },
        sell: {
          seller_goods_from: 'improvement_buffer',
          credit_receiver: 'empire',
          originator_tags: ['improvement_output']
        },
        stockpile_add: {
          owner: 'empire'
        }
      }
    }),
    
    imp_export_foundry: createImprovementTemplate('imp_export_foundry', {
      title: 'Export Foundry',
      kind: 'industry',
      size: 60,
      work: 180,
      supplies_cost: 50,
      
      onBuilt: [
        {
          add_stat_pct: {
            key: 'supply_efficiency',
            add: 0.10
          }
        }
      ],
      
      upkeep: {
        cadence: 10,
        inputs: {
          Biomass: 2,
          Alloys: 1
        },
        sourcing: {
          priority: ['stockpile', 'market'],
          payer: 'empire',
          delivery: 'improvement_buffer'
        }
      },
      
      production: {
        cadence: 10,
        mode: 'stockpile_add',
        outputs: {
          Alloys: 2
        },
        stockpile_add: {
          owner: 'empire'
        }
      }
    })
  };
}

/**
 * Get all modifier definitions
 */
export function getModifierDefinitions() {
  return {
    logistics_depot_bonus: createStatModifier('logistics_depot_bonus', {
      tags: ['infrastructure', 'logistics'],
      stacking: 'refresh',
      effects: [
        {
          add_stat_pct: {
            key: 'supply_efficiency',
            add: 0.05
          }
        }
      ]
    }),
    
    improvement_degraded: createStatModifier('improvement_degraded', {
      tags: ['improvement', 'penalty'],
      stacking: 'unique',
      effects: [
        {
          add_stat_pct: {
            key: 'improvement_output_mult',
            add: -0.50
          }
        }
      ]
    })
  };
}

/**
 * Get stat definitions
 */
export function getStatDefinitions() {
  return {
    organization: {
      key: 'organization',
      default_base: 0,
      min: 0,
      max: null,
      rounding: 'none'
    },
    supply_efficiency: {
      key: 'supply_efficiency',
      default_base: 0,
      min: -0.9,
      max: 5.0,
      rounding: 'none'
    },
    improvement_output_mult: {
      key: 'improvement_output_mult',
      default_base: 1.0,
      min: 0.0,
      max: 10.0,
      rounding: 'none'
    },
    approval: {
      key: 'approval',
      default_base: 0,
      min: -100,
      max: 100,
      rounding: 'floor'
    }
  };
}
