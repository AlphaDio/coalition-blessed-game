// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CoalitionGame} from "../src/CoalitionGame.sol";
import {SentientCoreIntelModule} from "../src/modules/SentientCoreIntelModule.sol";

contract ModuleRegistrar {
    function register(CoalitionGame game, address module) external {
        game.registerEventModule(module);
    }

    function unregister(CoalitionGame game, address module) external {
        game.unregisterEventModule(module);
    }
}

contract CoalitionGameTest {
    function _seedRange(CoalitionGame game, uint256 fromTurn, uint256 toTurn) internal {
        for (uint256 t = fromTurn; t <= toTurn; t++) {
            game.setTurnSeed(t, keccak256(abi.encodePacked("test-seed", t)));
        }
    }

    function _createEmpireAndArmy(CoalitionGame game) internal returns (uint256 empireId, uint256 armyId) {
        empireId = game.createEmpire("Stellar Federation", address(this), 500_000, 40);
        armyId = game.createArmy(empireId, "First Legion", 1_000, 1_000, 140, 60, 250);
    }

    function _callConsumeEmpire(
        CoalitionGame game,
        uint256 empireId,
        CoalitionGame.Resource resource,
        uint256 amount,
        CoalitionGame.ConsumptionSource source
    ) internal returns (bool success) {
        (success,) = address(game).call(
            abi.encodeWithSelector(CoalitionGame.consumeEmpireResource.selector, empireId, resource, amount, source)
        );
    }

    function _callConsumeArmy(
        CoalitionGame game,
        uint256 armyId,
        CoalitionGame.Resource resource,
        uint256 amount,
        CoalitionGame.ConsumptionSource source
    ) internal returns (bool success) {
        (success,) = address(game).call(
            abi.encodeWithSelector(CoalitionGame.consumeArmyResource.selector, armyId, resource, amount, source)
        );
    }

    function testRequisitionPayoutCadence() public {
        CoalitionGame game = new CoalitionGame();
        (uint256 empireId,) = _createEmpireAndArmy(game);
        game.grantEmpireResource(empireId, CoalitionGame.Resource.Biomass, 1_000);

        game.consumeEmpireResource(
            empireId, CoalitionGame.Resource.Biomass, 1_000, CoalitionGame.ConsumptionSource.EmpireNeeds
        );

        require(game.requisitionPool() > 0, "pool should have requisition");
        require(game.coalitionRequisition() == 0, "coalition req should be zero before cadence");

        _seedRange(game, 1, 15);
        game.advanceTurn(14);
        require(game.coalitionRequisition() == 0, "coalition req should still be zero on turn 14");

        game.advanceTurn(1);
        require(game.coalitionRequisition() > 0, "coalition req should be released on turn 15");
    }

    function testArmyConsumptionRuleThreshold() public {
        CoalitionGame game = new CoalitionGame();
        (, uint256 armyId) = _createEmpireAndArmy(game);

        game.setArmyConsumptionRule(CoalitionGame.Resource.Biomass, 100, CoalitionGame.EffectType.ArmyMaxMP, 5, true);
        game.grantArmyResource(armyId, CoalitionGame.Resource.Biomass, 220);

        game.consumeArmyResource(armyId, CoalitionGame.Resource.Biomass, 220, CoalitionGame.ConsumptionSource.ArmyNeeds);

        CoalitionGame.Army memory army = game.getArmy(armyId);
        require(army.maxMP == 1_010, "army max MP should increase twice by +5");
        require(
            game.armyResourceBalances(armyId, uint8(CoalitionGame.Resource.Biomass)) == 0,
            "army biomass balance should be debited"
        );
        require(
            game.armyConsumptionPools(armyId, uint8(CoalitionGame.Resource.Biomass)) == 20,
            "pool remainder should be 20"
        );
    }

    function testBattleDamagesActualArmies() public {
        CoalitionGame game = new CoalitionGame();
        uint256 empireA = game.createEmpire("Empire A", address(this), 400_000, 35);
        uint256 empireB = game.createEmpire("Empire B", address(this), 420_000, 45);
        uint256 armyA = game.createArmy(empireA, "A Legion", 1_200, 1_200, 130, 40, 200);
        uint256 armyB = game.createArmy(empireB, "B Legion", 1_100, 1_100, 135, 35, 200);

        game.setTurnSeed(0, keccak256("battle-seed"));
        game.resolveBattle(armyA, armyB);

        CoalitionGame.Army memory afterA = game.getArmy(armyA);
        CoalitionGame.Army memory afterB = game.getArmy(armyB);
        require(afterA.currentMP < 1_200, "army A should lose MP");
        require(afterB.currentMP < 1_100, "army B should lose MP");
    }

    function testSentientCoreModuleGrantsIntel() public {
        CoalitionGame game = new CoalitionGame();
        (, uint256 armyId) = _createEmpireAndArmy(game);

        SentientCoreIntelModule module = new SentientCoreIntelModule(address(game), 100, 5);
        game.registerEventModule(address(module));
        game.grantArmyResource(armyId, CoalitionGame.Resource.SentientCores, 220);

        game.consumeArmyResource(
            armyId, CoalitionGame.Resource.SentientCores, 220, CoalitionGame.ConsumptionSource.ArmyNeeds
        );

        require(game.coalitionIntel() == 10, "intel should increase by module triggers");
        require(game.coalitionConfidence() == 51, "confidence should track intel gains");
    }

    function testPermissionlessRegistrationStoresModuleOwner() public {
        CoalitionGame game = new CoalitionGame();
        SentientCoreIntelModule module = new SentientCoreIntelModule(address(game), 100, 5);
        ModuleRegistrar registrar = new ModuleRegistrar();

        registrar.register(game, address(module));
        require(game.isEventModule(address(module)), "module should be active after permissionless registration");
        require(game.moduleOwnerOf(address(module)) == address(registrar), "module owner should be registrar");
        require(game.getEventModuleCount() == 1, "active module count should be one");

        registrar.unregister(game, address(module));
        require(!game.isEventModule(address(module)), "module should be inactive after unregister");
        require(game.moduleOwnerOf(address(module)) == address(0), "module owner should clear on unregister");
        require(game.getEventModuleCount() == 0, "active module count should clear on unregister");
    }

    function testModuleReregisterDoesNotDuplicateDispatch() public {
        CoalitionGame game = new CoalitionGame();
        (, uint256 armyId) = _createEmpireAndArmy(game);
        SentientCoreIntelModule module = new SentientCoreIntelModule(address(game), 100, 5);

        game.registerEventModule(address(module));
        game.unregisterEventModule(address(module));
        game.registerEventModule(address(module));

        require(game.getEventModuleCount() == 1, "module list should only contain one active entry");

        game.grantArmyResource(armyId, CoalitionGame.Resource.SentientCores, 220);
        game.consumeArmyResource(
            armyId, CoalitionGame.Resource.SentientCores, 220, CoalitionGame.ConsumptionSource.ArmyNeeds
        );

        require(game.coalitionIntel() == 10, "module should only dispatch once after reregister");
    }

    function testEmpireConsumptionRequiresBalance() public {
        CoalitionGame game = new CoalitionGame();
        (uint256 empireId,) = _createEmpireAndArmy(game);

        bool success = _callConsumeEmpire(
            game, empireId, CoalitionGame.Resource.Biomass, 1, CoalitionGame.ConsumptionSource.EmpireNeeds
        );

        require(!success, "empire consumption should fail without balance");
    }

    function testArmyConsumptionRequiresBalance() public {
        CoalitionGame game = new CoalitionGame();
        (, uint256 armyId) = _createEmpireAndArmy(game);

        bool success =
            _callConsumeArmy(game, armyId, CoalitionGame.Resource.Biomass, 1, CoalitionGame.ConsumptionSource.ArmyNeeds);

        require(!success, "army consumption should fail without balance");
    }

    function testInvalidConsumptionSourceRejected() public {
        CoalitionGame game = new CoalitionGame();
        (uint256 empireId, uint256 armyId) = _createEmpireAndArmy(game);

        game.grantEmpireResource(empireId, CoalitionGame.Resource.Biomass, 10);
        game.grantArmyResource(armyId, CoalitionGame.Resource.Biomass, 10);

        bool empireSuccess = _callConsumeEmpire(
            game, empireId, CoalitionGame.Resource.Biomass, 10, CoalitionGame.ConsumptionSource.ArmyNeeds
        );
        bool armySuccess = _callConsumeArmy(
            game, armyId, CoalitionGame.Resource.Biomass, 10, CoalitionGame.ConsumptionSource.EmpireNeeds
        );

        require(!empireSuccess, "empire path should reject army source");
        require(!armySuccess, "army path should reject empire source");
    }

    function testResourceValueAffectsRequisitionGain() public {
        CoalitionGame game = new CoalitionGame();
        (uint256 empireId,) = _createEmpireAndArmy(game);

        game.setResourceRequisitionValue(CoalitionGame.Resource.Biomass, 25);
        game.grantEmpireResource(empireId, CoalitionGame.Resource.Biomass, 50);
        game.consumeEmpireResource(
            empireId, CoalitionGame.Resource.Biomass, 50, CoalitionGame.ConsumptionSource.EmpireNeeds
        );

        require(game.requisitionPool() == 25, "resource value should scale requisition output");
    }

    function testStateDigestChangesWithCoreConfig() public {
        CoalitionGame game = new CoalitionGame();
        (uint256 empireId, uint256 armyId) = _createEmpireAndArmy(game);

        game.grantEmpireResource(empireId, CoalitionGame.Resource.Biomass, 100);
        game.grantArmyResource(armyId, CoalitionGame.Resource.SentientCores, 100);

        bytes32 baseDigest = game.gameStateDigest();

        game.setRequisitionRates(220, 140, 260, 170, 95);
        bytes32 rateDigest = game.gameStateDigest();
        require(baseDigest != rateDigest, "requisition rate changes should affect digest");

        game.setResourceRequisitionValue(CoalitionGame.Resource.Biomass, 3);
        bytes32 valueDigest = game.gameStateDigest();
        require(rateDigest != valueDigest, "resource value changes should affect digest");

        game.upsertEventTemplate(bytes32("template-a"), bytes32("hook-a"), "ipfs://template-a", true);
        bytes32 templateDigest = game.gameStateDigest();
        require(valueDigest != templateDigest, "event template changes should affect digest");

        SentientCoreIntelModule module = new SentientCoreIntelModule(address(game), 100, 5);
        game.registerEventModule(address(module));
        bytes32 moduleDigest = game.gameStateDigest();
        require(templateDigest != moduleDigest, "active module changes should affect digest");
    }

    function testStateDigestDeterministicAcrossSameActionFlow() public {
        CoalitionGame gameA = new CoalitionGame();
        CoalitionGame gameB = new CoalitionGame();

        for (uint256 i = 0; i < 2; i++) {
            CoalitionGame game = i == 0 ? gameA : gameB;
            uint256 empireA = game.createEmpire("Empire A", address(this), 400_000, 35);
            uint256 empireB = game.createEmpire("Empire B", address(this), 420_000, 45);
            uint256 armyA = game.createArmy(empireA, "A Legion", 1_200, 1_200, 130, 40, 200);
            uint256 armyB = game.createArmy(empireB, "B Legion", 1_100, 1_100, 135, 35, 200);
            game.setTurnSeed(0, keccak256("digest-seed-0"));
            game.setTurnSeed(1, keccak256("digest-seed-1"));
            game.grantEmpireResource(empireA, CoalitionGame.Resource.Biomass, 450);
            game.consumeEmpireResource(
                empireA, CoalitionGame.Resource.Biomass, 450, CoalitionGame.ConsumptionSource.EmpireNeeds
            );
            game.resolveBattle(armyA, armyB);
            game.advanceTurn(1);
        }

        require(gameA.gameStateDigest() == gameB.gameStateDigest(), "equal action flow should produce same digest");
    }
}
