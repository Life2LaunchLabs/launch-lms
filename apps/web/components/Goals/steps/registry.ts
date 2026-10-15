import type React from 'react'
import type { Goal, Step, StepConfigs, StepStatus, StepTypeKey } from '@services/goals/types'
import type { EntryInput } from '@services/goals/goals'

/** What a step card can do, already bound to its goal and step. Each call refreshes the goal. */
export interface StepActions {
  busy: boolean
  // eslint-disable-next-line no-unused-vars
  setStatus: (status: StepStatus, note?: string) => Promise<void>
  // eslint-disable-next-line no-unused-vars
  saveSubmission: (data: { submission?: Record<string, unknown>; answer?: string; learner_note?: string }) => Promise<void>
  // eslint-disable-next-line no-unused-vars
  addEntry: (data: EntryInput) => Promise<void>
  // eslint-disable-next-line no-unused-vars
  updateEntry: (entryUuid: string, data: { title?: string; note?: string; done?: boolean; follow_up_status?: string | null }) => Promise<void>
  // eslint-disable-next-line no-unused-vars
  deleteEntry: (entryUuid: string) => Promise<void>
  /** Opens the activity player. */
  openActivity: () => void
}

export interface StepCardProps<T extends StepTypeKey = StepTypeKey> {
  goal: Goal
  step: Step<T>
  actions: StepActions
  /** The viewer can work on this step (fill it in, finish it). */
  canWork: boolean
  /** The viewer is staff on this goal. */
  staff: boolean
  orgslug: string
  token?: string
  viewerUserId?: number
}

export interface ConfigPanelProps<T extends StepTypeKey = StepTypeKey> {
  config: StepConfigs[T]
  // eslint-disable-next-line no-unused-vars
  onChange: (config: StepConfigs[T]) => void
  orgId?: number | null
  token?: string
}

export interface StepDefinition<T extends StepTypeKey = StepTypeKey> {
  type: T
  label: string
  /** One line on what the type is for, shown in the type picker. */
  hint: string
  icon: React.ElementType
  /** The row's status line while the step is open or started, when the type has something better than a due date. */
  // eslint-disable-next-line no-unused-vars
  statusLine?: (step: Step<T>) => string | null
  /** What the row shows once there's something to show (chips, list items, thumbnails, the answer or choice). */
  RowResult?: React.ComponentType<{ step: Step<T> }>
  /** The expanded card's body, worked on in place. */
  CardBody: React.ComponentType<StepCardProps<T>>
  /** The admin settings for the type. */
  ConfigPanel?: React.ComponentType<ConfigPanelProps<T>>
  defaultConfig: () => StepConfigs[T]
  /** Steps the learner can't finish by hand (activities, badges, portfolio checks). */
  finishesItself?: boolean
}
