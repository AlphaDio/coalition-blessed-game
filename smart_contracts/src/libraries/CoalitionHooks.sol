// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library CoalitionHooks {
    bytes32 internal constant HOOK_EMPIRE_CONSUMED = keccak256("HOOK_EMPIRE_CONSUMED");
    bytes32 internal constant HOOK_ARMY_CONSUMED = keccak256("HOOK_ARMY_CONSUMED");
    bytes32 internal constant HOOK_BATTLE_RESOLVED = keccak256("HOOK_BATTLE_RESOLVED");
    bytes32 internal constant HOOK_TURN_ADVANCED = keccak256("HOOK_TURN_ADVANCED");

    struct ConsumptionHookPayload {
        uint256 entityId;
        uint8 resource;
        uint8 source;
        uint256 amount;
        uint256 requisitionQueued;
        uint256 turn;
    }

    struct BattleHookPayload {
        uint256 attackerArmyId;
        uint256 defenderArmyId;
        uint256 attackerLoss;
        uint256 defenderLoss;
        uint256 winnerArmyId;
        uint256 turn;
    }

    struct TurnHookPayload {
        uint256 turn;
        uint256 requisitionPool;
        uint256 coalitionRequisition;
        uint256 coalitionIntel;
        uint256 coalitionConfidence;
    }
}
