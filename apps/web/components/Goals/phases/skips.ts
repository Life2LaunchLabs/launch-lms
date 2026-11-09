import type { LifeDoc } from '@services/life/life'
import { tr } from '@/lib/tr'
import { byId, heldShape, kids, normalize, optionsOf, phaseId, rank, rejoinOf, splitOf } from './graph'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/* ---------- skips: an option with no phase of its own ---------- */

/*
 * A skip is a phase that takes no time (`pass`): one option beside the others, leading on to whatever
 * they lead to, which can be one phase, a group of options, or nothing yet. It never shows as a phase
 * in lists, the budget, or now and next.
 */

/** Can the options after `key` get a skip? Not when they already have one. */
export const canAddSkip = (doc: LifeDoc, key: string | null) => !!key && !optionsOf(doc, key).some((q) => q.pass)
/** Add a skip to the options after `key`, as the last choice. With one option, that phase becomes optional. */
export function addSkip(doc: LifeDoc, key: string): { doc: LifeDoc; id: string } {
  if (!canAddSkip(doc, key)) return { doc, id: '' }
  const options = optionsOf(doc, key), after = key.startsWith('g:') ? key.slice(2).split(',') : [key]
  const next = rank(doc, options.map((q) => q.id))
  // Where it leads: where the options meet again (a phase, or a group of options), or what follows a lone option.
  const meet = options.length > 1 ? rejoinOf(next, options) : undefined
  const onto = options.length === 1 ? kids(next, options[0].id) : meet ? (meet.after!.length > 1 ? optionsOf(next, splitOf(meet)!) : [meet]) : []
  const id = phaseId()
  next.phases.push({ id, title: tr('goals.plan_map.skip', 'Skip'), kind: 'other', pass: true, months: 1, lines: [], goals: [], after, rank: options.length, starts: options[0]?.starts })
  for (const k of onto) { const x = byId(next, k.id)!; x.after = [...(x.after || []), id] }
  return { doc: normalize(next), id }
}
/** "Make it optional": the phase becomes one option and a skip past it another. */
export const canMakeOptional = (doc: LifeDoc, id: string) => { const p = byId(doc, id); return !!p && !p.pass && !!p.after?.length && canAddSkip(doc, splitOf(p)) }
export function makeOptional(doc: LifeDoc, id: string): LifeDoc {
  const p = byId(doc, id)
  return p && canMakeOptional(doc, id) ? addSkip(doc, splitOf(p)!).doc : doc
}
/** A lifted line of phases dropped onto a skip: it takes the skip's place and becomes that option. */
export function fillSkip(lifted: LifeDoc, ids: string[], skipId: string): LifeDoc {
  const next = clone(lifted), head = byId(next, ids[0]), sk = byId(next, skipId), shape = heldShape(next, ids)
  if (!head || !sk?.pass || !shape.tail) return lifted
  head.after = sk.after || []
  head.rank = sk.rank
  for (const k of next.phases) if (k.after?.includes(skipId)) k.after = [...new Set(k.after.map((a) => (a === skipId ? shape.tail! : a)))]
  next.phases = next.phases.filter((x) => x.id !== skipId)
  return normalize(next)
}
