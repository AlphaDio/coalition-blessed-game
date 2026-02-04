# Front Battles Implementation Summary

## Overview
Successfully implemented Front Battles as a complete engine module and UI panel for the Coalition Game TUI, following the specification for MP-axis battles with morale badges and lockout mechanics.

## Implementation Details

### 1. Data Model Extensions

#### Army Type (`src/game/types.js`)
- **MP Pools**: `mp.current`, `mp.max` (default: 10000/10000)
- **Morale Pools**: `mo.current`, `mo.max` (default: 100/100)
- **Combat Stats**:
  - `dmgPerUnitMP`: 2.0 (MP damage per engaged unit per tick)
  - `dmgPerTickMO`: 5.0 (morale pressure per tick, NOT width-scaled)
  - `protection`: 0.2 (MP damage resistance)
  - `resolve`: 0.3 (MO damage resistance)
  - `killRate`: 0.1 (fraction of MP damage that becomes permanent)
- **Sustain Stats**:
  - `woundedPool`: Temporary (non-permanent) MP losses; wounded are retired from the battle and returned to the army only when the battle ends.
  - `recoveryRate` / `recovery`: Wounded-return rate (used for combined armies; currently all wounded are returned at battle end).
  - `reinforcementRate`: Reserves joining the line during the battle (default 100; in-battle rate is 10% of this).

#### BattleFront Type (`src/game/types.js`)
- `id`: Unique battle identifier
- `state`: ACTIVE | ENDED
- `battlefieldSize`: Width affecting MP throughput (default: 1000)
- `leftArmyId`, `rightArmyId`: Participating armies
- `moraleBroken`: { left: bool, right: bool } - Morale lockout flags
- `permanentLosses`: { left: number, right: number } - Permanent MP losses
- `startedAtTick`, `endedAtTick`: Battle lifecycle tracking

### 2. Battle Engine (`src/game/frontBattles.js`)

#### Core Simulation Loop: `simulateBattleTick(front, worldState)`
For each side attacking the other:

1. **Engagement Width Calculation** (MP throughput only)
   - Based on: battlefield size, army organization, current MP
   - Broken morale applies 50% penalty to width utilization
   - Formula: `engagedUnits = min(battlefieldSize * orgUtil * brokenPenalty, mp.current)`

2. **Manpower Damage** (width-scaled)
   - Raw damage: `engagedUnits * dmgPerUnitMP`
   - Apply modifiers: fervor (±20%), organization (±10%)
   - Apply protection resistance
   - Split: permanent = damage * killRate, temporary = damage - permanent
   - Update MP and wounded pool (temporary → woundedPool); track permanent losses. Wounded do not re-enter the fight during the battle.

3. **Morale Damage** (NOT width-scaled)
   - Raw damage: `dmgPerTickMO` (constant per tick)
   - Apply modifiers and resolve resistance
   - When MO hits 0 for first time: set `moraleBroken[side] = true`
   - Emit `morale_broken` event

4. **Morale Regeneration**
   - Only if `!moraleBroken[side]`
   - Regen: 0.5 + (organization/100 * 1.5) per tick

5. **Reinforcement (during battle only)**
   - Reinforcement: Add MP from reserves (up to reinforcementRate; in battle 10% of that). No during-battle return of wounded.

6. **End Conditions**
   - Battle ends when either side's MP ≤ 0 (shattered).
   - On end: return each army's woundedPool to mp.current (capped by mp.max), clear woundedPool; refill both armies' MO to max, reset broken flags.
   - Emit `battle_ended` event (includes woundedReturned, reinforcedMP).

#### Helper Functions
- `widthUtilization(org)`: Linear scaling 0-100% based on organization
- `calculateEngagedUnits()`: Computes throughput with broken penalty
- `getEffectiveKillRate()`: Base + fervor bonus (up to +5%)
- `applyModifiers()`: Fervor and organization damage scaling
- `calculateMoraleRegen()`: Organization-based regen calculation

#### Event System
- Events stored in `worldState.battleEvents[]`
- Event types: `battle_started`, `morale_broken`, `battle_ended`
- Each event includes type, data, and tick timestamp

### 3. Integration (`src/game/turn.js`)
- Added import: `simulateBattleTick`, `getActiveBattles`
- Integrated into `advanceTurn()` before old battle systems
- Simulates all ACTIVE battles each tick

### 4. UI Panel (`src/ui/renderer.js`)

#### Active Fronts Panel
- Grid position: rows 3-4, cols 3-8 (between Event and Log)
- Shows only ACTIVE battles
- For each battle displays:
  - Battle ID and army names
  - MP values: `current/max` for each side
  - Morale badges: `[M]` = intact (green), `[B]` = broken (red)
  - MP axis bar: Visual representation using █ characters
  - Metadata: battlefield size, battle duration

Example display:
```
battle_1_army_1_army_2
1st Northern Division [M] 6444/10000  ████████████████████████  2097/10000 [B] 2nd Northern Division
Field Size: 1200, Turn: 5
```

### 5. Testing (`testFrontBattles.js`)

All 5 tests passing:
1. **Morale regen stops after hitting 0**: Verifies moraleBroken flag prevents regen
2. **Morale refills after battle ends**: Verifies MO restoration and flag reset
3. **Battlefield size impacts MP damage**: Verifies larger field = more throughput
4. **killRate creates permanent losses**: Verifies damage split (perm vs temp)
5. **Wounded pool mechanics**: Verifies temporary damage → wounded pool during battle, no return until battle end; wounded returned to armies when battle ends

### 6. Verification Scripts

- `verifyUI.js`: Text-based UI rendering verification
- `demoFrontBattles.js`: Interactive TUI demo with live battle simulation

## Engineering Constraints Met

✓ Simple, deterministic, testable math  
✓ All pools and resists clamped (0-max)  
✓ No Advantage system  
✓ Battlefield size affects MP throughput only  
✓ Morale damage never depends on size  
✓ Clean, well-named functions  
✓ Event hooks for system integration  

## Test Results

```
✓ Morale regen stops after hitting 0
✓ Morale refills fully after battle ends
✓ Battlefield size impacts MP damage
✓ killRate creates permanent losses
✓ Recovery pool mechanics
✓ ALL TESTS PASSED
```

Existing tests (testDeterminism.js) also pass, confirming no regressions.

## Files Modified/Created

**Modified:**
- `src/game/types.js` - Extended Army, added BattleFront
- `src/game/turn.js` - Integrated battle simulation
- `src/ui/renderer.js` - Added Active Fronts panel

**Created:**
- `src/game/frontBattles.js` - Complete battle engine (333 lines)
- `testFrontBattles.js` - Comprehensive test suite (309 lines)
- `verifyUI.js` - UI verification script (163 lines)
- `demoFrontBattles.js` - Interactive demo (85 lines)

## Usage

### Starting a Battle
```javascript
import { startBattle } from './src/game/frontBattles.js';

const front = startBattle(worldState, 'army_1', 'army_2', 1200);
// Emits 'battle_started' event
```

### Running Tests
```bash
node testFrontBattles.js     # Front battles tests
node testDeterminism.js      # Existing tests (still pass)
node verifyUI.js             # UI verification
```

### Demo
```bash
node demoFrontBattles.js     # Interactive TUI demo
```

## Notes

- Event emission uses `worldState.battleEvents[]` for loose coupling
- Inline object creation in `startBattle()` avoids circular dependency
- All damage calculations composable for future enhancements
- War Funds distribution can easily influence reinforcementRate
- System ready for scripted retreat events (future feature)
