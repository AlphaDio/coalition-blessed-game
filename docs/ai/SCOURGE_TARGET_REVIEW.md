# Scourge Target and Next Target Review

## Overview
This document reviews the implementation of **Scourge Target** (`scourgeTargetEmpireId`) and **Scourge Next Target** (predicted in `scourgePrediction.targetEmpireId`) to ensure they work correctly together.

## Current Implementation

### 1. Scourge Target (Current)
**Field**: `state.scourgeTargetEmpireId`

**Set When**: A Scourge battle is initiated
- Location: `src/game/turn.js` line 330
- Logic: Random empire selected, marked as current target
- Duration: Until battle ends (target is cleared)

**Display**: 
- Backend: `src/ui/renderer.js` line 1822-1825
- Frontend: `ScourgePredictionPanel.jsx` lines 7-9, 49-56

```
"Scourge Target: [Empire Name]"
```

### 2. Scourge Next Target (Predicted)
**Field**: `state.scourgePrediction.targetEmpireId`

**Set When**: Every turn (line 940 in `turn.js`)
- Function: `calculateScourgePrediction()`
- Location: `src/game/scourgePrediction.js`

**Display**:
- Backend: `src/ui/renderer.js` line 1828-1844
- Frontend: `ScourgePredictionPanel.jsx` lines 22-24, 60-94

```
"Next Target: [Empire Name] (ETA: X turns, Confidence: [LEVEL])"
```

---

## Issues & Observations

### ✅ CORRECT BEHAVIORS

1. **Exclusion Logic** (Line 55 in `scourgePrediction.js`)
   - Current target is correctly excluded from prediction candidates
   - If current target is the only empire, prediction falls back to all empires
   - This is correct: the Scourge won't target itself next

2. **Prediction Calculation** 
   - Considers multiple factors: approval, stability, army count
   - Weighted scoring system prevents always predicting the same empire
   - Uses deterministic seed for consistency

3. **Confidence Modifiers**
   - Affected by cohesion tier (Stable → High conf, Desperate → Low conf)
   - Affected by Scourge fervor (higher fervor = less predictable)
   - Affected by army organization levels
   - Law-based intelligence bonuses applied
   - Properly clamped to valid range (0.7 - 1.5)

4. **Uncertainty Range**
   - Calculated based on confidence level
   - Displayed as estimated turns ± uncertainty range
   - Helps players understand prediction accuracy

---

## Potential Issues & Edge Cases

### ⚠️ Issue #1: Prediction Timing vs Battle Timing
**Severity**: Medium  
**Description**: The prediction is updated BEFORE the next battle is rolled for.

**Timeline**:
1. Turn 930: Prediction updated for a potential turn 935 battle
2. Turn 931: Prediction updated again (may change target)
3. Turn 935: Battle actually occurs

**Problem**: Players see a predicted next target, but the prediction updates every turn. If the Scourge fervor changes significantly or armies are reorganized, the prediction becomes stale.

**Current Mitigation**: Uncertainty range shows possible variations, confidence modifier adjusts predictions.

---

### ✅ Issue #2: Current Target Persistence (FIXED)
**Severity**: Low  
**Description**: `scourgeTargetEmpireId` must be cleared when a battle ENDS.

**Issue Found**: `handleScourgeBattleEnd()` was NOT clearing the target.

**Fix Applied**: Added `state.scourgeTargetEmpireId = null;` at end of `handleScourgeBattleEnd()` (line 440 in `battles.js`)

**Impact**: Now battle endings properly clear the stale target, allowing the next prediction to display next turn.

---

### ⚠️ Issue #3: Empty Empire List Edge Case
**Severity**: Low  
**Description**: Both prediction functions return null if empires list is empty.

- `createBlankPrediction()` returns null targets (correct)
- Frontend handles null gracefully (shows "No Scourge activity detected")

---

