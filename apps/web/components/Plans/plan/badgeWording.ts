import type { TemplateDocument } from '@services/goals/types'

type Stages = Pick<TemplateDocument, 'stages'>

/** Whether any step of the plan waits for a reviewer's approval before it counts as done. */
export const needsReview = (document: Stages | null | undefined) =>
  !!document?.stages?.some((stage) => stage.steps?.some((step) => step.review_required))

/** When the badge is awarded, in words, saying so when a reviewer has to approve steps first. */
export const awardedWhen = (document: Stages | null | undefined) =>
  needsReview(document) ? 'Awarded when every step is done and approved.' : 'Awarded when a learner finishes every step.'

/** The dialog's subtitle: finishing every step of the plan, and their approval when steps need review. */
export const earnedBy = (document: Stages | null | undefined, title: string) =>
  needsReview(document) ? `Earned when every step of ${title} is done and approved` : `Earned by finishing every step of ${title}`

/** The note under "How it's earned" when steps need a reviewer's approval. */
export const reviewNote = 'Steps that need review count once a reviewer approves them.'
