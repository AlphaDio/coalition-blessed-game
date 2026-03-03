import { getAllImprovementRequests } from '../src/game/improvements/index.js';

const improvements = getAllImprovementRequests();

const mixedRoleImprovements = improvements.filter((improvement) => {
  const hasModifiers = Object.keys(improvement.modifiers || {}).length > 0;
  const hasCommodityOutputs = Object.entries(improvement.productionOutputs || {})
    .some(([commodity, qty]) => commodity !== 'requisition' && qty > 0);
  return hasModifiers && hasCommodityOutputs;
});

if (mixedRoleImprovements.length > 0) {
  throw new Error(`Mixed-role improvements found: ${mixedRoleImprovements.map((improvement) => improvement.id).join(', ')}`);
}

console.log('Improvement role separation OK');
