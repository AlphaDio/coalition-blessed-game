# Improvement Requests CLI View - Redesign

## Overview

The Improvement Requests view has been completely redesigned from scratch to provide a more intuitive, informative, and visually organized interface for managing coalition improvements.

## Key Improvements

### 1. **Categorized by Empire**
- Requests are now grouped by the empire that proposed them
- Each empire section shows the empire name with its color-coded label
- Makes it easy to see what each empire is suggesting

### 2. **Budget & Capacity Display**
- Header shows:
  - Total requisition budget available
  - Maximum total capacity allowed
  - Current building capacity in use
  - All with color coding (yellow for budget, cyan for max, green for current)

### 3. **Buildability Status**
- Each request shows:
  - ✓ (green) if you can build it right now
  - ✗ (red) if you can't afford it or don't have capacity
  - Detailed reason below each unbuildable item

### 4. **Comprehensive Hint Line**
Each request shows at a glance:
```
T2 • 250 req • cap +15 • 50/turn
```

Expandable to show:
- Tier level (T1, T2, etc.)
- Requisition cost
- Capacity requirement
- Per-turn upkeep cost (if any)
- Budget deficit (if insufficient requisition)
- Capacity deficit (if would exceed limit)

### 5. **Detailed Benefits Display**
Below each request, a detail line shows all benefits:

```
Needs: biomass: 5, plasma_fuel: 3 | Produces: power: +10, efficiency: +5 | Bonuses: industrial_output: +0.15, research_speed: +0.1
```

Broken down as:
- **Needs**: Resources required per turn (shown in red)
- **Produces**: Resources generated (shown in green)
- **Bonuses**: Coalition modifier improvements (shown in cyan)

### 6. **Description Callouts**
- Empire descriptions are displayed as gray callout text
- Helps players understand the purpose of each improvement
- Easy to scan without cluttering the main display

### 7. **Sorted & Organized**
- Within each empire: sorted by tier (ascending), then by name
- Makes progression clear (can see early/mid/late game options)
- Easy to find what you're looking for

## Display Example

```
← Back                                              [ESC]

Budget:                                              
750 requisition • Max capacity: 50 (building: 15)   

Industrial Federation [IFD]                          
  ✓ Factory Expansion                              T1 • 150 req • cap +10
      Needs: biomass: 3 | Produces: power: +5 | Bonuses: industrial_output: +0.1
      Increase industrial production capacity by 10%
      
  ✗ Advanced Forges                                T2 • 400 req • cap +15 • 30/turn
      Not enough requisition (need 350 more), Exceeds capacity limit
      Unlock master craftsmen with advanced metallurgy

Hive Collective [HIVE]                              
  ✓ Hive Extension                                 T1 • 200 req • cap +12
      Needs: biomass: 5 | Produces: growth: +8
      Expand the hive network infrastructure
```

## Visual Indicators

### Colors
- **Green**: Buildable, ready to accept
- **Red**: Not buildable, shows reason
- **Yellow**: Budget information (highlight)
- **Cyan**: Capacity and modifier information
- **Gray**: Descriptions and explanations
- **Colored empire labels**: Empire-specific color tags

### Icons
- **✓**: Can build this improvement right now
- **✗**: Cannot build (insufficient resources/capacity)
- **←**: Navigation back button

## Information Architecture

```
HEADER
├── Budget Information (requisition, capacity, building)
├── SPACER
├── EMPIRE 1
│   ├── Empire Name [Label] (header)
│   ├── Request 1 (sorted by tier, then name)
│   │   ├── Main label with buildability
│   │   ├── Hint line (costs, capacity, upkeep)
│   │   ├── Detail line (needs/produces/bonuses)
│   │   ├── [CONDITIONAL] Reason why not buildable
│   │   └── [OPTIONAL] Description text
│   ├── Request 2
│   └── SPACER
├── EMPIRE 2
│   ├── ...
```

## User Actions

### Available Actions
- **SELECT**: On a buildable request (✓)
  - Accepts the request and starts building
  - Deducts requisition cost
  - Uses capacity
  
- **NOOP**: On an unbuildable request (✗)
  - No action taken
  - Can still read details
  - Shows why it can't be built

- **BACK (ESC)**: Return to main menu

## Implementation Details

### Data Processing
1. Validate requests exist and have empire IDs
2. Filter by tier unlock requirements
3. Calculate current building capacity from active queue
4. Group requests by empire
5. Sort within each empire (tier → name)
6. Check affordability for each request

### Display Rules
- Unfilterable by empire (all categorized)
- Unaffordable requests disabled but visible
- Reasons always shown for non-buildable items
- Descriptions shown for context
- Color coding consistent throughout

### Performance
- O(n) processing where n = number of requests
- No re-sorting on each render (pre-sorted)
- Efficient filtering with early termination
- Minimal string concatenation

## Future Enhancements

- Filter toggle: Show only buildable / only from specific empire
- Sorting options: By cost, by tier, by benefit
- Comparison view: Side-by-side improvement details
- Favorites: Mark frequently-built improvements
- Cost estimation: "How many turns to save up for this?"
- Historical: "Already built X of these" counter
- Quick accept all: Accept all buildable from one empire
- Improvement categories: Group by type (Military, Infrastructure, etc.)

## Code Organization

### Main Function
- `buildRequestMenuItems(state)`: Builds the complete menu structure

### Helper Dependencies
- `isImprovementTierUnlocked()`: Check tier requirements
- `formatSuggestionLabel()`: Get empire color and label
- `formatImprovementModifier()`: Format modifier display
- `formatProgressBar()`: Format visual bars (unused in requests, used in queue)

### State Dependencies
- `state.improvements.requests`: Array of improvement requests
- `state.improvements.queue`: Current building queue (for capacity calculation)
- `state.improvements.maxTotalCapacity`: Capacity limit
- `state.coalitionEconomy.requisition`: Available budget
- `state.empires`: Empire data for labels and colors

## UI/UX Principles Applied

1. **Information Hierarchy**: Most important info (buildability) up front
2. **Progressive Disclosure**: Details only when needed
3. **Color Coding**: Quick visual scanning (green/red for critical status)
4. **Contextual Help**: Reasons shown for blocked actions
5. **Grouping**: Related items (same empire) grouped together
6. **Sorting**: Natural progression (tier level → name)
7. **Consistency**: Colors and icons used throughout
