// The goal model as the API returns it. Mirrors apps/api/src/services/goals.

export type StepTypeKey = 'task' | 'upload' | 'write' | 'activity' | 'event' | 'badge' | 'portfolio' | 'decision' | 'routine' | 'explore'
export type StepStatus = 'not_started' | 'in_progress' | 'submitted' | 'changes_requested' | 'completed' | 'excused'
export type NodeState = 'locked' | 'open' | 'started' | 'waiting' | 'retry' | 'done'
export type StepCompleter = 'learner' | 'staff'
export type CompletionMethod = 'learner' | 'staff' | 'auto'
export type StepOrder = 'any' | 'in_order' | 'by_stage'
export type GoalStatus = 'draft' | 'pending' | 'active' | 'finished' | 'archived'
export type GoalOwnership = 'personal' | 'external'
export type GoalSource = 'none' | 'assignment' | 'badge' | 'starter' | 'template'
export type EntryKind = 'file' | 'link' | 'item' | 'resource' | 'note' | 'log'

export const DONE_STATUSES: StepStatus[] = ['completed', 'excused']

export interface PersonSummary {
  id: number
  user_uuid?: string
  username: string
  name: string
  avatar_image?: string | null
}

export interface TaskConfig { list?: { label?: string; target?: number; item_kind?: 'text' | 'link' } }
export interface UploadSlot { key: string; label: string; kinds: Array<'image' | 'video' | 'document' | 'link'>; optional?: boolean }
export interface UploadConfig { slots: UploadSlot[] }
export interface WriteConfig { prompt?: string; max_words?: number }
export interface ActivityConfig { activity_uuid: string }
export interface EventConfig { date?: string; start_time?: string; end_time?: string; place?: string; url?: string; rsvp?: boolean; reflection_prompt?: string }
export interface BadgeConfig { badge_uuid: string; accept_previous_major_versions?: boolean }
export interface PortfolioConfig { check: 'welcome' | 'timeline' | 'project' | 'traits' | 'launch' | 'badges' }
export interface DecisionOption { key: string; label: string }
export interface DecisionConfig { question?: string; options: DecisionOption[]; multiple?: boolean; allow_other?: boolean }
export interface ExploreConfig { question?: string; suggestions?: Array<{ resource_uuid: string; title?: string }> }
export interface RoutineFollowUp { after_days: number; statuses: string[] }
export interface RoutineConfig { cadence?: 'weekly'; target: number; entry_kind?: 'named' | 'count'; item_label?: string; end_date?: string; end_after?: number; follow_up?: RoutineFollowUp }

export interface StepConfigs {
  task: TaskConfig
  upload: UploadConfig
  write: WriteConfig
  activity: ActivityConfig
  event: EventConfig
  badge: BadgeConfig
  portfolio: PortfolioConfig
  decision: DecisionConfig
  routine: RoutineConfig
  explore: ExploreConfig
}

export type StepResult =
  | { kind: 'items'; items: Array<{ title: string; url: string; done: boolean }> }
  | { kind: 'files'; files: Array<{ slot: string | null; title: string; url: string; asset_id: number | null }> }
  | { kind: 'text'; text: string }
  | { kind: 'rsvp'; rsvp: 'yes' | 'no' | 'maybe' }
  | { kind: 'choice'; choices: string[]; reason: string }
  | { kind: 'explore'; answer: string; count: number; thumbs: Array<{ kind: string; title: string; url: string; image: string }> }
  | { kind: 'routine'; target: number; this_week: number; total: number; weeks: Array<{ start: string; count: number }>; follow_ups_due: number }

export interface StepEntry {
  entry_uuid: string
  kind: EntryKind
  slot: string | null
  title: string
  url: string
  asset_id: number | null
  resource_uuid: string | null
  note: string
  done: boolean
  period_start: string | null
  follow_up_status: string | null
  follow_up_due: string | null
  data: Record<string, unknown>
  creation_date: string
}

export type LockReason =
  | { kind: 'after'; step_uuid: string; title: string }
  | { kind: 'held' }
  | { kind: 'opens'; date: string }

export interface FeedbackItem {
  message: string
  user_id: number | null
  created_at: string
}

