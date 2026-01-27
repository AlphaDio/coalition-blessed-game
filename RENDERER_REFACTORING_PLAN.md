/**
 * Renderer Refactoring Plan
 * 
 * Current: src/ui/renderer.js (2657 lines) - MASSIVE MONOLITH
 * 
 * Proposed Structure:
 * 
 * src/ui/
 * ├── renderer.js (200-300 lines) - Main export, delegates to modules
 * ├── panelFactory.js (300 lines) - Panel creation ✓ DONE
 * ├── viewRenderers.js (600 lines) - Info panel renderers (market, armies, empires, etc.)
 * ├── menuBuilder.js (500 lines) - Action menu builders (main, laws, emergency, requests)
 * ├── battleFormatters.js (200 lines) - Battle-specific formatting
 * ├── lawFormatters.js (300 lines) - Law-specific formatting
 * ├── marketFormatters.js (200 lines) - Market-specific formatting
 * └── formatters.js (EXPAND) - Generic text formatters
 * 
 * File-by-file breakdown:
 * 
 * 1. panelFactory.js ✓ DONE
 *    - createActiveFrontsBox
 *    - createActiveLawsBox
 *    - createStockpilesBox
 *    - createLawsBox
 *    - disableListSearch
 *    - createEventBox
 *    - createLogBox
 *    - attachLogHistory
 *    - createStatsBox
 *    - createCombinedInfoBox
 *    - createCommandInputs
 *    - createLogsWindow
 *    - disableWidgetInput
 * 
 * 2. viewRenderers.js
 *    - renderMarketView
 *    - renderMarketOrdersView
 *    - renderArmiesView
 *    - renderEmpiresView
 *    - renderStockpilesView
 *    - renderProcurementView
 *    - renderEmpireDetailView
 *    - renderCommodityDetailView
 *    - renderRequestsView
 *    - renderImprovementsQueueView
 * 
 * 3. menuBuilder.js
 *    - buildMainMenuItems
 *    - buildLawMenuItems
 *    - buildEmergencyMenuItems
 *    - buildRequestMenuItems
 *    - buildImprovementMenuItems
 *    - formatMenuItems
 *    - calculateVisibleLines
 *    - buildInfoSelectItems
 * 
 * 4. battleFormatters.js
 *    - formatActiveBattle
 *    - getBattleTypeTag
 *    - buildBattleMpBar
 * 
 * 5. lawFormatters.js
 *    - formatActiveLaw
 *    - getPhaseColor
 *    - getRejectColor
 *    - buildProgressBar
 *    - formatLawMeters
 * 
 * 6. marketFormatters.js
 *    - loadCommodityMap (moved from main)
 *    - sortMarketCommodities (moved from main)
 *    - formatMarketRow
 *    - getPriceColor
 *    - getSupplyDemandColors
 *    - formatVolume
 * 
 * 7. formatters.js (EXPAND)
 *    - formatProgressBar
 *    - formatSuggestionLabel
 *    - formatImprovementModifier
 *    - formatStats
 *    - filterRegularArmies
 *    - formatArmyBlock
 *    - appendInsurrectionInfo
 *    - formatEmpireBlock
 *    - formatActiveEvent
 *    - getActiveLawCount
 *    - formatDemandLine
 *    - formatEmpireMarketOrders
 *    - formatLawEffects
 *    - formatImprovementDetailLine
 *    - appendCoalitionEconomyInfo
 * 
 * 8. renderer.js (REFACTORED)
 *    - Imports all modules
 *    - export createUI() - delegates to panelFactory
 *    - export renderLaws() - assembles from modules
 *    - export renderActionPanel() - delegates to menuBuilder
 *    - export renderEvent()
 *    - export renderStats()
 *    - export renderStockpiles()
 *    - export renderTables()
 *    - export renderActiveFronts()
 *    - export renderActiveLaws()
 *    - export renderLog()
 *    - export renderLogsWindow()
 *    - export renderCombinedInfo() - delegates to viewRenderers
 *    - export renderAll() - orchestrates renders
 * 
 * Benefits:
 * ✓ Single responsibility principle
 * ✓ Easier to maintain and test
 * ✓ Faster to navigate
 * ✓ Easier to refactor/reuse
 * ✓ Better code organization
 */
