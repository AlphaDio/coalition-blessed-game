# Battle System Refactoring Summary

## Overview
This document summarizes the battle system refactoring completed as part of the consolidation of armies and the battle system.

## Changes Implemented

### 1. Organization Now Determines Battle Participation (Not Battlefield Width)

**Previous Behavior:**
- Organization determined how much of the battlefield width an army could utilize
- Formula: `widthUtilization = organization / 100`
- Engagement = `min(battlefieldSize * widthUtilization, army.mp.current)`

**New Behavior:**
- Organization determines how much of an army's manpower can participate
- Formula: `participationRate = organization / 100`
- Engagement = `min(battlefieldSize, participatingMP) * brokenPenalty`
- Where `participatingMP = army.mp.current * participationRate`

**Impact:**
- Better represents organizational capacity to deploy forces
- Army with 90% organization can deploy 90% of its manpower
- Army with 30% organization can only deploy 30% of its manpower
- Battlefield size is now independent of organization

**Code Changes:**
- `src/game/frontBattles.js`: Renamed `widthUtilization()` to `participationRate()`
- Updated `calculateEngagedUnits()` to use participation instead of width scaling

---

### 2. Recovery Extracted as Independent Stat

**Previous Behavior:**
- Recovery was tied to a fixed `recoveryRate` stat (e.g., 500 MP/tick)
- No relationship to organization or other army characteristics

**New Behavior:**
- New `recovery` stat added to armies (0-100 scale)
- Recovery rate formula: `baseRate = recovery * 10`
- Organization provides a modifier: `modifier = 0.5 + (organization / 100)`
- Final rate: `recoveryRate = baseRate * modifier`
- Range: 0.5x to 1.5x based on organization

**Impact:**
- Armies can have different recovery capabilities
- Organization still affects recovery but doesn't directly determine it
- Example rates:
  - Recovery 80, Org 60: 880 MP/tick
  - Recovery 20, Org 60: 220 MP/tick
  - Recovery 50, Org 100: 750 MP/tick
  - Recovery 50, Org 0: 250 MP/tick

**Code Changes:**
- `src/game/types.js`: Added `recovery` parameter to `createArmy()`
- `src/game/frontBattles.js`: Updated `applyRecovery()` with new formula
- `src/game/battles.js`: Updated Scourge army and combined army creation
- `src/game/content.js`: Pass recovery stat from module data
- `modules/armies/*.ds.yml`: Added recovery values (48-58) to all armies

---

### 3. Insurrection Armies Excluded from Scourge Battles

**Previous Behavior:**
- All armies with organization > 30 participated in Scourge battles
- No check for insurrection status

**New Behavior:**
- Rebellious armies (in active insurrections) are excluded from Scourge battles
- They only participate in Insurrection battles on the opposite side
- Filter logic:
  1. Collect all rebellious army IDs from active insurrections
  2. Exclude these IDs when selecting Scourge battle participants
  3. Filter: `!rebelliousArmyIds.has(a.id)`

**Impact:**
- More realistic: armies in rebellion don't fight external threats
- Insurrection armies focus on internal conflict
- Scourge battles only include loyal coalition forces

**Code Changes:**
- `src/game/turn.js`: Added insurrection filtering to Scourge battle setup
- Checks `state.insurrections` for active rebellions
- Builds `rebelliousArmyIds` Set for efficient lookup

---

### 4. Space/Galaxy Theme Applied

**Empire Renames:**
1. **The Northern Federation** → **Stellar Federation**
   - Industrial powerhouse spanning multiple star systems
   
2. **The Southern Alliance** → **Verdant Colonies**
   - Agricultural worlds and biosphere engineers
   
3. **The Eastern Republic** → **Nexus Dominion**
   - Strategic hyperspace crossroads and military power
   
4. **The Brass Continuum** → **Quantum Collective**
   - Synthetic minds networked across quantum space
   
5. **Chorus Synapse** → **Synaptic Swarm**
   - Hive-mind collective spanning multiple worlds

**Army Renames:**
1. **1st Northern Division** → **1st Stellar Battle Fleet**
   - Elite starship fleet
   
