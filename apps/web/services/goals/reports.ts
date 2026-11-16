/** The card a sent group report became in a chat. Sending is retired (DEV-36); old cards open the group's Insights dashboard. */
export interface GroupReportCard {
  type: 'group_report'
  org_id: number
  org_slug: string
  usergroup_id: number
  group_name: string
  frameworks: string[]
  framework_names: string[]
  message: string
  summary: { learner_count: number; progress_percent: number; behind_count: number; plan_count: number; badges_earned: number }
  sent_on: string
}
