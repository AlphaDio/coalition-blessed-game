# Coalition Game Solidity (Deterministic + Extensible)

This folder contains an EVM-friendly Coalition game core designed for local Anvil gameplay via transactions.

## Current model

- Deterministic simulation:
  - No block entropy is used for gameplay outcomes.
  - Each turn must have an explicit seed (`setTurnSeed`).
  - Battle rolls derive from turn seed + deterministic state inputs.
- On-chain consumption:
  - Empire and army consumption now debit tracked on-chain resource balances.
  - Owner-funded grant functions (`grantEmpireResource`, `grantArmyResource`) seed MVP balances.
  - Requisition gain is based on configured per-resource value plus the selected valid consumption source.
- Extensible events:
  - Anyone can register a deployed event contract with `registerEventModule`.
  - Event modules receive game hooks and return whitelisted host-call instructions.
  - The core interprets those instructions and applies bounded state updates.

## Main contracts

- `src/CoalitionGame.sol`
  - Core game state, resource balances, consumption, turns, battles, module registry.
  - Core-state digest endpoint: `gameStateDigest()`.
- `src/interfaces/ICoalitionEventModule.sol`
  - Event-module interface with `onGameHook` returning `HostCall[]`.
- `src/libraries/CoalitionHooks.sol`
  - Hook IDs and payload structs.
- `src/modules/SentientCoreIntelModule.sol`
  - Example event module that grants intel from sentient core consumption.

## MVP Trust Model

- Consumption is authoritative only when backed by the contract's tracked resource balances.
- MVP balance funding is administrative: the owner seeds empire and army balances through grant functions.
- Modules remain permissionless for MVP and can mutate bounded core state through host calls after registration.
- `gameStateDigest()` covers core contract state and config, but does not include module-local storage inside external module contracts.
- Production hardening still requires governance/allowlisting, dispute controls, and a richer settlement pipeline.

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

3. Run the PowerShell sample flow:

```powershell
cd smart_contracts
./scripts/play_local.ps1
```

## Manual flow (minimal)

```bash
cd smart_contracts
forge build
export RPC_URL=http://127.0.0.1:8545
export PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

GAME=$(forge create src/CoalitionGame.sol:CoalitionGame --rpc-url $RPC_URL --private-key $PK | awk '/Deployed to:/ {print $3}')
PLAYER=$(cast wallet address --private-key $PK)

cast send $GAME "createEmpire(string,address,uint256,int256)" "Stellar Federation" $PLAYER 500000 40 --rpc-url $RPC_URL --private-key $PK
cast send $GAME "createEmpire(string,address,uint256,int256)" "Verdant Colonies" $PLAYER 450000 30 --rpc-url $RPC_URL --private-key $PK
cast send $GAME "createArmy(uint256,string,uint256,uint256,uint256,uint256,uint256)" 1 "First Legion" 1200 1200 130 60 200 --rpc-url $RPC_URL --private-key $PK
cast send $GAME "createArmy(uint256,string,uint256,uint256,uint256,uint256,uint256)" 2 "Verdant Guard" 1150 1150 125 65 200 --rpc-url $RPC_URL --private-key $PK
cast send $GAME "grantArmyResource(uint256,uint8,uint256)" 1 0 260 --rpc-url $RPC_URL --private-key $PK
cast send $GAME "consumeArmyResource(uint256,uint8,uint256,uint8)" 1 0 260 2 --rpc-url $RPC_URL --private-key $PK
cast send $GAME "setTurnSeed(uint256,bytes32)" 0 0x0000000000000000000000000000000000000000000000000000000000000123 --rpc-url $RPC_URL --private-key $PK
cast send $GAME "resolveBattle(uint256,uint256)" 1 2 --rpc-url $RPC_URL --private-key $PK
cast call $GAME "gameStateDigest()(bytes32)" --rpc-url $RPC_URL
```

## Future hardening (documented, not implemented yet)

- Add module registration bonds.
- Add slash/dispute flows for malicious modules.
- Add cooldown-based module exits.
- Add governance controls for module curation and emergency disable policy.
