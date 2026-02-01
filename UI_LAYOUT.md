# Improvements System UI Layout

## Terminal UI Screenshot (Conceptual)

```
┌─ ACTIVE BATTLES ────────┬─ ACTIVE LAWS ─────────┬─ Stats ──────────────┐
│ No active battles       │ No active laws        │ Coalition: 75.0      │
│                         │                       │ Scourge: 80.0        │
│                         │                       │ Supplies: 1350       │
├─ Laws ─────────────────┼─ Event ───────────────┼─ REQUESTS ───────────┤ ← NEW!
│ > AI Citizenship       │ No active event       │ Improvement Limits:  │
│   Universal Military   │                       │   Builds: 0/3        │
│   Hive-Mind           │                       │   Capacity: 7/10     │
│                         │                       │   Potency: 10/20     │
│                         │                       │   Supplies: 1350     │
│                         ├─ Log ─────────────────┤                      │
│                         │ Turn 23               │ Available Requests:  │
│                         │ Economy tick...       │                      │
│                         │ Improvement built     │ > Basic Factory      │
│                         │                       │   Cost: 200 Supplies │
│                         │                       │   Build: 10 turns    │
│                         │                       │   Cap: 2 | Pot: 3    │
│                         │                       │   Sustain: biomass:5 │
│                         │                       │        plasma_fuel:3   │
│                         │                       │   Produces:          │
│                         │                       │     super_alloys:+15 │
│                         │                       │   Bonus:             │
│                         │                       │     industrial:+0.05 │
│                         │                       │                      │
│                         │                       │   Research Lab       │
│                         │                       │   Cost: 300 Supplies │
│                         │                       │   ...                │
└─────────────────────────┴───────────────────────┴──────────────────────┘
```

When you press **I** key, the panel switches to:

```
├─ IMPROVEMENTS ──────────┤ ← Switched from REQUESTS
│ Improvement Stats:      │
│   Building: 0/3         │
│   Active: 3             │
│   Degraded: 0           │
│   Capacity: 7/10        │
│   Potency: 10/20        │
│                         │
│ Improvements Queue:     │
│                         │
│ > Basic Factory - ACTIVE│
│   Empire: Stellar Fed   │
│   Cap: 2 | Pot: 3       │
│                         │
│   Research Lab - ACTIVE │
│   Empire: Verdant Col   │
│   Cap: 3 | Pot: 5       │
│                         │
│   Military Depot - ACTIVE│
│   Empire: Nexus Dom     │
│   Cap: 2 | Pot: 2       │
│                         │
│ Press X to cancel       │
└─────────────────────────┘
```

When an improvement is BUILDING:

```
│   Trade Hub - BUILDING (65%)│
│   Empire: Iron Collective   │
│   Remaining: 3 turns        │
```

When an improvement is DEGRADED:

```
│   Medical Center - DEGRADED │
│   Empire: Azure Alliance    │
│   Cap: 3 | Pot: 4           │
│   Degraded for 5 turns      │
```

## Color Coding (in actual terminal)

- **BUILDING**: Yellow text with progress percentage
- **ACTIVE**: Green text
- **DEGRADED**: Red text
- **Selected item**: Cyan arrow (>)
- **Supplies**: Green when sufficient, red when low
- **Modifiers**: Cyan text

## Keybinds

### Navigation
- **R**: Switch to Requests panel
- **I**: Switch to Improvements panel
- **W**: Switch to Works/Improvements Queue panel
- **S**: Switch to Stockpiles panel
- **M/A/E**: Switch to Market/Armies/Empires panels
- **[** / **]**: Cycle through all panels
- **Up/Down**: Navigate lists

### Actions
- **Enter**: Accept selected request (in Requests panel)
- **X**: Cancel selected improvement (in Improvements panel)
- **Space**: Pause/Resume game
- **Q**: Quit

## Example User Flow

1. **Start game**: `npm start`
2. **View available improvements**: Press `R`
3. **Navigate requests**: Use `Up`/`Down` arrows
4. **Select Basic Factory**: Press `Enter`
   - Supplies deducted: 1000 → 800
   - Improvement added to queue
5. **Monitor progress**: Press `I`
   - See "Basic Factory - BUILDING (30%)"
6. **Wait for completion**: 10 turns pass
   - Status changes to "Basic Factory - ACTIVE"
7. **Check production**: Press `E` to view empire
   - See stockpile increasing each turn
8. **If resources run out**:
   - Status automatically changes to "DEGRADED"
   - Shown in red with degradation timer
9. **Cancel if needed**: Select with arrows, press `X`
   - No refund given
   - Improvement removed from queue

## Integration with Existing UI

The Improvements system seamlessly integrates with existing panels:

- **Stats Panel**: Shows supplies available for improvements
- **Log Panel**: Displays improvement events (built, degraded, restored)
- **Market Panel**: Shows sustainment buy orders when toggled
- **Empires Panel**: Shows empire stockpiles affected by production

All panels update in real-time as the game progresses.
```
