import { APPROVAL_BALANCE_CONSTANTS } from './constants.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getApprovalHeadroom(currentApproval) {
  const approval = Number.isFinite(Number(currentApproval)) ? Number(currentApproval) : 50;
  return clamp01((100 - Math.max(0, Math.min(100, approval))) / 100);
}

/**
 * Scale recurring positive approval gains so stacked per-tick effects do not
 * trivialize the approval system. Negative deltas are unchanged.
 */
export function scalePositiveApprovalGain(currentApproval, rawDelta) {
  const delta = Number(rawDelta);
  if (!Number.isFinite(delta) || delta <= 0) {
    return Number.isFinite(delta) ? delta : 0;
  }

  const headroom = getApprovalHeadroom(currentApproval);
  const baseScale = Number(APPROVAL_BALANCE_CONSTANTS.POSITIVE_GAIN_BASE_SCALE) || 0;
  const minScale = Number(APPROVAL_BALANCE_CONSTANTS.POSITIVE_GAIN_MIN_SCALE) || 0;
  const exponent = Number(APPROVAL_BALANCE_CONSTANTS.POSITIVE_GAIN_HEADROOM_EXPONENT) || 1;
  const scaled = baseScale * Math.pow(headroom, exponent);
  const scale = Math.max(minScale, scaled);

  return delta * scale;
}