2. **Southern Guard** → **Verdant Planetary Guard**
   - Defense forces of colonies
   
3. **Eastern Fleet Marines** → **Nexus Hyperspace Marines**
   - Elite jump troops

**Code Changes:**
- `modules/empires/*.ds.yml`: Updated names and descriptions
- `modules/armies/*.ds.yml`: Updated names and descriptions
- Maintained all gameplay stats and mechanics

---

## Testing

### Test Results
All tests pass successfully:

1. **Determinism Tests**: ✅ Pass
   - Law enactment produces identical results with same seed
   
2. **Front Battle Tests**: ✅ Pass
   - Morale regen stops after hitting 0
   - Morale refills after battle ends
   - Battlefield size impacts damage throughput
   - Kill rate creates permanent losses
   - Recovery pool mechanics work correctly
   
3. **Extended Gameplay Tests**: ✅ Pass
   - Coalition victory scenario
   - Coalition defeat scenario
   - Law enactment over time
   - Battle outcomes over time
   - Economy stability
   - Rapid turn advancement
   - Multiple concurrent systems

### Code Quality
- **Code Review**: ✅ No issues found
- **Security Scan**: ✅ No vulnerabilities detected

### Demo Script
Created `demoRefactoring.js` to showcase:
- Space-themed empire and army names
- Organization determining participation
- Recovery as independent stat with org modifier
- Insurrection armies excluded from Scourge battles

---

## Files Modified

### Core Game Logic
- `src/game/types.js` - Added recovery parameter to createArmy()
- `src/game/frontBattles.js` - Changed participation calculation, updated recovery
- `src/game/battles.js` - Updated Scourge and combined army stats
- `src/game/turn.js` - Added insurrection filtering for Scourge battles
- `src/game/content.js` - Pass recovery stat from modules

### Module Data
- `modules/empires/empire_1.ds.yml` - Stellar Federation
- `modules/empires/empire_2.ds.yml` - Verdant Colonies
- `modules/empires/empire_3.ds.yml` - Nexus Dominion
- `modules/empires/empire_clockwork.ds.yml` - Quantum Collective
- `modules/empires/empire_hive.ds.yml` - Synaptic Swarm
- `modules/armies/army_1.ds.yml` - 1st Stellar Battle Fleet + recovery stat
- `modules/armies/army_3.ds.yml` - Verdant Planetary Guard + recovery stat
- `modules/armies/army_4.ds.yml` - Nexus Hyperspace Marines + recovery stat

### Tests
- `testFrontBattles.js` - Updated to use new recovery stat

### Documentation
- `demoRefactoring.js` - Demonstration script

---

## Migration Notes

### For Existing Save Games
If save game compatibility is needed:
- Default `recovery = 50` for armies without this stat
- Calculate from old `recoveryRate` if available: `recovery = recoveryRate / 10`

### For Modders
When creating new armies, include the `recovery` stat:
```yaml
army_data:
  id: "my_army"
  empireId: "my_empire"
  name: "My Army Name"
  organization: 70
  fervor: 60
  aggravation: 50
  recovery: 55  # NEW: 0-100 scale
```

Recommended recovery values:
- Elite/Fast recovery: 55-60
- Standard: 48-52
- Poor/Slow recovery: 40-45

---

## Later change: Reinforcement vs recovery (wounded)

In a subsequent refactor, the semantics were clarified:
- **Reinforcement**: Reserves joining the line *during* the battle (`reinforcementRate`). The old during-battle "recovery" (pool → MP) was renamed to reinforcement.
- **Recovery (wounded)**: Temporary damage goes to `woundedPool`; wounded are retired from the battle and added back to the army *only when the battle ends*. Armies have both `reinforcementRate` and `recoveryRate`/`recovery`. See `docs/systems/battles.md` for current behavior.

---

## Summary

This refactoring successfully implements all requirements:
✅ Organization determines battle participation (not battlefield width)
✅ Recovery is an independent stat (with organization as modifier)
✅ Insurrection armies excluded from Scourge battles
✅ Space/Galaxy theme applied to empires and armies

All tests pass, no security issues, and the system is ready for deployment.
