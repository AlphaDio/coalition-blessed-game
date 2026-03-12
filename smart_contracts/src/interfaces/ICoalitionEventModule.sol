// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICoalitionEventModule {
    struct HostCall {
        uint8 op;
        int256 a;
        int256 b;
        uint256 c;
        bytes32 d;
    }

    function onGameHook(bytes32 hookId, bytes calldata payload) external returns (HostCall[] memory hostCalls);

    function moduleVersion() external pure returns (uint256);

    function supportsHook(bytes32 hookId) external view returns (bool);
}
