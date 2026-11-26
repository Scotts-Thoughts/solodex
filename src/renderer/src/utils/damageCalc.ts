/**
 * Compatibility shim. The stat formulas and badge tables live in the shared
 * engine (`@stp/damage-calc/stats` and `/badges`, the `damage-calc/`
 * submodule), with the damage pipelines.
 */
export * from '@stp/damage-calc/stats'
export {
  BADGES_BY_GAME, allBadgeIds, applyBadgeStatBoost, badgeBoostsStat, hasBadgeTypeBoost,
  type Badge, type BadgeStat,
} from '@stp/damage-calc/badges'
