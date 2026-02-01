# Improvements System

## Overview
The Improvements system implements a deterministic, queue-based infrastructure management system where empires can build and maintain improvements that provide production outputs and stat modifiers. The system enforces concurrency limits, requires ongoing sustainment, and features a "Degraded" state when maintenance fails.

## Design Goals
- Deterministic simulation with seeded RNG support
- Clear separation between simulation logic and UI
- Economy integration with order tagging (originator, payer, beneficiary)
- Transparent concurrency and resource management
- Intuitive terminal UI with keyboard controls

## Core Components

### Improvement Requests
Available improvements that can be started. Each empire maintains a queue of suggested improvements. Empires can be suggested the same improvement multiple times if they're already building it or have already requested it elsewhere - this allows for flexibility in coalition strategy.

Each request defines:
- **Name & Description**: Display information
- **Requisition Cost**: Paid upfront when accepted (no refunds on cancellation)
- **Build Duration**: Number of turns to complete construction
- **Capacity & Potency**: Concurrency metrics that limit total active improvements
- **Sustainment Cost**: Resources consumed per tick to keep improvement active
- **Production Outputs**: Resources produced per tick when active
- **Modifiers**: Stat bonuses applied to empires/armies (including fervor bonuses for armies)
- **Requisition Upkeep**: Ongoing requisition cost per tick
- **Tags**: Categorization for filtering and effects

### Suggestion System
- Each empire starts with 3 improvement suggestions at game start
- When an empire accepts and begins building an improvement, a replacement suggestion is immediately generated
- Suggestions are drawn from available improvements weighted by tier unlock status
- The same improvement can be suggested multiple times to an empire, allowing strategic flexibility

### Improvement Queue
Active improvements in various states:
- **BUILDING**: Under construction, advances buildProgress each tick
- **ACTIVE**: Operational, consuming sustainment and producing outputs
- **DEGRADED**: Sustainment failed, no production until restored

### Concurrency System
The current implementation enforces a single build-capacity limit:
- **Max Total Capacity**: Sum of capacity for BUILDING improvements only (default: 5)

## Game Loop Integration

### Turn Sequence
1. **Law Processes** (existing)
2. **Economy Tick** (existing)
3. **Improvements Tick** ← NEW
   - Advance build progress
   - Process sustainment
   - Apply production outputs
   - Update modifiers
4. **Population Growth** ← NEW
   - Apply baseline growth (0.5% per turn) + improvement modifiers (per tick)
5. **Law Cooldowns** (existing)
6. **Events** (existing)
7. **Battles** (existing)

### Sustainment Flow
Each tick, for each active/degraded improvement:
1. Check empire stockpiles for required commodities
2. Deduct from stockpile if available
3. If insufficient, create market buy order with tags:
   - `originator`: improvement ID
   - `payer`: empire ID
   - `beneficiary`: improvement ID
   - `purpose`: 'sustainment'
4. If all needs met: restore to ACTIVE (if was DEGRADED)
5. If any shortage: degrade to DEGRADED state

### Production Flow
Each tick, for each ACTIVE improvement:
1. Inject outputs into empire stockpiles
2. Optionally create market sell offers (disabled by default)
3. Apply modifiers to empire/army stats

## Economy Integration

### Order Tagging
All improvement-related market orders include:
```javascript
tags: {
  originator: 'improvement_id',  // Who created the order
  payer: 'empire_id',            // Who pays credits
  beneficiary: 'improvement_id', // Who receives goods
  purpose: 'sustainment' | 'production'
}
```

### Market Priority
- Sustainment buy orders: priority 800 (high)
- Production sell offers: priority 500 (medium)
- Max price for sustainment: 2x current market price

## UI Components

### Requests Panel
Navigate to Requests view with `R` key:
- Shows available improvement requests
- Displays cost, build duration, capacity
- Shows sustainment costs and production outputs
- Lists stat modifiers
- Navigate with Up/Down arrows
- Accept with Enter key

### Stockpiles Panel
Navigate to Stockpiles view with `S` key:
- Shows aggregated commodities from all empires' stockpiles
- Displays coalition-level stockpiles (supplies)
- Sorted by commodity tier and name
- Provides comprehensive view of coalition resources

### Panel Switching
- `M`: Market Economy view
- `A`: Armies view
- `E`: Empires view
- `R`: Requests view ← NEW
- `I`: Improvements view ← NEW
- `W`: Works/Improvements Queue view ← NEW
- `S`: Stockpiles view ← NEW
- `[` / `]`: Cycle through views

## Sample Improvements

These epic mega-structures and grand events represent the peak of civilization's achievement:

### Titan Forge Network
- Cost: 200 Supplies
- Build: 10 turns
- Capacity: 2, Potency: 3
- Sustains: biomass:5, plasma_fuel:3
- Produces: super_alloys:15
- Modifier: industrial_output +5%
- Description: Galaxy-spanning industrial mega-structure harvesting stellar matter