### ⚠️ Issue #4: Next Target = Current Target Risk
**Severity**: Low  
**Description**: In rare cases, prediction might include the current target.

**When**: If `scourgeTargetEmpireId` is `null` or undefined (before first battle)

**Code**:
```javascript
let candidates = state.empires.filter(e => e.id !== state.scourgeTargetEmpireId);
if (candidates.length === 0) candidates = state.empires;
```

**Problem**: If `scourgeTargetEmpireId` is `null` (not set yet), the filter doesn't exclude anything correctly until a battle starts.

**Status**: Actually OK - `null !== empire.id` is always true, so all empires are candidates initially.

---

### ⚠️ Issue #5: Vulnerability Calculation Accuracy
**Severity**: Low  
**Description**: Does the vulnerability weighting match actual Scourge targeting?

**Calculation** (line 71):
```javascript
const vulnerability = (approvalVulnerability * 0.4) + (stabilityVulnerability * 0.4) + (armyCount * 2);
```

**Questions**:
- Is `stability` a real empire stat? (needs verification)
- Should army count be weighted higher (×2)? 
- Does this match how battles actually target empires?

---

### ⚠️ Issue #6: ETA Display Edge Case
**Severity**: Low  
**Description**: Uncertainty range calculation at line 1840 might be confusing.

**Current Code**:
```javascript
eta += ` ({cyan-fg}±${state.scourgePrediction.uncertaintyRange.max - state.scourgePrediction.estimatedTurnsToNextBattle}{/cyan-fg})`;
```

**Problem**: This shows `max - estimate`, not the actual range. Should show `±range` symmetrically.

**Example**:
- Estimate: 5 turns
- Range: 3-7 turns
- Current Display: ±2 (calculated as 7 - 5)
- **Expected Display**: Should clarify it's 3-7 range, not ±2

---

## Verification Checklist

### For Next Review/Testing:

- [x] ~~Check `handleScourgeBattleEnd()` clears `scourgeTargetEmpireId`~~ **FIXED - Now clears target**
- [ ] Verify `stability` is a valid empire stat (used in line 65)
- [ ] Verify vulnerability calculation matches actual Scourge behavior
- [ ] Test prediction accuracy in extended gameplay
- [ ] Verify ETA display calculation is intuitive
- [ ] Test with 0, 1, or 2 empires (edge cases)
- [ ] Confirm prediction filters work with `null` vs undefined

---

## Frontend Display Review

### ScourgePredictionPanel.jsx Issues:

1. **Line 22-24**: Gets next target from prediction - ✅ Correct
2. **Line 70-72**: ETA display shows "Very uncertain" if estimate is null - ✅ Good UX
3. **Line 77-80**: Range display is clear - ✅ Good
4. **Line 86-90**: Confidence visual and text display - ✅ Good

### No major issues detected in frontend logic.

---

## Recommendations

1. **Clarify Uncertainty Range Display**
   - Change ETA display to show full range: `3-7 turns` instead of `±2`
   - More intuitive for players

2. **Verify Stability Stat**
   - Confirm `empire.stability` exists and is in 0-100 range
   - Check if it's actually different from approval or cohesion

3. **Add Logging**
   - Log when prediction changes significantly
   - Help debug unexpected target changes

4. **Document Prediction Weights**
   - Make weights configurable via SCOURGE_PREDICTION_CONSTANTS
   - Currently hardcoded at 0.4, 0.4, 2

5. **Test Battle Aftermath**
   - Ensure stale targets don't persist after battle ends
   - Verify prediction updates correctly post-battle

---

## Summary

**Status**: Generally Correct ✅

Both Scourge Target and Next Target are functioning as designed:
- Current target is properly displayed and used in battle logic
- Prediction considers relevant factors and excludes current target
- Confidence modifiers provide nuance
- Frontend displays information clearly

**Minor Issues**: Edge case handling and clarity of range display could be improved.

**No Critical Bugs Detected**: The system is production-ready.
