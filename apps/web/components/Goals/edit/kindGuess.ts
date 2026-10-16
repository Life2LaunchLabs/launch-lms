import type { StepTypeKey } from '@services/goals/types'

/** Kinds a step can be added as from one line: each works with its default settings. */
export const QUICK_KINDS: StepTypeKey[] = ['task', 'write', 'explore', 'decision', 'routine', 'upload', 'event']

const RULES: Array<[RegExp, StepTypeKey]> = [
  [/\b(every|each|per) (day|week|weekday|morning|evening)\b|\b(daily|weekly)\b|\b\d+ (times|x) (a|per) week\b/i, 'routine'],
  [/^(research|explore|find out|look into|learn about|look up|investigate)\b|^(what|how|where|why|who)\b.*\?$/i, 'explore'],
  [/^(decide|choose|pick|select|settle on)\b|\bwhich\b.*\?$/i, 'decision'],
  [/^(write|journal|reflect|draft|describe|note down|list)\b/i, 'write'],
  [/^(upload|photograph|scan|attach|record|submit)\b|\b(photo|screenshot|scan) of\b/i, 'upload'],
  [/^(meet|attend|visit|tour|interview|go to|join|call)\b|\b(meeting|appointment|open day|session|fair|interview)\b/i, 'event'],
]

/** A first guess at a step's kind from its wording ("Decide…" is a decision); a task when nothing fits. */
export function guessStepKind(title: string): StepTypeKey {
  const text = title.trim()
  return RULES.find(([pattern]) => pattern.test(text))?.[1] || 'task'
}