### Ascension Spire
- Cost: 300 Supplies
- Build: 15 turns
- Capacity: 3, Potency: 5
- Sustains: super_alloys:3, rare_gases:2
- Produces: rare_gases:8, quantum_circuits:2
- Modifiers: research_speed +15%
- Description: Colossal monument to knowledge pursuing transcendent breakthroughs

### Grand War Symposium
- Cost: 150 Supplies
- Build: 8 turns
- Capacity: 2, Potency: 2
- Sustains: super_alloys:4, biomass:6
- Modifiers: army_organization +5, supply_efficiency +8%
- Description: Galactic convocation coordinating fleets across a thousand battlefronts

### Festival of Worlds
- Cost: 250 Supplies
- Build: 12 turns
- Capacity: 3, Potency: 4
- Sustains: biomass:5, genomes:3, psycho_implants:1
- Produces: genomes:4
- Modifiers: population_growth +3%, empire_approval +2
- Description: Massive celebration spanning star systems, uniting billions

### Convergence Nexus
- Cost: 180 Supplies
- Build: 10 turns
- Capacity: 2, Potency: 3
- Sustains: plasma_fuel:4, rare_gases:2
- Modifiers: trade_income +500 credits/tick, market_efficiency +5%
- Description: Hyperspatial marketplace where civilizations exchange wealth and wonders

## Stat Modifiers

### Army Modifiers
- `army_organization`: Boosts organization recovery (applied gradually)
- `army_fervor`: Increases army fervor per tick (scales with army population, multiplied by 100 for testing)
- `supply_efficiency`: Reduces supply consumption

### Empire Modifiers
- `empire_approval`: Increases approval rating (applied gradually)
- `population_growth`: Increases population over time (baseline 0.5% per turn, modifiers applied per tick)
- `trade_income`: Generates credits per tick
- `market_efficiency`: Reduces market costs

### Research Modifiers
- `research_speed`: Accelerates technology research

### Production Modifiers
- `industrial_output`: Increases production efficiency

## Acceptance Rules

### Prerequisites
1. Sufficient requisition in coalition economy
2. Not exceeding max total capacity for BUILDING improvements

### On Acceptance
- Requisition deducted immediately from coalition economy
- Improvement added to queue in BUILDING state
- Build progress starts at 0

### On Cancellation
- Improvement removed from queue
- No refund of requisition
- BUILDING capacity limit is recalculated after removal

## Degradation Mechanics

### Triggers
- Missing any sustainment commodity for 1 tick
- Empire no longer exists

### Effects
- State changes to DEGRADED
- Production outputs cease
- Stat modifiers no longer applied
- Build capacity limit only applies while BUILDING

### Recovery
- Automatically restores to ACTIVE when sustainment resumes
- Tracks degradation duration for display

## Data Flow

### Input
- Player commands (accept request, cancel improvement)
- Empire stockpiles

- Market state (for buy orders)

### Processing
1. Accept/cancel operations modify queue
2. Each tick:
   - Advance build progress
   - Check sustainment needs
   - Apply production outputs
   - Update modifiers
   - Track degradation

### Output
- Updated improvement queue
- Market buy/sell orders
- Empire stockpile changes
- Stat modifier applications
- UI rendering data

## Testing

### Test Coverage
- System initialization
- Request acceptance with validation
- Build progress tracking
- Build completion
- Concurrency limits enforcement
- Capacity limit enforcement
- Degradation triggers and recovery
- Cancellation (no refund)
- Production outputs
- Deterministic behavior

### Running Tests
```bash
npm run test:improvements
```

## Integration Points

### Files
- `src/game/improvements/definitions.js`: Improvement catalog and tier system
- `src/game/improvements/engine.js`: Core system logic and queue management
- `src/game/improvements/index.js`: Main exports and initialization
- `src/game/improvements/types.js`: Type definitions and constants
- `src/game/improvements/ui.js`: UI components and rendering
- `src/game/coalitionProcurement.js`: Requisition system integration
- `src/game/turn.js`: Turn loop integration
- `src/ui/renderer.js`: UI rendering (Requests/Improvements views)
- `src/ui/input.js`: Keyboard handlers

### Dependencies
- Economy system: For market orders and fulfillment
- Coalition Procurement system: For requisition management and bank conversion
- Empire system: For ownership and stat modifiers
- Turn system: For tick processing
- Logger: For debug/info messages

## Future Enhancements

### Possible Additions
- Empire selection UI when accepting requests
- Tech tree prerequisites for advanced improvements
- Upgrade paths (tier 1 → tier 2)
- Regional bonuses based on empire location
- Event-triggered special improvements
- Automated priority-based acceptance
- Production chain optimization
- Improvement templates from YAML config

### Extensibility Points
- Custom modifier application logic
- Pluggable degradation rules
- Dynamic concurrency limits based on game state
- Integration with policy/law system
- Achievement tracking for improvement milestones
