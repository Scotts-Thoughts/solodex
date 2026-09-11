/**
 * Compatibility shim. The stat formulas and badge tables moved to
 * `utils/damage/stats.ts` and `utils/damage/badges.ts`; the damage pipelines
 * live in `utils/damage/` (see docs/damage_calculator_plan.md).
 */
export * from './damage/stats'
export {
  BADGES_BY_GAME, allBadgeIds, applyBadgeStatBoost, badgeBoostsStat, hasBadgeTypeBoost,
  type Badge, type BadgeStat,
} from './damage/badges'
