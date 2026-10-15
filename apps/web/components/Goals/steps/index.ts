import type { StepTypeKey } from '@services/goals/types'
import type { StepDefinition } from './registry'
import { decision } from './decision'
import { event } from './event'
import { activity, badge, portfolio } from './linked'
import { task } from './task'
import { upload } from './upload'
import { write } from './write'

/** The web step registry: one definition per step type, the only place a type's UI lives. */
export const STEP_TYPES: { [K in StepTypeKey]: StepDefinition<K> } = { task, upload, write, activity, event, badge, portfolio, decision }

export const STEP_TYPE_ORDER: StepTypeKey[] = ['task', 'upload', 'write', 'decision', 'event', 'activity', 'badge', 'portfolio']

export function stepDefinition<K extends StepTypeKey>(type: K): StepDefinition<K> {
  return (STEP_TYPES[type] || STEP_TYPES.task) as unknown as StepDefinition<K>
}

export type { StepActions, StepCardProps, StepDefinition, ConfigPanelProps } from './registry'
