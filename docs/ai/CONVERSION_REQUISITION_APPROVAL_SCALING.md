# Conversion Requisition - 10x Multiplier with Approval Scaling

## Summary

Requisition obtained from empire consumption conversion has been increased **10-fold** and now scales based on the consuming empire's approval rating.

## Changes Made

### 1. **Consumption Tracking Architecture**
   - **Before**: Consumption was tracked globally by commodity type
   - **After**: Consumption is now tracked per empire: `empireId -> { commodity -> quantity }`
   - This allows us to apply per-empire approval scaling

### 2. **New Constant**
   - Added `CONVERSION_REQUISITION_MULTIPLIER = 10` in `consumptionToRequisition.js`
   - This multiplier applies to all conversion-based requisition generation

### 3. **Updated Functions**

#### `recordConsumption(commodityId, quantity, empireId)`
   - **New parameter**: `empireId` - identifies which empire is consuming
   - Tracks consumption per empire for later approval scaling

#### `calculateConsumptionValue(market, empireId)`
   - **New parameter**: `empireId` (optional)
   - When provided, calculates consumption value for a specific empire only
   - When not provided, uses old behavior

#### `getRecordedConsumption(commodityId, empireId)`
   - **New parameter**: `empireId` (optional)
   - When provided, returns consumption for that empire
   - When not provided, returns total across all empires

#### `processConsumptionToRequisition(market, coalitionEconomy, modifiers, empires)`
   - **New parameter**: `empires` array (required for approval access)
   - **New logic**: Processes each empire's consumption separately
   - **Approval scaling**: 
     ```
     scaledCoalitionValue = baseCoalitionValue × 10 × (approval / 100)
     ```
   - If an empire has 100 approval: receives 10x multiplier
   - If an empire has 50 approval: receives 5x multiplier
   - If an empire has 0 approval: receives no conversion requisition
   - Enhanced logging shows per-empire breakdown with approval percentage

### 4. **Integration Points**

#### `turn.js`
   - Updated `processEmpireStockpileConsumption()` to pass `empire.id` to `recordConsumption()`
   - Updated the call to `processConsumptionToRequisition()` to pass `state.empires`

## Formula

For each empire that consumes commodities:

```
requisitionGained = (consumedValue × shareRate × 10 × approval%) / 1000
```

Where:
- `consumedValue` = total credit value of consumed commodities (at market prices)
- `shareRate` = coalition consumption share rate (default 10%, modified by laws)
- `10` = CONVERSION_REQUISITION_MULTIPLIER
- `approval%` = empire's approval rating (0-100) divided by 100
- `1000` = CREDITS_PER_REQUISITION conversion rate

## Examples

**Example 1: Empire consumes 100k credits worth, 100 approval**
- Base: 100,000 × 0.10 (share) = 10,000 credits
- With 10x multiplier and approval: 10,000 × 10 × 1.0 = 100,000 credits
- Result: 100 requisition gained

**Example 2: Empire consumes 100k credits worth, 50 approval**
- Base: 100,000 × 0.10 (share) = 10,000 credits
- With 10x multiplier and approval: 10,000 × 10 × 0.5 = 50,000 credits
- Result: 50 requisition gained

**Example 3: Empire consumes 100k credits worth, 0 approval**
- Base: 100,000 × 0.10 (share) = 10,000 credits
- With 10x multiplier and approval: 10,000 × 10 × 0 = 0 credits
- Result: 0 requisition gained

## Impact

- **High approval empires** are heavily rewarded - their consumption now generates 10x more requisition
- **Low/no approval empires** generate minimal or zero requisition from consumption
- **Incentivizes approval management** - maintaining empire approval directly impacts coalition requisition income
- **Coalition economy becomes approval-dependent** for a significant portion of requisition generation
