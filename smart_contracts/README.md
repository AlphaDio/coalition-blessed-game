# Coalition Game Solidity (Anvil-Ready)

This folder contains an EVM-friendly Coalition game core implemented in Solidity, designed to be played through transactions on a local Anvil chain.

## What is implemented

- `src/CoalitionGame.sol`
  - Empire and army creation/state.
  - Turn progression (`advanceTurn`) with pooled requisition release cadence (default every 15 turns).
  - Resource consumption APIs for empires and armies:
    - `consumeEmpireResource(...)`
    - `consumeArmyResource(...)`
  - Per-resource threshold consumption rules with configurable effects.
  - Battle resolution that damages real army state (`currentMP`), not snapshots.
  - Army experience and level-based surge bonus for next battles.
  - Coalition intel/confidence/requisition state.

- Event extensibility (expandable events side)
  - Hook pipeline for core lifecycle points:
    - `HOOK_EMPIRE_CONSUMED`
    - `HOOK_ARMY_CONSUMED`
    - `HOOK_BATTLE_RESOLVED`
    - `HOOK_TURN_ADVANCED`
  - `upsertEventTemplate(...)` for data-driven event definitions (metadata URI + hook binding).
  - External module interface (`ICoalitionEventModule`) and registry.
  - Registered modules receive hook payloads and can mutate core via module host API (`ICoalitionModuleHost`).

- Example module
  - `src/modules/SentientCoreIntelModule.sol`
  - Demonstrates extending behavior by awarding intel when sentient core consumption reaches module-defined thresholds.

- Tests
  - `test/CoalitionGame.t.sol`
  - Covers requisition cadence, army threshold effects, battle MP damage, and module-driven intel gain.

## Project layout

- `foundry.toml` Foundry config
- `src/` contracts
- `test/` solidity tests
- `scripts/play_local.ps1` one-command local demo flow

## Run locally with Anvil

1. Start Anvil:

```bash
anvil
```

2. Build + test:

```bash
cd smart_contracts
forge build
forge test
```

3. Run sample gameplay transactions (PowerShell):

```powershell
cd smart_contracts
./scripts/play_local.ps1
```

## Manual `cast` flow (minimal)

```bash
cd smart_contracts
forge build
export RPC_URL=http://127.0.0.1:8545
export PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

GAME=$(forge create src/CoalitionGame.sol:CoalitionGame --rpc-url $RPC_URL --private-key $PK | awk '/Deployed to:/ {print $3}')
PLAYER=$(cast wallet address --private-key $PK)

cast send $GAME "createEmpire(string,address,uint256,int256)" "Stellar Federation" $PLAYER 500000 40 --rpc-url $RPC_URL --private-key $PK
cast send $GAME "createArmy(uint256,string,uint256,uint256,uint256,uint256,uint256)" 1 "First Legion" 1200 1200 130 60 200 --rpc-url $RPC_URL --private-key $PK
cast send $GAME "consumeArmyResource(uint256,uint8,uint256,uint8)" 1 0 300 2 --rpc-url $RPC_URL --private-key $PK
cast send $GAME "advanceTurn(uint256)" 15 --rpc-url $RPC_URL --private-key $PK
cast call $GAME "coalitionRequisition()(uint256)" --rpc-url $RPC_URL
```

## Notes for expansion

- Add new event systems by deploying modules implementing `ICoalitionEventModule`, then calling `registerEventModule(moduleAddress)`.
- Add richer event authoring/UI by indexing:
  - `EventTemplateUpserted`
  - `EventTemplateTriggered`
  - domain events such as `BattleResolved`, `ConsumptionEffectTriggered`.
- Add more resources/effects by extending `Resource` and `EffectType`, then handling in `_applyEmpireRule`/`_applyArmyRule`.
