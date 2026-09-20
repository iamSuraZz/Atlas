/*
 * The scheduler. LEARNING_ENGINE.md §4.
 *
 * Pure TypeScript: no framework, no database, no AI SDK, no clock. Enforced by
 * eslint.config.mjs, which is what keeps the two components most likely to be
 * wrong testable in milliseconds with nothing started.
 */
export * from './types'
export { rankCandidates, scorePriority } from './priority'
export { explain, explainText } from './explain'
export { budgetFor, buildPlan, reentryShapeFor } from './plan'
