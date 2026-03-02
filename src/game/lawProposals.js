import { getLogger } from '../modules/logger.js';
import { getAvailableLaws } from './lawDefinitions.js';
import { triggerHeroPassives } from './heroes/passives.js';
import { HERO_STATUS } from './heroes/constants.js';
import { computeAlignmentScore, getHeroEmpireId, getLawValues } from './heroes/utils.js';

export const LAW_PROPOSAL_STATUS = {
  PROPOSED: 'PROPOSED',
  IN_PROCESS: 'IN_PROCESS',
  ENACTED: 'ENACTED',
  WITHDRAWN: 'WITHDRAWN',
  EXPIRED: 'EXPIRED'
};

const LAW_PROPOSAL_COOLDOWN_TURNS = 12;
const MAX_PROPOSED_LAWS = 6;

function ensureProposalState(state) {
  if (!Array.isArray(state.proposedLaws)) {
    state.proposedLaws = [];
  }
}

function getProposalStatuses(statuses) {
  return new Set(Array.isArray(statuses) ? statuses : [statuses]);
}

export function getLawProposalById(state, proposalId) {
  ensureProposalState(state);
  return state.proposedLaws.find((proposal) => proposal.proposalId === proposalId) || null;
}

export function setLawProposalStatus(state, proposalId, status) {
  if (!proposalId) return null;
  const proposal = getLawProposalById(state, proposalId);
  if (!proposal) return null;
  proposal.status = status;
  return proposal;
}

export function getLawProposalsByStatus(state, statuses = LAW_PROPOSAL_STATUS.PROPOSED) {
  ensureProposalState(state);
  const allowed = getProposalStatuses(statuses);
  return state.proposedLaws.filter((proposal) => allowed.has(proposal.status));
}

