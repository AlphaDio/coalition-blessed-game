import { resolveAllLawProcesses, updatePlayerInfluence } from '../lawProcessManager.js';

export function handleLawProcesses(state, rng, log, logger) {
  if (state.lawProcesses && state.lawProcesses.length > 0) {
    logger.debug(`Resolving ${state.lawProcesses.length} law process(es)`);
    const lawLogs = resolveAllLawProcesses(state, rng);
    if (lawLogs.length > 0) {
      log.push(...lawLogs);
    }
    return;
  }

  if (state.playerInfluence !== undefined) {
    const prevInfluence = state.playerInfluence;
    updatePlayerInfluence(state);
    if (state.playerInfluence > prevInfluence) {
      // Player influence increases silently
    }
  }
}

