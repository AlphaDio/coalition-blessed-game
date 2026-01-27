# Market Orders Sync Fix

## Problem

The Market view was not displaying the correct number of buy/sell orders. The buy and sell column counts were not syncing with the actual market orders from the backend.

## Root Cause

**Issue 1: Incorrect data source for market orders**

The component was accessing:
- `market.buy_offers?.[key]` - aggregate count metadata
- `market.sell_offers?.[key]` - aggregate count metadata

But the actual active market orders are in:
- `state.marketOrders.buyOrders[]` - array of buy order objects
- `state.marketOrders.sellOffers[]` - array of sell order objects

**Issue 2: Incorrect improvements data access**

The component was looking for non-existent properties:
```javascript
// WRONG
const activeImprovements = improvements.active || [];  // ❌ doesn't exist
const buildingImprovements = improvements.building || [];  // ❌ doesn't exist
```

Should filter from `improvements.queue` like other components do.

## Solution

### 1. Access Market Orders Correctly

Changed from accessing aggregate counts to filtering actual orders:

```javascript
// BEFORE (WRONG)
buy: market.buy_offers?.[key] || 0,
sell: market.sell_offers?.[key] || 0,

// AFTER (CORRECT)
const buyCount = (marketOrders.buyOrders || [])
  .filter(o => o.commodity === key && (o.filled_qty || 0) < o.qty).length;

const sellCount = (marketOrders.sellOffers || [])
  .filter(o => o.commodity === key && (o.filled_qty || 0) < o.qty).length;

buy: buyCount,
sell: sellCount,
```

### 2. Fix Improvements Data Access

Changed to filter from the correct queue structure:

```javascript
// BEFORE (WRONG)
const activeImprovements = improvements.active || [];
const buildingImprovements = improvements.building || [];

// AFTER (CORRECT)
const buildingImprovements = (improvements.queue || []).filter(imp => imp.state === 'BUILDING');
const activeImprovements = (improvements.queue || []).filter(imp => imp.state === 'ACTIVE' || imp.state === 'DEGRADED');
```

## Files Modified

- `coalition-frontend/src/components/MarketPanel.jsx` (lines 5-51)

## Impact

✅ **Market View** now correctly displays the count of active buy and sell orders for each commodity  
✅ **Real-time sync** - Market order counts update as orders are placed/filled  
✅ **Improvements Status** now correctly shows building and active improvement counts  
✅ **Data consistency** between backend market state and frontend display  

## Backend Data Structure

```javascript
state.marketOrders = {
  buyOrders: [
    {
      id: "order-123",
      owner_id: "empire-1",
      commodity: "super_alloys",
      qty: 100,
      filled_qty: 30,  // 70 remaining
      max_price: 15.50
    },
    // ... more buy orders
  ],
  sellOffers: [
    {
      id: "offer-456",
      owner_id: "empire-2",
      commodity: "super_alloys",
      qty: 200,
      filled_qty: 0,   // 200 remaining
      ask_price: 14.25
    },
    // ... more sell offers
  ]
}

// An order/offer is active if: filled_qty < qty
```

## Related Code

- Backend market clearing: `src/game/economyTick.js` (lines 79-580)
- CLI market view: `src/ui/renderer.js` (lines 1250-1290)
- Market data structure: `src/game/types.js` (line 476)