export function getAvailableProposedLaws(state) {
  ensureProposalState(state);
  const lawDefinitions = state.lawDefinitions || [];
  const heroes = state.heroes || [];
  const empires = state.empires || [];

  return getLawProposalsByStatus(state, LAW_PROPOSAL_STATUS.PROPOSED)
    .map((proposal) => {
      const lawDef = lawDefinitions.find((law) => law.id === proposal.lawId);
      if (!lawDef) return null;

      const proposerHero = heroes.find((hero) => hero.id === proposal.proposerHeroId) || null;
      const proposerEmpireId = proposal.proposerEmpireId || getHeroEmpireId(proposerHero) || null;
      const proposerEmpire = proposerEmpireId
        ? empires.find((empire) => empire.id === proposerEmpireId) || null
        : null;

      return {
        ...proposal,
        law: lawDef,
        proposerHero,
        proposerEmpire
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const priorityDelta = (right.priority || 0) - (left.priority || 0);
      if (priorityDelta !== 0) return priorityDelta;
      const createdDelta = (left.createdTurn || 0) - (right.createdTurn || 0);
      if (createdDelta !== 0) return createdDelta;
      return String(left.proposalId).localeCompare(String(right.proposalId));
    });
}

function getNextProposalId(state) {
  ensureProposalState(state);
  return `proposal_${(state.turn || 0)}_${state.proposedLaws.length + 1}`;
}

function getTagOverlapScore(hero, lawDef) {
  const heroTags = new Set(hero?.tags || []);
  const lawTags = [...(lawDef?.law_tags || []), ...(lawDef?.tags || [])];
  if (heroTags.size === 0 || lawTags.length === 0) return 0;

  let overlap = 0;
  lawTags.forEach((tag) => {
    if (heroTags.has(tag)) {
      overlap += 1;
    }
  });

  return overlap * 0.08;
}

function getContextualPressureScore(state, lawDef) {
  const category = lawDef?.category || 'general';
  let score = 0;

  const requisition = state.coalitionEconomy?.requisition || 0;
  if (category === 'economy' && requisition < 350) {
    score += 0.12;
  }

  if (category === 'military' && (state.scourgeFervor || 0) >= 55) {
    score += 0.12;
  }

  if (category === 'governance' && (state.coalitionCohesion || 0) <= 55) {
    score += 0.12;
  }

  return score;
}

function scoreLawProposal(state, hero, empire, lawDef, rng) {
  const lawValues = getLawValues(lawDef);
  const heroAlignment = computeAlignmentScore(lawValues, hero?.values || {});
  const empireAlignment = computeAlignmentScore(lawValues, empire?.values || {});
  const tagScore = getTagOverlapScore(hero, lawDef);
  const tierScore = ((lawDef?.tier || 1) - 1) * 0.05;
  const contextualScore = getContextualPressureScore(state, lawDef);
  const jitter = typeof rng === 'function' ? (rng() * 0.01) : 0;

  return (heroAlignment * 0.55) + (empireAlignment * 0.30) + tagScore + tierScore + contextualScore + jitter;
}

export function generateHeroLawProposals(state, rng = Math.random, log = []) {
  ensureProposalState(state);
  if (!Array.isArray(state.heroes) || state.heroes.length === 0) return [];

  const logger = getLogger();
  const created = [];
  const activeStatuses = [LAW_PROPOSAL_STATUS.PROPOSED, LAW_PROPOSAL_STATUS.IN_PROCESS];
  const activeLawIds = new Set(getLawProposalsByStatus(state, activeStatuses).map((proposal) => proposal.lawId));
  const activeProposers = new Set(
    getLawProposalsByStatus(state, activeStatuses).map((proposal) => proposal.proposerHeroId).filter(Boolean)
  );

  for (const hero of state.heroes) {
    if ((state.proposedLaws || []).filter((proposal) => proposal.status === LAW_PROPOSAL_STATUS.PROPOSED).length >= MAX_PROPOSED_LAWS) {
      break;
    }
    if (!hero || hero.status === HERO_STATUS.EXILED) continue;
    if (activeProposers.has(hero.id)) continue;

    hero.cooldowns = hero.cooldowns || {};
    if ((hero.cooldowns.law_proposal || 0) > 0) continue;

    const empireId = getHeroEmpireId(hero);
    const empire = (state.empires || []).find((candidate) => candidate.id === empireId) || null;

    const candidates = getAvailableLaws(state).filter((lawDef) => !activeLawIds.has(lawDef.id));
    if (candidates.length === 0) break;

    const ranked = candidates
      .map((lawDef) => ({
        lawDef,
        score: scoreLawProposal(state, hero, empire, lawDef, rng)
      }))
      .sort((left, right) => right.score - left.score);

    const topChoice = ranked[0];
    if (!topChoice || topChoice.score < -0.6) continue;

    const proposal = {
      proposalId: getNextProposalId(state),
      lawId: topChoice.lawDef.id,
      proposerHeroId: hero.id,
      proposerEmpireId: empireId,
      createdTurn: state.turn || 0,
      status: LAW_PROPOSAL_STATUS.PROPOSED,
      priority: Math.round((topChoice.score + 1) * 50),
      proposalReason: buildProposalReason(hero, topChoice.lawDef, topChoice.score)
    };

    state.proposedLaws.push(proposal);
    hero.cooldowns.law_proposal = LAW_PROPOSAL_COOLDOWN_TURNS;
    activeLawIds.add(topChoice.lawDef.id);
    activeProposers.add(hero.id);
    created.push(proposal);

    const message = `${hero.name} proposed ${topChoice.lawDef.name}.`;
    log.push(message);
    logger.info(message);
    triggerHeroPassives(state, 'LAW_PROPOSED', {
      proposal,
      lawDef: topChoice.lawDef,
      proposerHero: hero
    }, log);
  }

  return created;
}

function buildProposalReason(hero, lawDef, score) {
  const tags = lawDef?.law_tags || [];
  if (tags.some((tag) => (hero?.tags || []).includes(tag))) {
    return `Aligned with ${hero.name}'s doctrine`;
  }
  if (score >= 0.55) {
    return 'Strong coalition alignment';
  }
  if ((lawDef?.tier || 1) >= 3) {
    return 'High-impact agenda push';
  }
  return 'Political opportunity window';
}
