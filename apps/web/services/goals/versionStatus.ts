// Where an assignment's template version stands; pure, so it runs under the unit tests.
import type { BadgeSummary } from '@services/badges/badges'

/** Where an assignment's version stands; every assignment summary carries these. */
export interface AssignmentVersionStatus {
  version: number | null
  version_uuid?: string | null
  latest_version?: number | null
  latest_version_uuid?: string | null
  update_available?: boolean
  /** The badge its version earns (null: none). */
  badge?: BadgeSummary | null
}

/** Is there something an admin should decide about this assignment's version? */
export const needsVersionDecision = (assignment: AssignmentVersionStatus & { status?: string }) =>
  assignment.status !== 'ended' && !!assignment.update_available
