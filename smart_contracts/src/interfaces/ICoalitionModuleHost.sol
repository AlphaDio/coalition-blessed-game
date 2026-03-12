// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICoalitionModuleHost {
    function moduleGrantIntel(uint256 amount) external;

    function moduleSpendIntel(uint256 amount) external;

    function moduleGrantConfidence(uint256 amount) external;

    function moduleQueueRequisition(uint256 amount) external;
}
