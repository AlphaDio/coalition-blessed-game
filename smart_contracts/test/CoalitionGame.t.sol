// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CoalitionGame} from "../src/CoalitionGame.sol";
import {SentientCoreIntelModule} from "../src/modules/SentientCoreIntelModule.sol";

contract CoalitionGameTest {
    function _createEmpireAndArmy(CoalitionGame game) internal returns (uint256 empireId, uint256 armyId) {
        empireId = game.createEmpire("Stellar Federation", address(this), 500_000, 40);
        armyId = game.createArmy(empireId, "First Legion", 1_000, 1_000, 140, 60, 250);
    }

    function testRequisitionPayoutCadence() public {
        CoalitionGame game = new CoalitionGame();
        (uint256 empireId,) = _createEmpireAndArmy(game);

        game.consumeEmpireResource(
            empireId, CoalitionGame.Resource.Biomass, 1_000, CoalitionGame.ConsumptionSource.EmpireNeeds
        );

        require(game.requisitionPool() > 0, "pool should have requisition");
        require(game.coalitionRequisition() == 0, "coalition req should be zero before cadence");

        game.advanceTurn(14);
        require(game.coalitionRequisition() == 0, "coalition req should still be zero on turn 14");

        game.advanceTurn(1);
        require(game.coalitionRequisition() > 0, "coalition req should be released on turn 15");
    }

    function testArmyConsumptionRuleThreshold() public {
        CoalitionGame game = new CoalitionGame();
        (, uint256 armyId) = _createEmpireAndArmy(game);

        game.setArmyConsumptionRule(CoalitionGame.Resource.Biomass, 100, CoalitionGame.EffectType.ArmyMaxMP, 5, true);

        game.consumeArmyResource(armyId, CoalitionGame.Resource.Biomass, 220, CoalitionGame.ConsumptionSource.ArmyNeeds);

        CoalitionGame.Army memory army = game.getArmy(armyId);
        require(army.maxMP == 1_010, "army max MP should increase twice by +5");
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

        game.resolveBattle(armyA, armyB, 42);

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

        game.consumeArmyResource(
            armyId, CoalitionGame.Resource.SentientCores, 220, CoalitionGame.ConsumptionSource.ArmyNeeds
        );

        require(game.coalitionIntel() == 10, "intel should increase by module triggers");
        require(game.coalitionConfidence() == 51, "confidence should track intel gains");
    }
}
