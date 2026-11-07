import type { Catalog, Household, Line, Phase, Side } from '@services/life/life'
import { levelOf } from '@components/Goals/phases/setup'
import { tr } from '@/lib/tr'
import { DEFAULT_HOURS, uid } from './model'

/*
 * Budget pre-fill: the lines a phase's picks (where, how you live, what you're doing) suggest, and what
 * changes in a budget when a pick changes. The amounts come from sourced estimates looked up for each
 * line; a suggested line with no source yet is still offered, with no amount.
 */

/** A line the picks suggest, before it is in the budget. */
export interface Suggestion { item: string; cat: string; side: Side; title: string; settings: Record<string, any>; hours?: number | null }

const singular = (t: string) => t.split(/,| and /)[0].trim().replace(/s$/, '')
const SHARED = ['own', 'roommates', 'partner']

/** The knobs a split line starts with: how many share it, and the bedrooms that takes. Kids you provide
 *  for add a bedroom for every two (HUD's usual two people to a bedroom). */
export function shareSettings(living: string | null | undefined, share?: number, household?: Household | null) {
  const n = share ?? (living === 'roommates' ? 2 : living === 'partner' ? 2 : 1)
  const kids = household?.kids?.length || 0
  return { share: n, bedrooms: (living === 'partner' ? 1 : Math.max(1, n)) + Math.ceil(kids / 2) }
}

/** Every line the phase's picks suggest, in budget order. */
export function suggestLines(p: Phase, catalog?: Catalog): Suggestion[] {
  const title = (item: string, en: string) => tr(`phases.lines.${item}`, catalog?.items.find((i) => i.key === item)?.title || en)
  const acts = p.activities || []
  const learning = acts.some((a) => a.kind === 'learning')
  const out: Suggestion[] = []
  for (const a of acts) {
    const soc = a.career?.slice(0, 7)
    if (a.kind === 'working' && soc && !a.apprentice && !out.some((s) => s.item === 'job' && s.settings.soc === soc)) {
      const t = a.employer ? tr('phases.lines.pay_at', 'Pay at {{employer}}', { employer: a.employer }) : tr('phases.lines.pay_as', 'Pay as {{job}}', { job: singular(a.career_title || tr('phases.lines.a_worker', 'a worker')).toLowerCase() })
      out.push({ item: 'job', cat: 'work', side: 'in', title: t, settings: { soc, ...(a.career_title ? { soc_title: a.career_title } : {}) }, hours: learning ? DEFAULT_HOURS : 40 })
    }
  }
  const living = p.living
  if (living && SHARED.includes(living)) {
    out.push({ item: 'rent', cat: 'home', side: 'out', title: title('rent', 'Rent'), settings: shareSettings(living, undefined, p.household) })
    out.push({ item: 'utilities', cat: 'home', side: 'out', title: title('utilities', 'Utilities and internet'), settings: { share: shareSettings(living).share } })
  }
  const college = acts.find((a) => a.kind === 'learning' && levelOf(a.level)?.college)
  const school = college?.school_id || null
  if (living === 'dorm') out.push({ item: 'dorm', cat: 'home', side: 'out', title: title('dorm', 'Dorm'), settings: school ? { school, housing: 'on' } : { housing: 'on' } })
  else out.push({ item: 'groceries', cat: 'food', side: 'out', title: title('groceries', 'Groceries'), settings: { plan: 'moderate' } })
  out.push({ item: 'transport', cat: 'move', side: 'out', title: title('transport', 'Getting around'), settings: {} })
  if (college) {
    out.push({ item: 'tuition', cat: 'school', side: 'out', title: title('tuition', 'Tuition and fees'), settings: school ? { school, residency: 'in' } : {} })
    out.push({ item: 'books', cat: 'school', side: 'out', title: title('books', 'Books and supplies'), settings: school ? { school } : {} })
  }
  out.push({ item: 'going_out', cat: 'fun', side: 'out', title: title('going_out', 'Going out'), settings: {} })
  out.push({ item: 'phone', cat: 'bills', side: 'out', title: title('phone', 'Phone plan'), settings: {} })
  out.push({ item: 'clothes', cat: 'bills', side: 'out', title: title('clothes', 'Clothes'), settings: {} })
  out.push({ item: 'personal_care', cat: 'bills', side: 'out', title: title('personal_care', 'Personal care'), settings: {} })
  return out
}

