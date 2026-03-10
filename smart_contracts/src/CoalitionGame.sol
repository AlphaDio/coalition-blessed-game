// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICoalitionEventModule} from "./interfaces/ICoalitionEventModule.sol";
import {CoalitionHooks} from "./libraries/CoalitionHooks.sol";

contract CoalitionGame {
    uint256 public constant POPULATION_CAP = 1_000_000;
    uint256 public constant CONFIDENCE_MIN = 0;
    uint256 public constant CONFIDENCE_MAX = 100;
    uint256 public constant RESOURCE_COUNT = 10;
    uint256 public constant MAX_MODULE_HOST_CALLS_PER_HOOK = 32;
    int256 public constant MAX_MODULE_ABS_DELTA = 1_000;
    uint256 public constant MAX_MODULE_REQUISITION_PER_CALL = 50_000;
    uint8 public constant RESOURCE_SENTIENT_CORES = uint8(Resource.SentientCores);

    enum Resource {
        Biomass,
        PlasmaFuel,
        SuperAlloys,
        RareGases,
        QuantumCircuits,
        Genomes,
        NanoMachines,
        PsychoImplants,
        SentientCores,
        WormholeReactors
    }

    enum EffectType {
        None,
        EmpireApproval,
        EmpirePopulation,
        EmpireAggravation,
        CoalitionIntel,
        CoalitionConfidence,
        CoalitionRequisition,
        ArmyMaxMP,
        ArmyCurrentMP,
        ArmyAttack,
        ArmyDefense
    }

    enum ConsumptionSource {
        EmpireNeeds,
        EmpireWants,
        ArmyNeeds,
        ArmyWants,
        ImprovementSustainment
    }

    enum ModuleOp {
        None,
        GrantIntel,
        GrantConfidence,
        QueueRequisition,
        ApplyEmpireApproval,
        ApplyEmpireAggravation,
        ApplyArmyAttack,
        ApplyArmyDefense,
        ApplyArmyCurrentMP,
        ApplyArmyMaxMP
    }

    struct Empire {
        string name;
        address controller;
        uint256 population;
        int256 approval;
        int256 aggravation;
        bool exists;
    }

    struct Army {
        string name;
        uint256 empireId;
        uint256 currentMP;
        uint256 maxMP;
        uint256 attack;
        uint256 defense;
        uint256 recoveryBp;
        uint256 experience;
        uint256 level;
        uint256 nextXpThreshold;
        uint256 pendingSurgeBp;
        bool exists;
    }

    struct EffectRule {
        uint256 threshold;
        EffectType effectType;
        int256 magnitude;
        bool enabled;
    }

    struct BattleOutcome {
        uint256 attackerLoss;
        uint256 defenderLoss;
        uint256 winnerArmyId;
        uint256 attackerPower;
        uint256 defenderPower;
    }

    struct EventTemplate {
        bytes32 id;
        bytes32 hookId;
        string metadataURI;
        bool enabled;
    }

    struct RequisitionRates {
        uint16 empireNeedsBp;
        uint16 empireWantsBp;
        uint16 armyNeedsBp;
        uint16 armyWantsBp;
        uint16 improvementBp;
    }

    address public owner;
    uint256 public turn;
    uint256 public nextEmpireId = 1;
    uint256 public nextArmyId = 1;

    uint256 public coalitionRequisition;
    uint256 public coalitionIntel;
    uint256 public coalitionConfidence = 50;
    uint256 public requisitionPool;
    uint256 public requisitionPayoutCadence = 15;
    uint256 public battleNonce;

    RequisitionRates public requisitionRates = RequisitionRates({
        empireNeedsBp: 200,
        empireWantsBp: 120,
        armyNeedsBp: 250,
        armyWantsBp: 150,
        improvementBp: 90
    });

    mapping(uint256 => Empire) public empires;
    mapping(uint256 => Army) public armies;

    mapping(uint8 => EffectRule) public empireConsumptionRules;
    mapping(uint8 => EffectRule) public armyConsumptionRules;

    mapping(uint256 => mapping(uint8 => uint256)) public empireResourceBalances;
    mapping(uint256 => mapping(uint8 => uint256)) public armyResourceBalances;
    mapping(uint256 => mapping(uint8 => uint256)) public empireConsumptionPools;
    mapping(uint256 => mapping(uint8 => uint256)) public armyConsumptionPools;

    mapping(uint8 => uint256) public resourceRequisitionValues;
    mapping(address => bool) public isEventModule;
    mapping(address => address) public moduleOwnerOf;
    address[] public eventModules;
    mapping(address => uint256) private eventModuleIndexPlusOne;

    mapping(bytes32 => EventTemplate) public eventTemplates;
    mapping(bytes32 => bool) public eventTemplateExists;
    bytes32[] public eventTemplateIds;

    mapping(uint256 => bytes32) private turnSeeds;
    mapping(uint256 => bool) public isTurnSeedKnown;
    uint256[] public seededTurns;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event EmpireCreated(
        uint256 indexed empireId, string name, address indexed controller, uint256 population, int256 approval
    );
    event ArmyCreated(
        uint256 indexed armyId,
        uint256 indexed empireId,
        string name,
        uint256 currentMP,
        uint256 maxMP,
        uint256 attack,
        uint256 defense
    );
    event EmpireControllerUpdated(
        uint256 indexed empireId, address indexed previousController, address indexed newController
    );
    event EmpireConsumptionRuleSet(
        uint8 indexed resource, uint256 threshold, EffectType effectType, int256 magnitude, bool enabled
    );
    event ArmyConsumptionRuleSet(
        uint8 indexed resource, uint256 threshold, EffectType effectType, int256 magnitude, bool enabled
    );
    event ResourceRequisitionValueSet(uint8 indexed resource, uint256 value);
    event EmpireResourceGranted(uint256 indexed empireId, uint8 indexed resource, uint256 amount, uint256 balanceAfter);
    event ArmyResourceGranted(uint256 indexed armyId, uint8 indexed resource, uint256 amount, uint256 balanceAfter);
    event EventTemplateUpserted(bytes32 indexed templateId, bytes32 indexed hookId, string metadataURI, bool enabled);
    event EventTemplateTriggered(bytes32 indexed templateId, bytes32 indexed hookId, bytes payload);
    event EventModuleRegistered(address indexed module, address indexed registeredBy);
    event EventModuleUnregistered(address indexed module, address indexed unregisteredBy);
    event HookDispatchFailed(address indexed module, bytes32 indexed hookId, bytes reason);
    event TurnSeedSet(uint256 indexed turnNumber, bytes32 seed);
    event ModuleHostCallApplied(
        address indexed module, bytes32 indexed hookId, uint8 indexed op, int256 a, int256 b, uint256 c, bytes32 d
    );
    event ModuleHostCallRejected(address indexed module, bytes32 indexed hookId, uint8 indexed op, bytes32 reasonCode);
    event EmpireResourceConsumed(
        uint256 indexed empireId,
        uint8 indexed resource,
        uint8 source,
        uint256 amount,
        uint256 balanceAfter,
        uint256 poolAfter,
        uint256 requisitionQueued
    );
    event ArmyResourceConsumed(
        uint256 indexed armyId,
        uint8 indexed resource,
        uint8 source,
        uint256 amount,
        uint256 balanceAfter,
        uint256 poolAfter,
        uint256 requisitionQueued
    );
    event ConsumptionEffectTriggered(
        bool indexed isArmy,
        uint256 indexed entityId,
        uint8 indexed resource,
        EffectType effectType,
        int256 totalDelta,
        uint256 triggerCount
    );
    event RequisitionQueued(uint256 amount, uint256 poolAfter);
    event RequisitionReleased(uint256 amount, uint256 coalitionRequisitionAfter, uint256 indexed turnNumber);
    event CoalitionRequisitionChanged(uint256 previousValue, uint256 newValue, int256 delta);
    event CoalitionIntelChanged(uint256 previousValue, uint256 newValue, int256 delta);
    event CoalitionConfidenceChanged(uint256 previousValue, uint256 newValue, int256 delta);
    event TurnAdvanced(
        uint256 indexed turnNumber,
        uint256 requisitionPool,
        uint256 coalitionRequisition,
        uint256 coalitionIntel,
        uint256 coalitionConfidence
    );
    event BattleResolved(
        uint256 indexed attackerArmyId,
        uint256 indexed defenderArmyId,
        uint256 attackerLoss,
        uint256 defenderLoss,
        uint256 winnerArmyId,
        uint256 attackerPower,
        uint256 defenderPower
    );
    event ArmyRecovered(uint256 indexed armyId, uint256 recovered, uint256 currentMP, uint256 maxMP);
    event ArmyExperienceGained(uint256 indexed armyId, uint256 gained, uint256 experienceAfter, uint256 level);
    event ArmyLeveledUp(uint256 indexed armyId, uint256 newLevel, uint256 nextThreshold, uint256 pendingSurgeBp);

    modifier onlyOwner() {
        require(msg.sender == owner, "CoalitionGame: only owner");
        _;
    }

    modifier onlyEmpireController(uint256 empireId) {
        Empire storage empire = empires[empireId];
        require(empire.exists, "CoalitionGame: unknown empire");
        require(msg.sender == owner || msg.sender == empire.controller, "CoalitionGame: not authorized for empire");
        _;
    }

    constructor() {
        owner = msg.sender;
        for (uint8 resourceKey = 0; resourceKey < RESOURCE_COUNT; resourceKey++) {
            resourceRequisitionValues[resourceKey] = 1;
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "CoalitionGame: zero owner");
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function createEmpire(string calldata name, address controller, uint256 population, int256 approval)
        external
        onlyOwner
        returns (uint256 empireId)
    {
        require(bytes(name).length > 0, "CoalitionGame: empty empire name");
        require(controller != address(0), "CoalitionGame: zero controller");
        empireId = nextEmpireId++;
        Empire storage empire = empires[empireId];
        empire.name = name;
        empire.controller = controller;
        empire.population = _min(population, POPULATION_CAP);
        empire.approval = _clampInt(approval, -100, 100);
        empire.aggravation = 0;
        empire.exists = true;
        emit EmpireCreated(empireId, name, controller, empire.population, empire.approval);
    }

    function updateEmpireController(uint256 empireId, address newController) external onlyOwner {
        require(newController != address(0), "CoalitionGame: zero controller");
        Empire storage empire = empires[empireId];
        require(empire.exists, "CoalitionGame: unknown empire");
        address previousController = empire.controller;
        empire.controller = newController;
        emit EmpireControllerUpdated(empireId, previousController, newController);
    }

    function createArmy(
        uint256 empireId,
        string calldata name,
        uint256 currentMP,
        uint256 maxMP,
        uint256 attack,
        uint256 defense,
        uint256 recoveryBp
    ) external onlyOwner returns (uint256 armyId) {
        require(empires[empireId].exists, "CoalitionGame: unknown empire");
        require(bytes(name).length > 0, "CoalitionGame: empty army name");
        require(maxMP > 0, "CoalitionGame: maxMP must be > 0");
        require(currentMP <= maxMP, "CoalitionGame: currentMP > maxMP");
        require(attack > 0, "CoalitionGame: attack must be > 0");
        require(recoveryBp <= 5_000, "CoalitionGame: recovery too high");

        armyId = nextArmyId++;
        armies[armyId] = Army({
            name: name,
            empireId: empireId,
            currentMP: currentMP,
            maxMP: maxMP,
            attack: attack,
            defense: defense,
            recoveryBp: recoveryBp,
            experience: 0,
            level: 0,
            nextXpThreshold: 120,
            pendingSurgeBp: 0,
            exists: true
        });

        emit ArmyCreated(armyId, empireId, name, currentMP, maxMP, attack, defense);
    }

    function setRequisitionPayoutCadence(uint256 cadence) external onlyOwner {
        require(cadence > 0 && cadence <= 200, "CoalitionGame: invalid cadence");
        requisitionPayoutCadence = cadence;
    }

    function setRequisitionRates(
        uint16 empireNeedsBp,
        uint16 empireWantsBp,
        uint16 armyNeedsBp,
        uint16 armyWantsBp,
        uint16 improvementBp
    ) external onlyOwner {
        require(
            empireNeedsBp <= 10_000 && empireWantsBp <= 10_000 && armyNeedsBp <= 10_000 && armyWantsBp <= 10_000
                && improvementBp <= 10_000,
            "CoalitionGame: invalid bp"
        );
        requisitionRates = RequisitionRates({
            empireNeedsBp: empireNeedsBp,
            empireWantsBp: empireWantsBp,
            armyNeedsBp: armyNeedsBp,
            armyWantsBp: armyWantsBp,
            improvementBp: improvementBp
        });
    }

    function setResourceRequisitionValue(Resource resource, uint256 value) external onlyOwner {
        uint8 resourceKey = uint8(resource);
        resourceRequisitionValues[resourceKey] = value;
        emit ResourceRequisitionValueSet(resourceKey, value);
    }

    function grantEmpireResource(uint256 empireId, Resource resource, uint256 amount) external onlyOwner {
        require(amount > 0, "CoalitionGame: amount must be > 0");
        Empire storage empire = empires[empireId];
        require(empire.exists, "CoalitionGame: unknown empire");

        uint8 resourceKey = uint8(resource);
        empireResourceBalances[empireId][resourceKey] += amount;
        emit EmpireResourceGranted(empireId, resourceKey, amount, empireResourceBalances[empireId][resourceKey]);
    }

    function grantArmyResource(uint256 armyId, Resource resource, uint256 amount) external onlyOwner {
        require(amount > 0, "CoalitionGame: amount must be > 0");
        Army storage army = armies[armyId];
        require(army.exists, "CoalitionGame: unknown army");

        uint8 resourceKey = uint8(resource);
        armyResourceBalances[armyId][resourceKey] += amount;
        emit ArmyResourceGranted(armyId, resourceKey, amount, armyResourceBalances[armyId][resourceKey]);
    }

    function setEmpireConsumptionRule(
        Resource resource,
        uint256 threshold,
        EffectType effectType,
        int256 magnitude,
        bool enabled
    ) external onlyOwner {
        uint8 resourceKey = uint8(resource);
        empireConsumptionRules[resourceKey] =
            EffectRule({threshold: threshold, effectType: effectType, magnitude: magnitude, enabled: enabled});
        emit EmpireConsumptionRuleSet(resourceKey, threshold, effectType, magnitude, enabled);
    }

    function setArmyConsumptionRule(
        Resource resource,
        uint256 threshold,
        EffectType effectType,
        int256 magnitude,
        bool enabled
    ) external onlyOwner {
        uint8 resourceKey = uint8(resource);
        armyConsumptionRules[resourceKey] =
            EffectRule({threshold: threshold, effectType: effectType, magnitude: magnitude, enabled: enabled});
        emit ArmyConsumptionRuleSet(resourceKey, threshold, effectType, magnitude, enabled);
    }

    function upsertEventTemplate(bytes32 templateId, bytes32 hookId, string calldata metadataURI, bool enabled)
        external
        onlyOwner
    {
        require(templateId != bytes32(0), "CoalitionGame: empty template id");
        if (!eventTemplateExists[templateId]) {
            eventTemplateExists[templateId] = true;
            eventTemplateIds.push(templateId);
        }
        eventTemplates[templateId] =
            EventTemplate({id: templateId, hookId: hookId, metadataURI: metadataURI, enabled: enabled});
        emit EventTemplateUpserted(templateId, hookId, metadataURI, enabled);
    }

    function setTurnSeed(uint256 turnNumber, bytes32 seed) external onlyOwner {
        require(seed != bytes32(0), "CoalitionGame: empty seed");
        require(turnNumber >= turn, "CoalitionGame: past turn seed");
        require(!isTurnSeedKnown[turnNumber], "CoalitionGame: seed already set");
        turnSeeds[turnNumber] = seed;
        isTurnSeedKnown[turnNumber] = true;
        seededTurns.push(turnNumber);
        emit TurnSeedSet(turnNumber, seed);
    }

    function getTurnSeed(uint256 turnNumber) external view returns (bytes32) {
        return turnSeeds[turnNumber];
    }

    // MVP trust model: modules remain permissionless and can apply bounded host calls.
    function registerEventModule(address module) external {
        require(module != address(0), "CoalitionGame: zero module");
        require(module.code.length > 0, "CoalitionGame: module must be contract");
        require(!isEventModule[module], "CoalitionGame: module already registered");
        require(eventModuleIndexPlusOne[module] == 0, "CoalitionGame: module already tracked");
        require(moduleOwnerOf[module] == address(0), "CoalitionGame: module already owned");
        isEventModule[module] = true;
        moduleOwnerOf[module] = msg.sender;
        eventModules.push(module);
        eventModuleIndexPlusOne[module] = eventModules.length;
        emit EventModuleRegistered(module, msg.sender);
    }

    function unregisterEventModule(address module) external {
        require(isEventModule[module], "CoalitionGame: module not registered");
        address moduleOwner = moduleOwnerOf[module];
        require(msg.sender == owner || msg.sender == moduleOwner, "CoalitionGame: not owner/admin for unregister");
        isEventModule[module] = false;
        moduleOwnerOf[module] = address(0);

        uint256 moduleIndex = eventModuleIndexPlusOne[module];
        require(moduleIndex > 0, "CoalitionGame: missing module index");
        uint256 arrayIndex = moduleIndex - 1;
        uint256 lastIndex = eventModules.length - 1;
        if (arrayIndex != lastIndex) {
            address lastModule = eventModules[lastIndex];
            eventModules[arrayIndex] = lastModule;
            eventModuleIndexPlusOne[lastModule] = moduleIndex;
        }
        eventModules.pop();
        delete eventModuleIndexPlusOne[module];

        emit EventModuleUnregistered(module, msg.sender);
    }

    // Consumption is authoritative only when backed by tracked on-chain balances.
    function consumeEmpireResource(uint256 empireId, Resource resource, uint256 amount, ConsumptionSource source)
        external
        onlyEmpireController(empireId)
    {
        require(amount > 0, "CoalitionGame: amount must be > 0");
        _requireEmpireSource(source);

        uint8 resourceKey = uint8(resource);
        uint256 balanceBefore = empireResourceBalances[empireId][resourceKey];
        require(balanceBefore >= amount, "CoalitionGame: insufficient empire resource");
        uint256 balanceAfter = balanceBefore - amount;
        empireResourceBalances[empireId][resourceKey] = balanceAfter;

        uint256 reqGain = _calculateRequisitionGain(resourceKey, amount, source);
        if (reqGain > 0) {
            _queueRequisition(reqGain);
        }

        uint256 pool = empireConsumptionPools[empireId][resourceKey] + amount;
        EffectRule memory rule = empireConsumptionRules[resourceKey];
        if (rule.enabled && rule.threshold > 0) {
            uint256 triggerCount = pool / rule.threshold;
            if (triggerCount > 0) {
                pool = pool % rule.threshold;
                _applyEmpireRule(empireId, resourceKey, rule, triggerCount);
            }
        }
        empireConsumptionPools[empireId][resourceKey] = pool;

        emit EmpireResourceConsumed(empireId, resourceKey, uint8(source), amount, balanceAfter, pool, reqGain);

        CoalitionHooks.ConsumptionHookPayload memory payload = CoalitionHooks.ConsumptionHookPayload({
            entityId: empireId,
            resource: resourceKey,
            source: uint8(source),
            amount: amount,
            requisitionQueued: reqGain,
            turn: turn
        });
        _dispatchHook(CoalitionHooks.HOOK_EMPIRE_CONSUMED, abi.encode(payload));
    }

    function consumeArmyResource(uint256 armyId, Resource resource, uint256 amount, ConsumptionSource source)
        external
    {
        require(amount > 0, "CoalitionGame: amount must be > 0");
        _requireArmySource(source);
        Army storage army = armies[armyId];
        require(army.exists, "CoalitionGame: unknown army");
        Empire storage empire = empires[army.empireId];
        require(msg.sender == owner || msg.sender == empire.controller, "CoalitionGame: not authorized for army");

        uint8 resourceKey = uint8(resource);
        uint256 balanceBefore = armyResourceBalances[armyId][resourceKey];
        require(balanceBefore >= amount, "CoalitionGame: insufficient army resource");
        uint256 balanceAfter = balanceBefore - amount;
        armyResourceBalances[armyId][resourceKey] = balanceAfter;

        uint256 reqGain = _calculateRequisitionGain(resourceKey, amount, source);
        if (reqGain > 0) {
            _queueRequisition(reqGain);
        }

        uint256 pool = armyConsumptionPools[armyId][resourceKey] + amount;
        EffectRule memory rule = armyConsumptionRules[resourceKey];
        if (rule.enabled && rule.threshold > 0) {
            uint256 triggerCount = pool / rule.threshold;
            if (triggerCount > 0) {
                pool = pool % rule.threshold;
                _applyArmyRule(armyId, resourceKey, rule, triggerCount);
            }
        }
        armyConsumptionPools[armyId][resourceKey] = pool;

        emit ArmyResourceConsumed(armyId, resourceKey, uint8(source), amount, balanceAfter, pool, reqGain);

        CoalitionHooks.ConsumptionHookPayload memory payload = CoalitionHooks.ConsumptionHookPayload({
            entityId: armyId,
            resource: resourceKey,
            source: uint8(source),
            amount: amount,
            requisitionQueued: reqGain,
            turn: turn
        });
        _dispatchHook(CoalitionHooks.HOOK_ARMY_CONSUMED, abi.encode(payload));
    }

    function advanceTurn(uint256 turnsToAdvance) external onlyOwner {
        require(turnsToAdvance > 0 && turnsToAdvance <= 500, "CoalitionGame: invalid turn delta");
        for (uint256 i = 0; i < turnsToAdvance; i++) {
            uint256 nextTurn = turn + 1;
            require(isTurnSeedKnown[nextTurn], "CoalitionGame: missing next turn seed");
            turn += 1;
            _recoverArmies();

            if (turn % requisitionPayoutCadence == 0 && requisitionPool > 0) {
                uint256 released = requisitionPool;
                requisitionPool = 0;
                coalitionRequisition += released;
                emit RequisitionReleased(released, coalitionRequisition, turn);
            }

            emit TurnAdvanced(turn, requisitionPool, coalitionRequisition, coalitionIntel, coalitionConfidence);
            CoalitionHooks.TurnHookPayload memory payload = CoalitionHooks.TurnHookPayload({
                turn: turn,
                requisitionPool: requisitionPool,
                coalitionRequisition: coalitionRequisition,
                coalitionIntel: coalitionIntel,
                coalitionConfidence: coalitionConfidence
            });
            _dispatchHook(CoalitionHooks.HOOK_TURN_ADVANCED, abi.encode(payload));
        }
    }

    function resolveBattle(uint256 attackerArmyId, uint256 defenderArmyId)
        external
        onlyOwner
        returns (BattleOutcome memory outcome)
    {
        require(attackerArmyId != defenderArmyId, "CoalitionGame: same army");
        require(isTurnSeedKnown[turn], "CoalitionGame: missing current turn seed");
        bytes32 seed = turnSeeds[turn];
        uint256 nonce = battleNonce;
        battleNonce += 1;
        Army storage attacker = armies[attackerArmyId];
        Army storage defender = armies[defenderArmyId];
        require(attacker.exists && defender.exists, "CoalitionGame: unknown army");
        require(attacker.currentMP > 0 && defender.currentMP > 0, "CoalitionGame: exhausted army");

        uint256 attackerSurgeBp = attacker.pendingSurgeBp;
        uint256 defenderSurgeBp = defender.pendingSurgeBp;
        attacker.pendingSurgeBp = 0;
        defender.pendingSurgeBp = 0;

        uint256 attackerPower = _rollBattlePower(attackerArmyId, attacker, attackerSurgeBp, seed, nonce, 1);
        uint256 defenderPower = _rollBattlePower(defenderArmyId, defender, defenderSurgeBp, seed, nonce, 2);
        uint256 totalPower = attackerPower + defenderPower;
        if (totalPower == 0) {
            attackerPower = 1;
            defenderPower = 1;
            totalPower = 2;
        }

        uint256 engagement = _min(attacker.currentMP, defender.currentMP);
        uint256 baseCasualty = engagement / 3;
        if (baseCasualty == 0) baseCasualty = 1;

        uint256 attackerLoss = (defenderPower * baseCasualty) / totalPower;
        uint256 defenderLoss = (attackerPower * baseCasualty) / totalPower;
        attackerLoss = _applyDefenseMitigation(attackerLoss, attacker.defense);
        defenderLoss = _applyDefenseMitigation(defenderLoss, defender.defense);
        if (attackerLoss == 0) attackerLoss = 1;
        if (defenderLoss == 0) defenderLoss = 1;

        uint256 winnerArmyId = 0;
        if (attackerPower > defenderPower) {
            winnerArmyId = attackerArmyId;
            defenderLoss = (defenderLoss * 130) / 100;
            attackerLoss = (attackerLoss * 70) / 100;
        } else if (defenderPower > attackerPower) {
            winnerArmyId = defenderArmyId;
            attackerLoss = (attackerLoss * 130) / 100;
            defenderLoss = (defenderLoss * 70) / 100;
        }

        attackerLoss = _min(attackerLoss, attacker.currentMP);
        defenderLoss = _min(defenderLoss, defender.currentMP);
        attacker.currentMP -= attackerLoss;
        defender.currentMP -= defenderLoss;

        uint256 intensity = attackerLoss + defenderLoss;
        _grantBattleExperience(attackerArmyId, winnerArmyId == attackerArmyId, winnerArmyId == 0, intensity);
        _grantBattleExperience(defenderArmyId, winnerArmyId == defenderArmyId, winnerArmyId == 0, intensity);

        emit BattleResolved(
            attackerArmyId, defenderArmyId, attackerLoss, defenderLoss, winnerArmyId, attackerPower, defenderPower
        );

        CoalitionHooks.BattleHookPayload memory payload = CoalitionHooks.BattleHookPayload({
            attackerArmyId: attackerArmyId,
            defenderArmyId: defenderArmyId,
            attackerLoss: attackerLoss,
            defenderLoss: defenderLoss,
            winnerArmyId: winnerArmyId,
            turn: turn
        });
        _dispatchHook(CoalitionHooks.HOOK_BATTLE_RESOLVED, abi.encode(payload));

        outcome = BattleOutcome({
            attackerLoss: attackerLoss,
            defenderLoss: defenderLoss,
            winnerArmyId: winnerArmyId,
            attackerPower: attackerPower,
            defenderPower: defenderPower
        });
    }

    function getEmpire(uint256 empireId) external view returns (Empire memory) {
        return empires[empireId];
    }

    function getArmy(uint256 armyId) external view returns (Army memory) {
        return armies[armyId];
    }

    function getEventModuleCount() external view returns (uint256) {
        return eventModules.length;
    }

    function getEventTemplateCount() external view returns (uint256) {
        return eventTemplateIds.length;
    }

    function getSeededTurnCount() external view returns (uint256) {
        return seededTurns.length;
    }

    // This digest covers core contract state only; external module-local state is documented separately.
    function gameStateDigest() external view returns (bytes32 digest) {
        digest = keccak256(
            abi.encode(
                owner,
                turn,
                nextEmpireId,
                nextArmyId,
                coalitionRequisition,
                coalitionIntel,
                coalitionConfidence,
                requisitionPool,
                requisitionPayoutCadence,
                battleNonce,
                requisitionRates.empireNeedsBp,
                requisitionRates.empireWantsBp,
                requisitionRates.armyNeedsBp,
                requisitionRates.armyWantsBp,
                requisitionRates.improvementBp
            )
        );

        for (uint8 resourceKey = 0; resourceKey < RESOURCE_COUNT; resourceKey++) {
            EffectRule storage empireRule = empireConsumptionRules[resourceKey];
            EffectRule storage armyRule = armyConsumptionRules[resourceKey];
            digest = keccak256(
                abi.encode(
                    digest,
                    resourceKey,
                    resourceRequisitionValues[resourceKey],
                    empireRule.threshold,
                    empireRule.effectType,
                    empireRule.magnitude,
                    empireRule.enabled,
                    armyRule.threshold,
                    armyRule.effectType,
                    armyRule.magnitude,
                    armyRule.enabled
                )
            );
        }

        for (uint256 empireId = 1; empireId < nextEmpireId; empireId++) {
            Empire storage empire = empires[empireId];
            digest = keccak256(
                abi.encode(
                    digest,
                    empireId,
                    empire.name,
                    empire.controller,
                    empire.population,
                    empire.approval,
                    empire.aggravation,
                    empire.exists
                )
            );
            for (uint8 resourceKey = 0; resourceKey < RESOURCE_COUNT; resourceKey++) {
                digest = keccak256(
                    abi.encode(
                        digest,
                        empireResourceBalances[empireId][resourceKey],
                        empireConsumptionPools[empireId][resourceKey]
                    )
                );
            }
        }

        for (uint256 armyId = 1; armyId < nextArmyId; armyId++) {
            Army storage army = armies[armyId];
            digest = keccak256(
                abi.encode(
                    digest,
                    armyId,
                    army.name,
                    army.empireId,
                    army.currentMP,
                    army.maxMP,
                    army.attack,
                    army.defense,
                    army.recoveryBp,
                    army.experience,
                    army.level,
                    army.nextXpThreshold,
                    army.pendingSurgeBp,
                    army.exists
                )
            );
            for (uint8 resourceKey = 0; resourceKey < RESOURCE_COUNT; resourceKey++) {
                digest = keccak256(
                    abi.encode(
                        digest, armyResourceBalances[armyId][resourceKey], armyConsumptionPools[armyId][resourceKey]
                    )
                );
            }
        }

        for (uint256 i = 0; i < eventTemplateIds.length; i++) {
            bytes32 templateId = eventTemplateIds[i];
            EventTemplate storage template = eventTemplates[templateId];
            digest = keccak256(abi.encode(digest, templateId, template.hookId, template.metadataURI, template.enabled));
        }

        for (uint256 i = 0; i < eventModules.length; i++) {
            address module = eventModules[i];
            digest = keccak256(abi.encode(digest, module, isEventModule[module], moduleOwnerOf[module]));
        }

        for (uint256 i = 0; i < seededTurns.length; i++) {
            uint256 seededTurn = seededTurns[i];
            digest = keccak256(abi.encode(digest, seededTurn, turnSeeds[seededTurn]));
        }
    }

    function getArmyIdsForEmpire(uint256 empireId) external view returns (uint256[] memory ids) {
        uint256 count = 0;
        for (uint256 armyId = 1; armyId < nextArmyId; armyId++) {
            if (armies[armyId].exists && armies[armyId].empireId == empireId) {
                count += 1;
            }
        }
        ids = new uint256[](count);
        uint256 pointer = 0;
        for (uint256 armyId = 1; armyId < nextArmyId; armyId++) {
            if (armies[armyId].exists && armies[armyId].empireId == empireId) {
                ids[pointer] = armyId;
                pointer += 1;
            }
        }
    }

    function _applyEmpireRule(uint256 empireId, uint8 resourceKey, EffectRule memory rule, uint256 triggerCount)
        internal
    {
        if (rule.effectType == EffectType.None || triggerCount == 0) {
            return;
        }
        Empire storage empire = empires[empireId];
        int256 totalDelta = rule.magnitude * _toInt256(triggerCount);

        if (rule.effectType == EffectType.EmpireApproval) {
            empire.approval = _clampInt(empire.approval + totalDelta, -100, 100);
        } else if (rule.effectType == EffectType.EmpirePopulation) {
            empire.population = _applySignedToUintWithCap(empire.population, totalDelta, POPULATION_CAP);
        } else if (rule.effectType == EffectType.EmpireAggravation) {
            empire.aggravation = _clampInt(empire.aggravation + totalDelta, 0, 100);
        } else if (rule.effectType == EffectType.CoalitionIntel) {
            _adjustCoalitionIntel(totalDelta);
        } else if (rule.effectType == EffectType.CoalitionConfidence) {
            _adjustCoalitionConfidence(totalDelta);
        } else if (rule.effectType == EffectType.CoalitionRequisition) {
            _adjustCoalitionRequisition(totalDelta);
        }

        emit ConsumptionEffectTriggered(false, empireId, resourceKey, rule.effectType, totalDelta, triggerCount);
    }

    function _applyArmyRule(uint256 armyId, uint8 resourceKey, EffectRule memory rule, uint256 triggerCount) internal {
        if (rule.effectType == EffectType.None || triggerCount == 0) {
            return;
        }

        Army storage army = armies[armyId];
        int256 totalDelta = rule.magnitude * _toInt256(triggerCount);

        if (rule.effectType == EffectType.ArmyMaxMP) {
            uint256 nextMax = _applySignedToUint(army.maxMP, totalDelta);
            if (nextMax == 0) nextMax = 1;
            army.maxMP = nextMax;
            if (army.currentMP > army.maxMP) {
                army.currentMP = army.maxMP;
            }
        } else if (rule.effectType == EffectType.ArmyCurrentMP) {
            uint256 nextCurrent = _applySignedToUint(army.currentMP, totalDelta);
            if (nextCurrent > army.maxMP) nextCurrent = army.maxMP;
            army.currentMP = nextCurrent;
        } else if (rule.effectType == EffectType.ArmyAttack) {
            uint256 nextAttack = _applySignedToUint(army.attack, totalDelta);
            if (nextAttack == 0) nextAttack = 1;
            army.attack = nextAttack;
        } else if (rule.effectType == EffectType.ArmyDefense) {
            army.defense = _applySignedToUint(army.defense, totalDelta);
        } else if (rule.effectType == EffectType.CoalitionIntel) {
            _adjustCoalitionIntel(totalDelta);
        } else if (rule.effectType == EffectType.CoalitionConfidence) {
            _adjustCoalitionConfidence(totalDelta);
        } else if (rule.effectType == EffectType.CoalitionRequisition) {
            _adjustCoalitionRequisition(totalDelta);
        }

        emit ConsumptionEffectTriggered(true, armyId, resourceKey, rule.effectType, totalDelta, triggerCount);
    }

    function _queueRequisition(uint256 amount) internal {
        if (amount == 0) return;
        requisitionPool += amount;
        emit RequisitionQueued(amount, requisitionPool);
    }

    function _adjustCoalitionRequisition(int256 delta) internal {
        if (delta == 0) return;
        uint256 previousValue = coalitionRequisition;
        if (delta > 0) {
            coalitionRequisition += uint256(delta);
        } else {
            uint256 decrease = uint256(-delta);
            if (decrease >= coalitionRequisition) {
                coalitionRequisition = 0;
            } else {
                coalitionRequisition -= decrease;
            }
        }
        emit CoalitionRequisitionChanged(previousValue, coalitionRequisition, delta);
    }

    function _adjustCoalitionIntel(int256 delta) internal {
        if (delta == 0) return;
        uint256 previousValue = coalitionIntel;
        if (delta > 0) {
            coalitionIntel += uint256(delta);
        } else {
            uint256 decrease = uint256(-delta);
            if (decrease >= coalitionIntel) {
                coalitionIntel = 0;
            } else {
                coalitionIntel -= decrease;
            }
        }
        emit CoalitionIntelChanged(previousValue, coalitionIntel, delta);

        int256 confidenceDelta;
        if (delta > 0) {
            confidenceDelta = _toInt256((uint256(delta) + 9) / 10);
        } else {
            confidenceDelta = -_toInt256((uint256(-delta) + 9) / 10);
        }
        _adjustCoalitionConfidence(confidenceDelta);
    }

    function _adjustCoalitionConfidence(int256 delta) internal {
        if (delta == 0) return;
        uint256 previousValue = coalitionConfidence;
        int256 nextValue = int256(coalitionConfidence) + delta;
        if (nextValue < int256(CONFIDENCE_MIN)) {
            nextValue = int256(CONFIDENCE_MIN);
        }
        if (nextValue > int256(CONFIDENCE_MAX)) {
            nextValue = int256(CONFIDENCE_MAX);
        }
        coalitionConfidence = uint256(nextValue);
        emit CoalitionConfidenceChanged(previousValue, coalitionConfidence, delta);
    }

    function _recoverArmies() internal {
        for (uint256 armyId = 1; armyId < nextArmyId; armyId++) {
            Army storage army = armies[armyId];
            if (!army.exists) continue;
            if (army.currentMP >= army.maxMP) continue;

            uint256 missing = army.maxMP - army.currentMP;
            uint256 recovered = (missing * army.recoveryBp) / 10_000;
            if (recovered == 0) recovered = 1;

            uint256 nextMP = army.currentMP + recovered;
            if (nextMP > army.maxMP) {
                nextMP = army.maxMP;
                recovered = army.maxMP - army.currentMP;
            }
            army.currentMP = nextMP;
            emit ArmyRecovered(armyId, recovered, army.currentMP, army.maxMP);
        }
    }

    function _grantBattleExperience(uint256 armyId, bool won, bool draw, uint256 intensity) internal {
        Army storage army = armies[armyId];
        uint256 gained = draw ? 24 : (won ? 20 : 35);
        gained += intensity / 25;
        army.experience += gained;
        emit ArmyExperienceGained(armyId, gained, army.experience, army.level);

        while (army.experience >= army.nextXpThreshold) {
            army.experience -= army.nextXpThreshold;
            army.level += 1;
            army.nextXpThreshold = (army.nextXpThreshold * 125) / 100 + 25;

            uint256 surgeGain = 1_200 + (army.level * 125);
            if (surgeGain > 4_500) surgeGain = 4_500;
            uint256 nextSurge = army.pendingSurgeBp + surgeGain;
            if (nextSurge > 8_000) nextSurge = 8_000;
            army.pendingSurgeBp = nextSurge;

            emit ArmyLeveledUp(armyId, army.level, army.nextXpThreshold, army.pendingSurgeBp);
        }
    }

    function _rollBattlePower(
        uint256 armyId,
        Army storage army,
        uint256 surgeBp,
        bytes32 seed,
        uint256 nonce,
        uint256 sideNonce
    ) internal view returns (uint256 power) {
        uint256 attackStat = army.attack;
        if (surgeBp > 0) {
            attackStat = (attackStat * (10_000 + surgeBp)) / 10_000;
        }
        uint256 levelBonusBp = army.level * 250;
        attackStat = (attackStat * (10_000 + levelBonusBp)) / 10_000;

        uint256 roll = 9_000
            + (
                uint256(
                    keccak256(
                        abi.encode(
                            seed,
                            nonce,
                            sideNonce,
                            armyId,
                            army.currentMP,
                            army.maxMP,
                            army.attack,
                            army.defense,
                            army.level,
                            army.pendingSurgeBp
                        )
                    )
                ) % 2_001
            );
        power = army.currentMP * attackStat;
        power = (power * roll) / 10_000;
    }

    function _applyDefenseMitigation(uint256 loss, uint256 defense) internal pure returns (uint256) {
        uint256 mitigationBonusBp = defense * 20;
        if (mitigationBonusBp > 6_000) mitigationBonusBp = 6_000;
        uint256 divisor = 10_000 + mitigationBonusBp;
        return (loss * 10_000) / divisor;
    }

    function _calculateRequisitionGain(uint8 resourceKey, uint256 amount, ConsumptionSource source)
        internal
        view
        returns (uint256 reqGain)
    {
        uint256 resourceValue = resourceRequisitionValues[resourceKey];
        if (resourceValue == 0) return 0;
        uint16 reqBp = _requisitionBpForSource(source);
        reqGain = (amount * resourceValue * reqBp) / 10_000;
    }

    function _requisitionBpForSource(ConsumptionSource source) internal view returns (uint16) {
        if (source == ConsumptionSource.EmpireNeeds) return requisitionRates.empireNeedsBp;
        if (source == ConsumptionSource.EmpireWants) return requisitionRates.empireWantsBp;
        if (source == ConsumptionSource.ArmyNeeds) return requisitionRates.armyNeedsBp;
        if (source == ConsumptionSource.ArmyWants) return requisitionRates.armyWantsBp;
        return requisitionRates.improvementBp;
    }

    // MVP trust model: permissionless modules can mutate bounded core state through host calls.
    function _dispatchHook(bytes32 hookId, bytes memory payload) internal {
        for (uint256 i = 0; i < eventTemplateIds.length; i++) {
            bytes32 templateId = eventTemplateIds[i];
            EventTemplate storage template = eventTemplates[templateId];
            if (template.enabled && template.hookId == hookId) {
                emit EventTemplateTriggered(templateId, hookId, payload);
            }
        }

        for (uint256 i = 0; i < eventModules.length; i++) {
            address module = eventModules[i];
            if (!isEventModule[module]) continue;
            try ICoalitionEventModule(module).onGameHook(hookId, payload) returns (
                ICoalitionEventModule.HostCall[] memory hostCalls
            ) {
                _applyModuleHostCalls(module, hookId, hostCalls);
            } catch (bytes memory reason) {
                emit HookDispatchFailed(module, hookId, reason);
            }
        }
    }

    function _applyModuleHostCalls(address module, bytes32 hookId, ICoalitionEventModule.HostCall[] memory hostCalls)
        internal
    {
        if (hostCalls.length > MAX_MODULE_HOST_CALLS_PER_HOOK) {
            emit ModuleHostCallRejected(module, hookId, 0, "TOO_MANY_CALLS");
            return;
        }

        for (uint256 i = 0; i < hostCalls.length; i++) {
            _applySingleModuleCall(module, hookId, hostCalls[i]);
        }
    }

    function _applySingleModuleCall(address module, bytes32 hookId, ICoalitionEventModule.HostCall memory callData)
        internal
    {
        ModuleOp op = ModuleOp(callData.op);

        if (op == ModuleOp.GrantIntel) {
            int256 delta = _clampModuleDelta(callData.a);
            _adjustCoalitionIntel(delta);
        } else if (op == ModuleOp.GrantConfidence) {
            int256 delta = _clampModuleDelta(callData.a);
            _adjustCoalitionConfidence(delta);
        } else if (op == ModuleOp.QueueRequisition) {
            uint256 amount = callData.c;
            if (amount > MAX_MODULE_REQUISITION_PER_CALL) amount = MAX_MODULE_REQUISITION_PER_CALL;
            _queueRequisition(amount);
        } else if (op == ModuleOp.ApplyEmpireApproval) {
            uint256 empireId = callData.c;
            Empire storage empire = empires[empireId];
            if (!empire.exists) {
                emit ModuleHostCallRejected(module, hookId, callData.op, "UNKNOWN_EMPIRE");
                return;
            }
            empire.approval = _clampInt(empire.approval + _clampModuleDelta(callData.a), -100, 100);
        } else if (op == ModuleOp.ApplyEmpireAggravation) {
            uint256 empireId = callData.c;
            Empire storage empire = empires[empireId];
            if (!empire.exists) {
                emit ModuleHostCallRejected(module, hookId, callData.op, "UNKNOWN_EMPIRE");
                return;
            }
            empire.aggravation = _clampInt(empire.aggravation + _clampModuleDelta(callData.a), 0, 100);
        } else if (op == ModuleOp.ApplyArmyAttack) {
            uint256 armyId = callData.c;
            Army storage army = armies[armyId];
            if (!army.exists) {
                emit ModuleHostCallRejected(module, hookId, callData.op, "UNKNOWN_ARMY");
                return;
            }
            int256 delta = _clampModuleDelta(callData.a);
            uint256 nextAttack = _applySignedToUint(army.attack, delta);
            if (nextAttack == 0) nextAttack = 1;
            army.attack = nextAttack;
        } else if (op == ModuleOp.ApplyArmyDefense) {
            uint256 armyId = callData.c;
            Army storage army = armies[armyId];
            if (!army.exists) {
                emit ModuleHostCallRejected(module, hookId, callData.op, "UNKNOWN_ARMY");
                return;
            }
            army.defense = _applySignedToUint(army.defense, _clampModuleDelta(callData.a));
        } else if (op == ModuleOp.ApplyArmyCurrentMP) {
            uint256 armyId = callData.c;
            Army storage army = armies[armyId];
            if (!army.exists) {
                emit ModuleHostCallRejected(module, hookId, callData.op, "UNKNOWN_ARMY");
                return;
            }
            uint256 nextCurrent = _applySignedToUint(army.currentMP, _clampModuleDelta(callData.a));
            if (nextCurrent > army.maxMP) nextCurrent = army.maxMP;
            army.currentMP = nextCurrent;
        } else if (op == ModuleOp.ApplyArmyMaxMP) {
            uint256 armyId = callData.c;
            Army storage army = armies[armyId];
            if (!army.exists) {
                emit ModuleHostCallRejected(module, hookId, callData.op, "UNKNOWN_ARMY");
                return;
            }
            uint256 nextMax = _applySignedToUint(army.maxMP, _clampModuleDelta(callData.a));
            if (nextMax == 0) nextMax = 1;
            army.maxMP = nextMax;
            if (army.currentMP > army.maxMP) army.currentMP = army.maxMP;
        } else {
            emit ModuleHostCallRejected(module, hookId, callData.op, "UNKNOWN_OP");
            return;
        }

        emit ModuleHostCallApplied(module, hookId, callData.op, callData.a, callData.b, callData.c, callData.d);
    }

    function _clampModuleDelta(int256 delta) internal pure returns (int256) {
        if (delta > MAX_MODULE_ABS_DELTA) return MAX_MODULE_ABS_DELTA;
        if (delta < -MAX_MODULE_ABS_DELTA) return -MAX_MODULE_ABS_DELTA;
        return delta;
    }

    function _requireEmpireSource(ConsumptionSource source) internal pure {
        require(
            source == ConsumptionSource.EmpireNeeds || source == ConsumptionSource.EmpireWants
                || source == ConsumptionSource.ImprovementSustainment,
            "CoalitionGame: invalid empire source"
        );
    }

    function _requireArmySource(ConsumptionSource source) internal pure {
        require(
            source == ConsumptionSource.ArmyNeeds || source == ConsumptionSource.ArmyWants,
            "CoalitionGame: invalid army source"
        );
    }

    function _applySignedToUint(uint256 value, int256 delta) internal pure returns (uint256) {
        if (delta >= 0) {
            return value + uint256(delta);
        }
        uint256 decrease = uint256(-delta);
        if (decrease >= value) {
            return 0;
        }
        return value - decrease;
    }

    function _applySignedToUintWithCap(uint256 value, int256 delta, uint256 cap) internal pure returns (uint256) {
        uint256 nextValue = _applySignedToUint(value, delta);
        if (nextValue > cap) return cap;
        return nextValue;
    }

    function _clampInt(int256 value, int256 minValue, int256 maxValue) internal pure returns (int256) {
        if (value < minValue) return minValue;
        if (value > maxValue) return maxValue;
        return value;
    }

    function _toInt256(uint256 value) internal pure returns (int256) {
        require(value <= uint256(type(int256).max), "CoalitionGame: int overflow");
        return int256(value);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
