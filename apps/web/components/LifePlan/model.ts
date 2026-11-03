/**
 * Life plan arithmetic: monthly amounts, stretches inside a phase, and the month-by-month
 * projection of savings, things you own and debt. Pure functions; no estimates are made
 * here. A line with neither the learner's number nor a sourced estimate counts as missing.
 */
import type { Asset, Catalog, Debt, Estimate, LifeDoc, LifeEvent, Line, Phase, Unit } from '@services/life/life'

export type Per = 'wk' | 'mo' | 'yr'
export const PER_WORD: Record<Per, string> = { wk: 'week', mo: 'month', yr: 'year' }
export const UNIT_WORD: Record<Unit, string> = { hr: 'an hour', wk: 'a week', mo: 'a month', yr: 'a year' }
export const WEEKS_PER_MONTH = 52 / 12
export const DEFAULT_HOURS = 20

export const uid = (p = 'x') => `${p}${Math.random().toString(36).slice(2, 9)}`

export function toMonthly(value: number, unit: Unit, hours?: number | null): number {
  if (unit === 'hr') return value * (hours ?? 0) * WEEKS_PER_MONTH
  if (unit === 'wk') return value * WEEKS_PER_MONTH
  if (unit === 'yr') return value / 12
  return value
}
export function fromMonthly(m: number, per: Per | Unit, hours?: number | null): number {
  if (per === 'hr') return hours ? m / (hours * WEEKS_PER_MONTH) : 0
  if (per === 'wk') return m / WEEKS_PER_MONTH
  if (per === 'yr') return m * 12
  return m
}

