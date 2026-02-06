/**
 * Tally votes for a law.
 * @param {Object} lawProcess - Law process
 * @param {Object} state - Game state
 * @param {Object} options - Optional tally overrides
 * @returns {Object} Tally result with passed flag and log
 */
export function tallyVotes(lawProcess, state, options = {}) {
  const log = [];
  const policy = state.powerSystemPolicy;
  const passThresholdOverride = Number.isFinite(options.passThresholdOverride)
    ? options.passThresholdOverride
    : null;
  const quorumThresholdOverride = Number.isFinite(options.quorumThresholdOverride)
    ? options.quorumThresholdOverride
    : null;

  if (!policy) {
    log.push('ERROR: No power system policy defined');
    return { passed: false, log };
  }

  // Keep existing law enactment bonus behavior unless caller provides explicit threshold.
  const lawDef = state.lawDefinitions.find(l => l.id === lawProcess.lawId);
  const enactmentBonus = lawDef?.modifiers?.enactment_chance_bonus || 0;

  let totalVotes = 0;
  let supportVotes = 0;
  let opposeVotes = 0;
  let abstainVotes = 0;

  state.empires.forEach(empire => {
    const stance = lawProcess.empireStances[empire.id];
    if (!stance) return;

    const votes = calculateEmpireVotes(empire, policy, state);
    totalVotes += votes;

    if (stance.vote_intent === 'support') {
      supportVotes += votes;
    } else if (stance.vote_intent === 'oppose') {
      opposeVotes += votes;
    } else {
      abstainVotes += votes;
    }

    log.push(`  ${empire.name}: ${stance.vote_intent} (${votes} votes)`);
  });

  const quorumThreshold = quorumThresholdOverride ?? policy.config.quorum_threshold;
  const quorumNeeded = totalVotes * quorumThreshold;
  const basePassThreshold = policy.config.pass_threshold;
  const passThreshold = passThresholdOverride ?? Math.max(0, basePassThreshold - enactmentBonus);
  const votesNeeded = totalVotes * passThreshold;
  const totalCast = supportVotes + opposeVotes;

  log.push('\nVote Tally:');
  log.push(`  Support: ${supportVotes}`);
  log.push(`  Oppose: ${opposeVotes}`);
  log.push(`  Abstain: ${abstainVotes}`);
  log.push(`  Quorum: ${totalCast}/${quorumNeeded.toFixed(1)} ${totalCast >= quorumNeeded ? '[PASS]' : '[FAIL]'}`);

  if (passThresholdOverride !== null) {
    const pct = (passThreshold * 100).toFixed(0);
    log.push(`  Pass threshold: ${supportVotes}/${votesNeeded.toFixed(1)} (${pct}% adjusted) ${supportVotes >= votesNeeded ? '[PASS]' : '[FAIL]'}`);
  } else if (enactmentBonus > 0) {
    const pct = (passThreshold * 100).toFixed(0);
    const bonusPct = (enactmentBonus * 100).toFixed(0);
    log.push(`  Pass threshold: ${supportVotes}/${votesNeeded.toFixed(1)} (${pct}% with +${bonusPct}% bonus) ${supportVotes >= votesNeeded ? '[PASS]' : '[FAIL]'}`);
  } else {
    log.push(`  Pass threshold: ${supportVotes}/${votesNeeded.toFixed(1)} ${supportVotes >= votesNeeded ? '[PASS]' : '[FAIL]'}`);
  }

  const passed = totalCast >= quorumNeeded && supportVotes >= votesNeeded;

  return {
    passed,
    log,
    supportVotes,
    opposeVotes,
    abstainVotes,
    totalVotes,
    quorumThreshold,
    passThreshold
  };
}

/**
 * Calculate votes for an empire based on power system.
 * @param {Object} empire - Empire
 * @param {Object} policy - Power system policy
 * @param {Object} state - Game state
 * @returns {number} Number of votes
 */
export function calculateEmpireVotes(empire, policy, state) {
  let votes = policy.config.base_votes_per_empire || 1;

  if (policy.type === 'pressure_weighted') {
    const pressure = empire.stats.population || 1000;
    votes += Math.floor(pressure * policy.config.pressure_multiplier);
  } else if (policy.type === 'hegemonic') {
    const maxPopulation = Math.max(...state.empires.map(e => e.stats.population || 1000));
    if (empire.stats.population === maxPopulation) {
      votes += policy.config.hegemonic_bonus || 0;
    }
  }

  return votes;
}
