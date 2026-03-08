// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICoalitionEventModule {
    function onGameHook(bytes32 hookId, bytes calldata payload) external;
}