export function money(v: number, opts: { cents?: boolean; sign?: boolean } = {}): string {
  const abs = Math.abs(v)
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : 0 })
  return `${v < 0 ? '−' : opts.sign && v > 0 ? '+' : ''}$${s}`
}
export function short(v: number): string {
  const a = Math.abs(v), sign = v < 0 ? '−' : ''
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`
  return `${sign}$${Math.round(a)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function monthLabel(start: string, g: number): string {
  const [y, m] = start.split('-').map(Number)
  const t = (m - 1) + g
  return `${MONTHS[((t % 12) + 12) % 12]} ${y + Math.floor(t / 12)}`
}
export const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export function phaseOffset(doc: LifeDoc, phaseId: string): number {
  let g = 0
  for (const p of doc.phases) { if (p.id === phaseId) return g; g += p.months }
  return g
}
export const totalMonths = (doc: LifeDoc) => doc.phases.reduce((a, p) => a + p.months, 0)
const gOf = (doc: LifeDoc, w?: { phase: string; month: number } | null) => (w ? phaseOffset(doc, w.phase) + w.month : 0)

/** The query that finds a line's estimate, or null when its item has no metric. */
export function estimateQuery(catalog: Catalog | undefined, phase: Phase, line: Line) {
  const item = catalog?.items.find((i) => i.key === line.item)
  if (!item?.metric) return null
  const dims: Record<string, any> = {}
  for (const d of catalog!.metrics[item.metric]?.dims || []) {
    const s = item.settings?.find((x) => x.key === d)
    const v = line.settings?.[d] ?? s?.default
    if (v !== undefined && v !== null && v !== '') dims[d] = v
  }
  return { id: `${phase.id}:${line.id}`, metric: item.metric, place: phase.place || null, dims }
}

export interface LineValue {
  /** Monthly amount, positive; null when the line is missing a number. */
  monthly: number | null
  mine: boolean
  /** The estimate turned into a monthly amount, before the learner's own number. */
  estMonthly: number | null
  /** How the estimate became a monthly amount, when it took a calculation. */
  calc: string | null
}

export function lineValue(line: Line, est: Estimate | null | undefined): LineValue {
  let estMonthly: number | null = null
  let calc: string | null = null
  if (est) {
    const hours = line.hours ?? DEFAULT_HOURS
    estMonthly = toMonthly(est.value, est.period, hours)
    if (est.period === 'hr') calc = `${money(est.value, { cents: true })} an hour × ${hours} hours a week`
    const share = Number(line.settings?.share || 1)
    if (est.metric === 'rent' && share > 1) { estMonthly = estMonthly / share; calc = `${money(est.value)} split ${share} ways` }
  }
  if (line.own) return { monthly: toMonthly(line.own.value, line.own.unit, line.own.hours ?? line.hours), mine: true, estMonthly, calc }
  return { monthly: estMonthly, mine: false, estMonthly, calc }
}

export const activeAt = (line: Line, m: number) => (line.start || 0) <= m && (line.end == null || m < line.end)

export interface Stretch { i: number; phase: Phase; m0: number; m1: number; g0: number; g1: number; why: string[]; icon: string }

/** A phase splits into stretches wherever something starts, stops, or happens once. */
export function stretches(doc: LifeDoc, phase: Phase): Stretch[] {
  const off = phaseOffset(doc, phase.id)
  const marks = new Map<number, { why: string[]; icon: string }>()
  const mark = (m: number, why: string, icon: string) => {
    if (m <= 0 || m >= phase.months) return
    const x = marks.get(m) || { why: [], icon }
    x.why.push(why)
    marks.set(m, x)
  }
  phase.lines.forEach((l) => { if (l.start) mark(l.start, `${l.title} starts`, 'play'); if (l.end != null) mark(l.end, `${l.title} ends`, 'square') })
  doc.events.filter((e) => e.phase === phase.id).forEach((e) => mark(e.month, e.title, e.amount >= 0 ? 'arrow-down-left' : 'arrow-up-right'))
  doc.assets.forEach((a) => {
    if (a.bought?.phase === phase.id) mark(a.bought.month, `You get ${a.title.toLowerCase()}`, a.kind === 'car' ? 'car' : a.kind === 'home' ? 'house' : 'package')
    if (a.sold?.phase === phase.id) mark(a.sold.month, `You sell ${a.title.toLowerCase()}`, 'tag')
  })
  doc.debts.forEach((d) => { if (d.start?.phase === phase.id && !doc.assets.some((a) => a.loan_id === d.id)) mark(d.start.month, `You take ${d.title.toLowerCase()}`, 'landmark') })
  const cuts = [0, ...[...marks.keys()].sort((a, b) => a - b)]
  return cuts.map((m0, i) => {
    const m1 = (cuts[i + 1] ?? phase.months) - 1
    const mk = marks.get(m0)
    return { i, phase, m0, m1, g0: off + m0, g1: off + m1, why: mk ? mk.why : [], icon: mk ? mk.icon : 'flag' }
  })
}

export interface Projection {
  months: number
  sav: number[]
  own: number[]
  debt: number[]
  short: number[]
  /** Per global month: money in and out from the budget (monthly lines only). */
  inn: number[]
  out: number[]
  missing: { phase: string; line: string }[]
  /* eslint-disable no-unused-vars -- parameter names in function types */
  debtsAt: (g: number) => { debt: Debt; balance: number; payment: number }[]
  savingsAt: (g: number) => { id: string; title: string; balance: number }[]
  assetsAt: (g: number) => { asset: Asset; value: number }[]
  /* eslint-enable no-unused-vars */
}

/** Month by month, from the plan's first month to the end of its last phase. */
// eslint-disable-next-line no-unused-vars -- parameter names in a function type
export function project(doc: LifeDoc, values: (phase: Phase, line: Line) => LineValue): Projection {
  const G = Math.max(1, totalMonths(doc))
  const sav: number[] = [], own: number[] = [], debt: number[] = [], short: number[] = [], inn: number[] = [], out: number[] = []
  const missing: { phase: string; line: string }[] = []
  const debtBal: Record<string, number> = {}
  const saveBal: Record<string, number> = {}
  const assetVal: Record<string, number> = {}
  const debtHist: Record<string, number[]> = {}, saveHist: Record<string, number[]> = {}, assetHist: Record<string, number[]> = {}
  const main = doc.savings.find((s) => s.main) || null
  let cash = main ? main.balance : 0
  let owed = 0
  doc.savings.filter((s) => !s.main).forEach((s) => { saveBal[s.id] = s.balance })
  doc.debts.forEach((d) => { if (!d.start) debtBal[d.id] = d.balance })
  doc.assets.forEach((a) => { if (!a.bought) assetVal[a.id] = a.value })
  const evAt = new Map<number, LifeEvent[]>()
  doc.events.forEach((e) => { const g = gOf(doc, e); evAt.set(g, [...(evAt.get(g) || []), e]) })
  const snapshot = () => {
    sav.push(Math.max(0, cash) + Object.values(saveBal).reduce((a, b) => a + b, 0))
    own.push(Object.values(assetVal).reduce((a, b) => a + b, 0))
    short.push(owed)
    debt.push(Object.values(debtBal).reduce((a, b) => a + b, 0) + owed)
    doc.debts.forEach((d) => (debtHist[d.id] = debtHist[d.id] || []).push(debtBal[d.id] ?? 0))
    doc.savings.forEach((s) => (saveHist[s.id] = saveHist[s.id] || []).push(s.main ? Math.max(0, cash) : saveBal[s.id] ?? 0))
    doc.assets.forEach((a) => (assetHist[a.id] = assetHist[a.id] || []).push(assetVal[a.id] ?? 0))
  }
  snapshot()
  let g = 0
  for (const p of doc.phases) {
    const vals = new Map(p.lines.map((l) => [l.id, values(p, l)]))
    p.lines.forEach((l) => { if (vals.get(l.id)!.monthly == null) missing.push({ phase: p.id, line: l.id }) })
    for (let m = 0; m < p.months; m++, g++) {
      // One-time things land at the start of their month.
      doc.debts.forEach((d) => { if (d.start && gOf(doc, d.start) === g) { debtBal[d.id] = d.balance; if (!doc.assets.some((a) => a.loan_id === d.id)) cash += d.balance } })
      doc.assets.forEach((a) => {
        if (a.bought && gOf(doc, a.bought) === g) { assetVal[a.id] = a.value; cash -= a.loan_id ? (a.down ?? 0) : a.value }
        if (a.sold && gOf(doc, a.sold) === g && assetVal[a.id] !== undefined) {
          cash += a.sold.price; delete assetVal[a.id]
          if (a.loan_id && debtBal[a.loan_id]) { cash -= debtBal[a.loan_id]; debtBal[a.loan_id] = 0 }
        }
      })
      ;(evAt.get(g) || []).forEach((e) => { cash += e.amount })
      let i = 0, o = 0
      p.lines.forEach((l) => { const v = vals.get(l.id)!.monthly; if (v == null || !activeAt(l, m)) return; if (l.side === 'in') i += v; else o += v })
      inn.push(i); out.push(o)
      cash += i - o
      doc.debts.forEach((d) => {
        const b = debtBal[d.id]; if (!b) return
        const withInt = b * (1 + d.rate / 1200)
        const pay = Math.min(withInt, d.payment)
        debtBal[d.id] = Math.max(0, withInt - pay); cash -= pay
      })
      doc.savings.forEach((s) => { if (s.main) return; saveBal[s.id] = (saveBal[s.id] + s.monthly) * (1 + s.rate / 1200); cash -= s.monthly })
      doc.assets.forEach((a) => { if (assetVal[a.id] !== undefined) assetVal[a.id] *= Math.pow(1 + a.change / 100, 1 / 12) })
      if (main && cash > 0) cash *= 1 + main.rate / 1200
      // Money you'd be short is shown as debt, with no rate: the plan has to cover it somehow.
      if (cash < 0) { owed += -cash; cash = 0 } else if (owed > 0) { const back = Math.min(owed, cash); owed -= back; cash -= back }
      snapshot()
    }
  }
  return {
    months: G, sav, own, debt, short, inn, out, missing,
    debtsAt: (t) => doc.debts.map((d) => ({ debt: d, balance: debtHist[d.id]?.[t] ?? 0, payment: d.payment })).filter((x) => x.balance > 0.5),
    savingsAt: (t) => doc.savings.map((s) => ({ id: s.id, title: s.title, balance: saveHist[s.id]?.[t] ?? 0 })),
    assetsAt: (t) => doc.assets.map((a) => ({ asset: a, value: assetHist[a.id]?.[t] ?? 0 })).filter((x) => x.value > 0.5),
  }
}

export function newDoc(): LifeDoc {
  return { version: 1, start: thisMonth(), phases: [], debts: [], savings: [{ id: 'save', kind: 'savings', title: 'Savings account', balance: 0, rate: 0, monthly: 0, main: true }], assets: [], events: [] }
}
