import { reviewHref } from '@components/Goals/admin/live/ui'
import { routePaths } from '@services/config/config'
import type { InboxGroup } from '@services/goals/admin'
import type { HomeAssignment, HomeCreator } from '@services/goals/adminHome'

const admin = routePaths.org.admin

/**
 * Where Home widgets send people. Assignment links all go through here so they can be repointed in
 * one place when the Assignments screens add an assignment page: a one-learner assignment opens
 * that learner's plan, anything else the Assignments list.
 */
export const homeLinks = {
  assignments: () => admin.assignments(),
  assignment: (row: Pick<HomeAssignment, 'assignment_uuid'>) => admin.planAssignment(row.assignment_uuid),
  /** The review queue for an inbox group; stalled learners have no step to review, so they open the Assignments inbox. */
  waiting: (group: Pick<InboxGroup, 'kind' | 'assignment_uuid' | 'step_key' | 'step_uuid' | 'activity_uuid'>) => group.kind === 'nudge'
    ? admin.assignments()
    : reviewHref({ assignment: group.assignment_uuid, stepKey: group.step_key, stepUuid: group.step_uuid, activity: group.activity_uuid }),
  reports: () => admin.people.root(),
  chat: (conversationUuid: string) => routePaths.org.chat(conversationUuid),
  messages: () => routePaths.org.connect(),
  edit: (item: HomeCreator['recent_edits'][number]) => (item.kind === 'template' ? admin.template(item.uuid) : admin.badge(item.uuid, 'analytics')),
  templates: () => admin.templates(),
  badges: () => admin.badges(),
}