/** Settings a suggestion sets on a line that's already there (which school, which job); knobs like the split are the learner's. */
const PICKED = ['soc', 'soc_title', 'school', 'housing', 'residency']

export const fits = (l: Line, s: Suggestion) => l.item === s.item && (s.item !== 'job' || l.settings?.soc === s.settings.soc)

export type RowKind = 'add' | 'remove' | 'change'
export interface Row {
  id: string
  kind: RowKind
  item: string
  cat: string
  side: Side
  title: string
  /** The budget line it changes or removes. */
  line?: Line
  /** The line as it would be with the change: new lines, or a line with the new picks' settings. */
  next?: Line
}

/**
 * What the picks change in a budget. `base` is the phase before the change (null when starting or
 * filling in): its suggested lines that the new picks no longer suggest are removed. Every other line
 * with an estimate comes back as a change to check; the caller keeps the ones whose amount moved.
 */
export function planRows(base: Phase | null, now: Phase, catalog?: Catalog): Row[] {
  const sugg = suggestLines(now, catalog)
  const was = base ? suggestLines(base, catalog) : []
  const rows: Row[] = []
  for (const s of sugg) {
    if (now.lines.some((l) => fits(l, s))) continue
    // On a change, only lines the change brings in: one the old picks suggested too was already offered, and left out.
    if (base && was.some((x) => x.item === s.item && (s.item !== 'job' || x.settings.soc === s.settings.soc))) continue
    rows.push({ id: `add:${s.item}:${s.settings.soc || ''}`, kind: 'add', item: s.item, cat: s.cat, side: s.side, title: s.title, next: { id: uid('l'), cat: s.cat, item: s.item, title: s.title, side: s.side, settings: { ...s.settings }, hours: s.hours ?? null, start: 0, own: null } })
  }
  for (const l of now.lines) {
    if (!l.item) continue
    const s = sugg.find((x) => fits(l, x))
    if (!s && was.some((x) => fits(l, x))) { rows.push({ id: `rm:${l.id}`, kind: 'remove', item: l.item, cat: l.cat, side: l.side, title: l.title, line: l }); continue }
    if (!catalog?.items.find((i) => i.key === l.item)?.metric) continue
    const picked: Record<string, any> = s ? Object.fromEntries(PICKED.filter((k) => k in s.settings).map((k) => [k, s.settings[k]])) : {}
    // A new way of living (roommates to your own place) starts the split over; otherwise the split is the learner's.
    const moved = base && (base.living !== now.living || JSON.stringify(base.household || null) !== JSON.stringify(now.household || null))
    if (s && moved) for (const k of ['share', 'bedrooms']) if (k in s.settings) picked[k] = s.settings[k]
    rows.push({ id: `ch:${l.id}`, kind: 'change', item: l.item, cat: l.cat, side: l.side, title: l.title, line: l, next: { ...l, settings: { ...l.settings, ...picked } } })
  }
  return rows
}

/** The lines after applying the rows that are on. A line on our estimate that's left unticked keeps its old amount as the learner's own. */
// eslint-disable-next-line no-unused-vars -- parameter names in function types
export function applyRows(lines: Line[], rows: Row[], on: (r: Row) => boolean, oldMonthly: (r: Row) => number | null): Line[] {
  let out = lines.map((l) => ({ ...l }))
  for (const r of rows) {
    if (r.kind === 'add' && on(r) && r.next) out.push({ ...r.next })
    if (r.kind === 'remove' && on(r)) out = out.filter((l) => l.id !== r.line!.id)
    if (r.kind === 'change') {
      const i = out.findIndex((l) => l.id === r.line!.id)
      if (i < 0) continue
      if (on(r)) out[i] = { ...r.next!, own: null }
      else if (!r.line!.own) { const v = oldMonthly(r); if (v != null) out[i] = { ...out[i], own: { unit: 'mo', value: Math.round(v) } } }
    }
  }
  return out
}
