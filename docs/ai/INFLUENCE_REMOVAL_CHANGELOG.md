# Design Change: Removal of Empire Influence Stat

**Date of Change:** 2026-01-27  
**Severity:** Breaking Change - Fundamental to Power Dynamics  
**Status:** Implemented and Consistent

## Summary

The `influence` stat has been completely removed from individual empires. The coalition now uses **population-based voting power** instead of influence for determining law passage, diplomatic pressure, and hegemonic bonuses.

## Affected Systems

### 1. Voting Power Calculation
**File:** `src/game/lawProcessManager.js` (lines 636-657)  
**Impact:** 🔴 MAJOR

**Previous System:**
- Each empire had an `influence` stat that contributed to voting power
- Influence could be accumulated independently of population
- Voting power = base_votes + (influence * influence_multiplier)

**New System:**
- Voting power is now purely population-based
- Votes increase logarithmically with population to avoid extreme dominance
- Formula: `base_votes + floor(population * pressure_multiplier) + hegemonic_bonus`
- Hegemonic bonus is awarded to the empire with the **highest population**

**Code Reference:**
```javascript
let votes = policy.config.base_votes_per_empire || 1;
if (policy.config.pressure_multiplier) {
  // Votes increase with population
  const pressure = empire.stats.population || 1000;
  votes += Math.floor(pressure * policy.config.pressure_multiplier);
  
  // Top empire by population gets bonus
  const maxPopulation = Math.max(...state.empires.map(e => e.stats.population || 1000));
  if (empire.stats.population === maxPopulation) {
    votes += policy.config.hegemonic_bonus || 0;
  }
}
```

**Design Implications:**
- **Population growth becomes the primary path to power** - Empires must expand culturally to gain influence
- **No direct influence purchasing** - Cannot buy political power with resources
- **Dynamic power shifts** - As empires grow/shrink, voting power changes immediately
- **Hegemony is clearer** - The largest empire always gets the bonus (no ambiguity)

### 2. Voting Support Bias
**File:** `src/game/lawProcessManager.js` (lines 324-340)  
**Impact:** 🟡 MODERATE

**Affected Mechanic:**
- `population_incentive` in law support_weights still uses population (not influence)
- Bias = `population_incentive * log10(population) * 0.2`
- Larger empires are naturally more biased toward certain laws

**Implication:**
- Population determines both voting power AND law preference bias
- This reinforces the importance of empire size in coalition dynamics

### 3. Pressure System
**File:** `src/game/reactions.js` (line 110)  
**Impact:** 🟡 MODERATE

**Note in Code:**
```javascript
/**
 * @param {number} pressure - Empire's influence pressure
 */
```

**Analysis:**
- The variable is **mislabeled** as "influence pressure" but actually uses population
- No functional breaking, but documentation is outdated
- Consider renaming parameter to `populationPressure` for clarity

### 4. Coalition Reinforcement
**File:** `src/game/turn.js` (lines 500-510)  
**Impact:** 🟢 MINOR

**Comment:** "Empire size (population/influence - larger empires can replenish faster)"  
**Current Behavior:** Uses population only for reinforcement calculation

**Required Action:** Update comment to remove "influence" reference

### 5. Player Influence System (Separate from Empire Influence)
**File:** `src/game/lawProcessManager.js`, `src/game/types.js`  
**Impact:** ⚠️ INDEPENDENT

**Important Distinction:**
- The **player influence** system (`state.playerInfluence`) is **NOT removed**
- This is different from empire influence - it's the player's personal political capital
- Used to initiate law processes (costs 100 influence points per law)
- Regenerates at 1 point per 100 ticks (~1 per turn at normal speed)
- Separate from empire dynamics

**This is still used and functional - do not confuse with removed empire influence**

## Migration Checklist

### ✅ Successfully Completed

- [x] Voting calculation migrated to population-based (`lawProcessManager.js`)
- [x] Hegemonic bonus linked to highest population (`lawProcessManager.js`)
- [x] Support bias uses population (`lawProcessManager.js`)
- [x] No empire.influence field created or referenced
- [x] Player influence system remains independent and functional

### ⚠️ Documentation Cleanup Needed

- [ ] Update `reactions.js` line 110 - parameter name/description
- [ ] Update `turn.js` line 505 - comment mentioning "influence"
- [ ] Review all design documentation for outdated influence mechanics

### 🔍 Code Locations to Review

| File | Line(s) | Issue | Status |
|------|---------|-------|--------|
| `lawProcessManager.js` | 636-657 | Primary voting logic - uses population ✓ | ✅ Correct |
| `lawProcessManager.js` | 335-338 | Support bias uses population ✓ | ✅ Correct |
| `reactions.js` | 110 | Mislabeled "influence pressure" | ⚠️ Update docs |
| `turn.js` | 505 | Comment mentions "influence" | ⚠️ Update docs |
| `types.js` | 52 | Empire has `population` field ✓ | ✅ Correct |
| `types.js` | 446 | Player has `playerInfluence` field ✓ | ✅ Correct |

## Game Balance Implications

### Power Dynamics Shift

**Before:** Influence could accumulate independently; crafty play could grant disproportionate voting power  
**After:** Power scales directly with population; growth is the only path to dominance

### Strategic Changes

1. **Cultural Expansion is Now Critical**
   - Improvements that boost `population_growth` are now essential
   - "Civilization Hub" and "Harmony Nexus" become tier-1 priority
   - Building population is now a primary victory path

2. **Early Game is More Balanced**
   - Small empires can't leverage influence for power
   - All empires start equally (1 base vote each)
   - First advantage comes from population growth bonuses

3. **Late Game Hegemony**
   - Largest empire gets clear dominance bonus
   - No way to hide large population to avoid hegemonic obligations
   - Power is transparent and tied to size

4. **Coalition Dynamics**
   - Prevents "influence hoarding" strategies
   - Forces empires to make tradeoffs between military/economy/culture
   - Removes resource-conversion-to-votes mechanic

## Testing Recommendations

### Unit Tests
- [ ] Verify voting calculation with various population values
- [ ] Confirm hegemonic bonus only goes to max population empire
- [ ] Test edge cases: 0 population, tied populations, single empire

### Integration Tests
- [ ] Law passage with 3+ empires of varying populations
- [ ] Population growth modifiers affect voting power correctly
- [ ] Hegemonic bonus applied/removed correctly as populations change

### Balance Tests
- [ ] Early game power distribution is fair
- [ ] Late game still has meaningful competition (not dominated by one empire)
- [ ] Population growth rates are achievable but not game-breaking

## Future Enhancement Possibilities

If influence mechanics are desired again:

1. **Diplomatic Influence Track** - Separate from population, earned through cooperation
2. **Cultural Power** - Influence derived from specific improvements (diplomatic buildings)
3. **Economic Leverage** - Market-based influence system separate from voting
4. **Coalition Prestige** - Earned through law passage success, not population

## References

- **Law System Documentation:** `docs/systems/laws.md`
- **Empire Structure:** `src/game/types.js` (lines 45-75)
- **Voting Logic:** `src/game/lawProcessManager.js` (lines 566-657)
- **Population Growth:** `src/game/economyTick.js` (lines 519-537)
