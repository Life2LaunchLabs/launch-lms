/**
 * The review stack's tally (DEV-208). Approving finishes a learner's step; sending it back hands it
 * to them again, so it is reviewed but not done. The tally never calls sent-back work done.
 */
export function reviewTally(decided: Record<string, 'confirm' | 'flag'>, total: number): string {
  const marks = Object.values(decided)
  const sentBack = marks.filter((mark) => mark === 'flag').length
  return `${marks.length} of ${total} reviewed${sentBack ? ` · ${sentBack} sent back` : ''}`
}
