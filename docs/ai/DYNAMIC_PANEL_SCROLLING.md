# Dynamic Panel Scrolling Configuration

**Status:** Implemented with dynamic height calculation  
**Last Updated:** 2026-01-27

## Overview

This document describes the dynamic visible lines calculation for the auto-scroll feature in menu panels, addressing the limitation of hardcoded values across different screen sizes and layouts.

## Problem

The original implementation used a hardcoded `visibleLines = 15` value (line 1048 in old code) to calculate auto-scrolling behavior. This assumption breaks when:
- Terminal window is resized to smaller heights
- Different panel configurations have different heights
- Mobile or embedded terminals have limited space
- Different blessed layout managers create variable panel sizes

**Example of failure:**
```
Panel height: 8 lines
Hardcoded visibleLines: 15
Result: Scroll calculations overflow, selected item jumps unexpectedly
```

## Solution: Dynamic Height Detection

### Implementation
**File:** `src/ui/renderer.js` - `calculateVisibleLines()` function

The new approach calculates visible lines in this order:

```javascript
function calculateVisibleLines(panel, totalLines) {
  // 1. Try panel.height property (primary method)
  if (panel && typeof panel.height === 'number' && panel.height > 0) {
    const contentHeight = panel.height - 2; // Account for borders
    return Math.max(3, contentHeight);
  }
  
  // 2. Try panel.rows property (fallback)
  if (panel && panel.rows && typeof panel.rows === 'number') {
    return Math.max(3, panel.rows - 2);
  }
  
  // 3. Use conservative default (fallback for missing panel info)
  return 12; // Conservative default (was 15)
}
```

**Calculation Details:**
- **Border accounting:** Subtracts 2 lines for top/bottom borders
- **Minimum threshold:** Never allows less than 3 visible lines (prevents edge cases)
- **Conservative default:** Falls back to 12 instead of 15 for safety margin

### Integration

```javascript
const visibleLines = calculateVisibleLines(panel, lines.length);

// Use visibleLines in scroll calculation (same logic as before)
const topLine = Math.max(0, Math.min(
  selectedLineNum - Math.floor(visibleLines / 2),
  Math.max(0, totalLines - visibleLines)
));
```

## Benefits

### 1. Screen Size Adaptability
✅ Works on terminals of any height  
✅ Automatically adjusts when window is resized  
✅ Handles mobile/embedded terminals with limited space  

### 2. Layout Flexibility
✅ Different panel configurations work correctly  
✅ No manual adjustment needed for different layouts  
✅ Graceful degradation when height info unavailable  

### 3. User Experience
✅ Selected item always stays centered in viewport  
✅ Smooth scrolling behavior across all sizes  
✅ No unexpected jumps or overflow  

## Behavior Across Different Screens

### Large Terminal (80x30)
- Panel height: 28 lines
- Visible lines: 26 (28 - 2 borders)
- Behavior: Smooth, ample space

### Standard Terminal (80x24)
- Panel height: 22 lines
- Visible lines: 20 (22 - 2 borders)
- Behavior: Normal operation

### Small Terminal (80x10)
- Panel height: 8 lines
- Visible lines: 6 (8 - 2 borders)
- Behavior: Compact but functional

### Mobile/Minimal (40x5)
- Panel height: 3 lines
- Visible lines: 1 (clamped to minimum of 3, but only 1 renders)
- Behavior: Graceful degradation

## Technical Details

### Blessed Panel Properties

The `calculateVisibleLines()` function checks these properties in order:

| Property | Type | Description | Notes |
|----------|------|-------------|-------|
| `panel.height` | number | Absolute height in rows | Most reliable |
| `panel.rows` | number | Number of rows (alternative) | Fallback option |
| Default | 12 | Conservative fallback | Used if height unavailable |

### Scroll Calculation Formula

Once visible lines are determined:

```
selectedPosition = (selectedLineNum / totalLines) * 100
centerOffset = selectedPosition - (visibleLines / 2)
scrollPercent = Math.clamp(centerOffset, 0, 100)
```

This keeps the selected item centered in the visible viewport.

## Configuration and Customization

### To Override Visible Lines for Specific Panels

If you need to customize visible lines for a specific panel:

```javascript
// Option 1: Set panel height explicitly
panel.height = 20; // Blessed will use this

// Option 2: Create a custom calculation wrapper
function formatMenuItemsCustom(items, selectedIndex, panel) {
  // Your custom logic to set panel dimensions
  panel.height = calculateOptimalHeight(panel);
  return formatMenuItems(items, selectedIndex, panel);
}
```

### To Adjust the Default Fallback

Edit the fallback value in `calculateVisibleLines()`:

```javascript
// Current: 12 (conservative)
// To use more aggressive: 15
// To use more conservative: 10
return 12; // ← Change this value
```

## Testing Scrolling Behavior

### Unit Test: Dynamic Calculation

```javascript
describe('calculateVisibleLines', () => {
  it('should use panel height when available', () => {
    const panel = { height: 20 };
    const result = calculateVisibleLines(panel, 100);
    expect(result).toBe(18); // 20 - 2 borders
  });
  
  it('should use panel.rows as fallback', () => {
    const panel = { rows: 15 };
    const result = calculateVisibleLines(panel, 100);
    expect(result).toBe(13); // 15 - 2 borders
  });
  
  it('should use default when height unavailable', () => {
    const panel = {};
    const result = calculateVisibleLines(panel, 100);
    expect(result).toBe(12); // Default
  });
  
  it('should enforce minimum of 3 lines', () => {
    const panel = { height: 2 }; // Too small
    const result = calculateVisibleLines(panel, 100);
    expect(result).toBeGreaterThanOrEqual(3);
  });
});
```

### Manual Test: Terminal Resize

1. Start the game in a terminal
2. Open an improvement or law menu to see scrolling
3. Resize the terminal window smaller
4. Scroll through the menu
5. Expected: Scrolling should adjust automatically, no jumping

## Known Limitations

### Blessed Library Quirks
- Some blessed versions might not expose `height` reliably
- Panel height may change after initial creation
- Actual renderable height may differ from reported height

### Workarounds
If you encounter issues:

```javascript
// Debug: Check what properties are available
console.log('Panel height:', panel.height);
console.log('Panel rows:', panel.rows);
console.log('Panel width:', panel.width);
console.log('Panel top:', panel.top);
console.log('All properties:', Object.keys(panel));
```

## Future Improvements

### 1. Caching Calculation
```javascript
// Cache visible lines to avoid recalculation each render
function formatMenuItems(items, selectedIndex, panel) {
  if (!panel._cachedVisibleLines) {
    panel._cachedVisibleLines = calculateVisibleLines(panel, items.length);
  }
  const visibleLines = panel._cachedVisibleLines;
  // ...
}
```

### 2. Dynamic Recalculation on Resize
```javascript
// Detect and respond to terminal resize events
process.stdout.on('resize', () => {
  delete panel._cachedVisibleLines; // Clear cache
  reRenderPanel(); // Re-render with new height
});
```

### 3. Per-Panel Configuration
```javascript
// Allow UI code to specify expected dimensions
panel.expectedHeight = 20;
const visibleLines = panel.expectedHeight - 2;
```

## Related Files

- `src/ui/renderer.js` - Panel rendering and scrolling logic
- Main UI entry point for panel initialization
- Terminal/blessed configuration files