export interface Step<T extends StepTypeKey = StepTypeKey> {
  step_uuid: string
  stage_uuid: string | null
  position: number
  type: T
  title: string
  description: string
  config: StepConfigs[T]
  materials: Array<Record<string, unknown>>
  completed_by: StepCompleter
  review_required: boolean
  start_date: string | null
  due_date: string | null
  allow_late: boolean
  held: boolean
  after_step_uuids: string[]
  requirement_links: Array<{ node_uuid: string; code?: string; title?: string; framework_uuid?: string }>
  status: StepStatus
  locked: boolean
  locked_reason: LockReason | null
  state: NodeState
  fraction: number
  result: StepResult | null
  submission: Record<string, any>
  answer: string
  learner_note: string
  reviewer_note: string
  feedback_history: FeedbackItem[]
  completed_at: string | null
  completion_method: CompletionMethod | null
  entries: StepEntry[]
  /** What an activity, badge or portfolio step points at, for its card. */
  reference?: { title?: string; thumbnail_image?: string | null; badge_uuid?: string; activity_uuid?: string; page_count?: number } | null
  // Staff only.
  reviewer_guidance?: string
  staff_notes?: FeedbackItem[]
}

export interface Stage {
  stage_uuid: string
  position: number
  title: string
  description: string
  timing: string
  /** What reaching the end of the stage looks like. */
  milestone: string
  start_date: string | null
  due_date: string | null
  steps: Step[]
}

/** The marks a learner can give their own goal (the API's GOAL_ICONS). */
export type GoalIcon = 'target' | 'book' | 'briefcase' | 'graduation' | 'heart' | 'dumbbell' | 'palette' | 'music' | 'code' | 'leaf' | 'home' | 'rocket'

/** A date or ordering in a plan that can't all come true; the API's schedule.conflicts. */
export interface ScheduleWarning {
  kind: 'stage_dates' | 'stage_order' | 'step_dates' | 'step_before_stage' | 'step_after_stage' | 'waits_on_later' | 'due_before_wait'
  message: string
  stage_uuid: string | null
  step_uuid: string | null
}

export interface Goal {
  goal_uuid: string
  title: string
  description: string
  icon?: GoalIcon | null
  ownership: GoalOwnership
  source: GoalSource
  status: GoalStatus
  step_order: StepOrder
  org_id: number | null
  start_date: string | null
  target_date: string | null
  finished_at: string | null
  finish: { reached?: 'yes' | 'partly' | 'changed'; what_happened?: string; renamed_from?: string }
  owner: PersonSummary | null
  subject: PersonSummary | null
  capabilities: string[]
  progress: { done: number; total: number }
  stages: Stage[]
  unstaged_steps: Step[]
  /** The one stage the goal is on now (a goal moves on by hand or when a stage's start date arrives). */
  current_stage_uuid?: string | null
  schedule_warnings?: ScheduleWarning[]
}

export interface GoalSummary {
  goal_uuid: string
  title: string
  icon?: GoalIcon | null
  ownership: GoalOwnership
  source: GoalSource
  status: GoalStatus
  target_date: string | null
  progress: { done: number; total: number }
  is_subject: boolean
  /** Coach's open notes on the goal (the owner's own). */
  coach_notes?: number
  [key: string]: unknown
}

export const goalSteps = (goal: Goal): Step[] => [...goal.stages.flatMap((stage) => stage.steps), ...goal.unstaged_steps]

export const can = (goal: Pick<Goal, 'capabilities'> | undefined, capability: string) => !!goal?.capabilities.includes(capability)

// Template documents (admin and the connector).

export interface TemplateStep<T extends StepTypeKey = StepTypeKey> {
  key?: string
  type: T
  title: string
  description?: string
  config: StepConfigs[T]
  materials?: Array<Record<string, unknown>>
  completed_by: StepCompleter
  review_required?: boolean
  reviewer_guidance?: string
  after?: string[]
  due_week?: number | null
  allow_late?: boolean
  requirement_node_uuids?: string[]
}

export interface TemplateStage {
  key?: string
  title: string
  description?: string
  timing?: string
  duration_weeks?: number | null
  steps: TemplateStep[]
}

export interface TemplateRole {
  key: string
  name: string
  capabilities: string[]
  grantable_role_keys: string[]
}

export interface TemplateDocument {
  format: 'launch-lms.goal-template'
  format_version: 1
  template: { title: string; description?: string; instructions?: string; step_order: StepOrder }
  roles?: { definitions: TemplateRole[]; subject_role_key: string; staff_role_key: string } | null
  stages: TemplateStage[]
}

export interface TemplateVersion {
  version_uuid: string
  number: number
  note: string
  restored_from_number: number | null
  published_at: string | null
  published_by_user_id: number | null
  live: boolean
}

export interface GoalTemplate {
  template_uuid: string
  org_id: number
  title: string
  description: string
  thumbnail_image: string
  status: 'draft' | 'active' | 'archived'
  system_type: string | null
  etag: string
  published_version: number | null
  has_unpublished_changes: boolean
  update_date: string
  document?: TemplateDocument
  versions?: TemplateVersion[]
  [key: string]: unknown
}
