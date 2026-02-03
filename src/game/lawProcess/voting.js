/**
 * Tally votes for a law
 * @param {Object} lawProcess - Law process
 * @param {Object} state - Game state
 * @returns {Object} Tally result with passed flag and log
 */
export function tallyVotes(lawProcess, state) {
  const log = [];
  const policy = state.powerSystemPolicy;

  if (!policy) {
    log.push('ERROR: No power system policy defined');
    return { passed: false, log };
  }

  // Get law definition to check for enactment bonus
  const lawDef = state.lawDefinitions.find(l => l.id === lawProcess.lawId);
  const enactmentBonus = lawDef?.modifiers?.enactment_chance_bonus || 0;

  let totalVotes = 0;
  let supportVotes = 0;
  let opposeVotes = 0;
  let abstainVotes = 0;

  state.empires.forEach(empire => {
    const stance = lawProcess.empireStances[empire.id];
    if (!stance) return;

    // Calculate votes for this empire
    const votes = calculateEmpireVotes(empire, policy, state);
    totalVotes += votes;

    // Apply vote intent
    if (stance.vote_intent === 'support') {
      supportVotes += votes;
    } else if (stance.vote_intent === 'oppose') {
      opposeVotes += votes;
    } else {
      abstainVotes += votes;
    }

    log.push(`  ${empire.name}: ${stance.vote_intent} (${votes} votes)`);
  });

  const quorumNeeded = totalVotes * policy.config.quorum_threshold;
  // Apply enactment bonus by reducing the threshold needed
  const basePassThreshold = policy.config.pass_threshold;
  const adjustedPassThreshold = Math.max(0, basePassThreshold - enactmentBonus);
  const votesNeeded = totalVotes * adjustedPassThreshold;
  const totalCast = supportVotes + opposeVotes;

  log.push(`\nVote Tally:`);
  log.push(`  Support: ${supportVotes}`);
  log.push(`  Oppose: ${opposeVotes}`);
  log.push(`  Abstain: ${abstainVotes}`);
  log.push(`  Quorum: ${totalCast}/${quorumNeeded.toFixed(1)} ${totalCast >= quorumNeeded ? 'âœ“' : 'âœ—'}`);

  if (enactmentBonus > 0) {
    const adjustedPercentage = (adjustedPassThreshold * 100).toFixed(0);
    const bonusPercentage = (enactmentBonus * 100).toFixed(0);
    log.push(`  Pass threshold: ${supportVotes}/${votesNeeded.toFixed(1)} (${adjustedPercentage}% with +${bonusPercentage}% bonus) ${supportVotes >= votesNeeded ? 'âœ“' : 'âœ—'}`);
  } else {
    log.push(`  Pass threshold: ${supportVotes}/${votesNeeded.toFixed(1)} ${supportVotes >= votesNeeded ? 'âœ“' : 'âœ—'}`);
  }

  const passed = totalCast >= quorumNeeded && supportVotes >= votesNeeded;

  return { passed, log, supportVotes, opposeVotes, abstainVotes };
}

/**
 * Calculate votes for an empire based on power system
 * @param {Object} empire - Empire
 * @param {Object} policy - Power system policy
 * @param {Object} state - Game state
 * @returns {number} Number of votes
 */
export function calculateEmpireVotes(empire, policy, state) {
  let votes = policy.config.base_votes_per_empire || 1;

  if (policy.type === 'pressure_weighted') {
    // Votes increase with population
    const pressure = empire.stats.population || 1000;
    votes += Math.floor(pressure * policy.config.pressure_multiplier);
  } else if (policy.type === 'hegemonic') {
    // Top empire by population gets bonus
    const maxPopulation = Math.max(...state.empires.map(e => e.stats.population || 1000));
    if (empire.stats.population === maxPopulation) {
      votes += policy.config.hegemonic_bonus || 0;
    }
  }

  return votes;
}
