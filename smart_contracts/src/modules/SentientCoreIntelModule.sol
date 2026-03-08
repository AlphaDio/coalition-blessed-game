// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICoalitionEventModule} from "../interfaces/ICoalitionEventModule.sol";
import {ICoalitionModuleHost} from "../interfaces/ICoalitionModuleHost.sol";
import {CoalitionHooks} from "../libraries/CoalitionHooks.sol";

contract SentientCoreIntelModule is ICoalitionEventModule {
    uint8 public constant RESOURCE_SENTIENT_CORES = 8;

    address public owner;
    address public immutable game;
    ICoalitionModuleHost public immutable host;

    uint256 public threshold;
    uint256 public intelPerTrigger;
    mapping(bytes32 => uint256) public pools;

    event OwnerUpdated(address indexed previousOwner, address indexed newOwner);
    event ConfigUpdated(uint256 threshold, uint256 intelPerTrigger);
    event SentientCoreTrigger(bytes32 indexed key, uint256 triggerCount, uint256 intelGranted, uint256 poolRemainder);

    modifier onlyOwner() {
        require(msg.sender == owner, "SentientCoreIntelModule: only owner");
        _;
    }

    modifier onlyGame() {
        require(msg.sender == game, "SentientCoreIntelModule: only game");
        _;
    }

    constructor(address gameAddress, uint256 thresholdAmount, uint256 intelGainPerTrigger) {
        require(gameAddress != address(0), "SentientCoreIntelModule: zero game");
        require(thresholdAmount > 0, "SentientCoreIntelModule: threshold=0");
        require(intelGainPerTrigger > 0, "SentientCoreIntelModule: intel=0");
        owner = msg.sender;
        game = gameAddress;
        host = ICoalitionModuleHost(gameAddress);
        threshold = thresholdAmount;
        intelPerTrigger = intelGainPerTrigger;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "SentientCoreIntelModule: zero owner");
        address previousOwner = owner;
        owner = newOwner;
        emit OwnerUpdated(previousOwner, newOwner);
    }

    function configure(uint256 thresholdAmount, uint256 intelGainPerTrigger) external onlyOwner {
        require(thresholdAmount > 0, "SentientCoreIntelModule: threshold=0");
        require(intelGainPerTrigger > 0, "SentientCoreIntelModule: intel=0");
        threshold = thresholdAmount;
        intelPerTrigger = intelGainPerTrigger;
        emit ConfigUpdated(thresholdAmount, intelGainPerTrigger);
    }

    function onGameHook(bytes32 hookId, bytes calldata payload) external onlyGame {
        if (hookId != CoalitionHooks.HOOK_ARMY_CONSUMED && hookId != CoalitionHooks.HOOK_EMPIRE_CONSUMED) {
            return;
        }

        CoalitionHooks.ConsumptionHookPayload memory consumed =
            abi.decode(payload, (CoalitionHooks.ConsumptionHookPayload));
        if (consumed.resource != RESOURCE_SENTIENT_CORES) {
            return;
        }

        bytes32 key = keccak256(abi.encodePacked(hookId, consumed.entityId));
        uint256 nextPool = pools[key] + consumed.amount;
        uint256 triggerCount = nextPool / threshold;
        if (triggerCount == 0) {
            pools[key] = nextPool;
            return;
        }

        uint256 intelGrant = triggerCount * intelPerTrigger;
        pools[key] = nextPool % threshold;
        host.moduleGrantIntel(intelGrant);
        emit SentientCoreTrigger(key, triggerCount, intelGrant, pools[key]);
    }
}
