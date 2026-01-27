# Renderer Refactoring Strategy

## Current State
- **File:** `src/ui/renderer.js` (2657 lines)
- **Functions:** 73 functions mixed together
- **Problem:** Hard to navigate, difficult to test, large cognitive load

## Completed Phase 1: Panel Factory Extraction ✓

- Created `src/ui/panelFactory.js` (350 lines)
- Extracted 13 panel creation functions
- Reducer main renderer by ~13%

## Recommended Phase 2: Incremental Extraction (Current)

Instead of massive refactoring, extract modules as needed:

### Option A: Extract by Responsibility (Recommended)
1. Create `src/ui/viewRenderers/` folder with submodules:
   - `marketViews.js` - Market, orders, commodities
   - `armyEmpireViews.js` - Armies, empires, stockpiles
   - `improvementViews.js` - Requests, queue, improvements
   - `procurementViews.js` - Procurement and detail views

2. Expand `src/ui/formatters.js`:
   - Move all formatting helpers
   - Keep formatters focused

3. New `src/ui/menuBuilders.js`:
   - buildMainMenuItems
   - buildLawMenuItems
   - buildEmergencyMenuItems
   - buildRequestMenuItems
   - buildImprovementMenuItems

4. New `src/ui/battleRenderers.js`:
   - formatActiveBattle
   - getBattleTypeTag
   - buildBattleMpBar

### Option B: Keep Main Renderer, Reorganize Internally
1. Group functions by purpose
2. Add clear section headers
3. Move less-used helpers to bottom
4. Reduce cognitive load without file splitting

## Recommendation

**Start with Option B** (internal reorganization), then gradually extract to Option A.

This approach:
- ✓ Solves the "too big" problem immediately
- ✓ No import refactoring needed right now
- ✓ Easy to extract modules later when needed
- ✓ Makes code navigation better without breaking things

## Quick Wins
1. Move helper functions to end of file (they clutter exports)
2. Group related functions with comments
3. Add table of contents at top
4. Keep panel factory import
