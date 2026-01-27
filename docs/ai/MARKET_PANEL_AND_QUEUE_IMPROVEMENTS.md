# Market Panel and Building Queue Improvements

## Changes Made

### 1. Market Panel - Volume-Based Display

**File**: `coalition-frontend/src/components/MarketPanel.jsx`

#### Changes:
- **Removed Floor Price Column**: No longer displaying floor prices in the market table
- **Volume Instead of Order Count**: Changed from counting individual orders to summing order volumes
- **Simplified Table**: Market table now shows Commodity, Price, Buy Volume, Sell Volume, Traded Volume
- **Improvements Details Section**: Now displays building and active improvements with technical details

#### How It Works:

```javascript
// Calculate total buy volume for each commodity
const buyVolume = (marketOrders.buyOrders || [])
  .filter(o => o.commodity === key && (o.filled_qty || 0) < o.qty)
  .reduce((sum, o) => sum + (o.qty - (o.filled_qty || 0)), 0);

// Calculate total sell volume for each commodity
const sellVolume = (marketOrders.sellOffers || [])
  .filter(o => o.commodity === key && (o.filled_qty || 0) < o.qty)
  .reduce((sum, o) => sum + (o.qty - (o.filled_qty || 0)), 0);
```

**Benefits:**
✅ Shows actual market depth (how much supply/demand exists)  
✅ More useful for trading decisions  
✅ Cleaner table without floor price  
✅ Quick view of improvements being built/active with technical details  

---

### 2. Building Queue - Compact with Technical Details

**File**: `coalition-frontend/src/components/BuildingQueue.jsx`

#### Changes:
- **Compact Layout**: Queue items now use a more condensed layout
- **Technical Details Display**: Shows improvement modifiers and supply upkeep
- **Inline Turns Counter**: Turns remaining displayed inline with empire name using ⏱ emoji
- **Unified Progress Display**: Combined progress percentage and stats on one line

#### New Helper Function:

```javascript
const formatTechnicalDetails = (improvement) => {
  const techParts = [];
  
  // Add supply upkeep if present
  if (improvement.supplyUpkeep) {
    techParts.push(`${improvement.supplyUpkeep} supply/turn`);
  }
  
  // Format modifiers (handle percentage values)
  const modKeys = Object.keys(improvement.modifiers || {});
  if (modKeys.length > 0) {
    const modStr = modKeys.map(k => {
      const val = improvement.modifiers[k];
      if (typeof val === 'number' && val > 0 && val < 1) {
        return `+${(val * 100).toFixed(0)}% ${k.replace(/_/g, ' ')}`;
      }
      return `${val} ${k.replace(/_/g, ' ')}`;
    }).join(' • ');
    techParts.push(modStr);
  }
  
  return techParts.join(' • ');
};
```

#### Queue Item Layout:

```
[Name] [Empire] [Turns]⏱
[========Progress Bar========]
[%% Progress] [Current/Total]
[Technical Details • Supply/Turn]
```

**Benefits:**
✅ More compact - shows more improvements at once  
✅ Technical details visible without clicking  
✅ Faster decision making with all info at a glance  
✅ Consistent with improvements panel technical details  

---

### 3. Market Panel - Improvements Details Section

**Display**: Shows building and active improvements below the market table

**Format**:
```
BUILDING
  [Improvement Name]
  [Technical Details with modifiers and supply upkeep]

ACTIVE
  [Improvement Name]
  [Technical Details with modifiers and supply upkeep]
```

**Benefits:**
✅ Quick visibility into empire improvements without switching tabs  
✅ Technical details shown at a glance  
✅ Understand the economic impact of improvements  

---

### 4. Market Table Structure

| Column | Shows | Source |
|--------|-------|--------|
| Commodity | Product name | Mapping + key |
| Price | Current market price | `market.price_by_commodity` |
| Buy | Total unfilled buy volume | Sum of `buyOrders` quantities |
| Sell | Total unfilled sell volume | Sum of `sellOffers` quantities |
| Traded | Volume traded this tick | `market.traded_volume` |

---

### 5. Technical Details Display

The `formatTechnicalDetails` function handles:

**Modifiers:**
- Percentage values (0-1): Displayed as "+X%"
- Integer values: Displayed as "+X"
- Example: `{empire_approval: 5, population_growth: 0.05}` → "+5 empire approval • +5% population growth"

**Supply Upkeep:**
- Example: `supplyUpkeep: 2` → "2 supply/turn"

---

## CSS Classes Added

| Class | Purpose |
|-------|---------|
| `.queue-item.compact` | Compact building queue item styling |
| `.queue-item-header` | Header with name, empire, turns |
| `.queue-item-technical` | Technical details display with monospace font |
| `.improvements-list-compact` | Container for improvements list in market panel |
| `.improvements-subtitle` | Subtitle for "Building" or "Active" sections |
| `.improvement-item-compact` | Individual improvement item in compact list |
| `.item-technical` | Technical details in compact list |

---

## Impact

✅ **Market Panel**: More accurate market depth visualization + quick improvements overview  
✅ **Building Queue**: Compact yet information-rich display  
✅ **Consistency**: Technical details shown everywhere improvements appear  
✅ **UX**: Better decision-making with more info visible at once  
✅ **Performance**: Less switching between tabs needed  

---

## Frontend Files Modified

- `coalition-frontend/src/components/MarketPanel.jsx` (lines 27-175)
- `coalition-frontend/src/components/BuildingQueue.jsx` (lines 21-86)
- `coalition-frontend/src/styles/Panels.css` (added compact and improvements-list classes)

---

## Related Documentation

- Building Queue Component: `src/components/BuildingQueue.jsx`
- Market Data Structure: `src/game/economyTick.js`
- Improvements Modifiers: `src/game/improvements/types.js`
- Market Orders Format: `src/game/types.js` (line 476)

