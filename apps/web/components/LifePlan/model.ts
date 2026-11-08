/**
 * Life plan arithmetic: monthly amounts, stretches inside a phase, and the month-by-month
 * projection of savings, things you own and debt. Pure functions; no estimates are made
 * here. A line with neither the learner's number nor a sourced estimate counts as missing.
 */
import { isTaxable, monthlyTax } from './tax'
import type { Asset, Catalog, Debt, Estimate, LifeDoc, LifeEvent, Line, Phase, Policy, Unit } from '@services/life/life'

import { tr, trLocale } from '@/lib/tr'
export type Per = 'wk' | 'mo' | 'yr'
export const PER_WORD: Record<Per, string> = { get wk() { return tr('budget.per.week', 'week') }, get mo() { return tr('budget.per.month', 'month') }, get yr() { return tr('budget.per.year', 'year') } }
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

// Short month names in the current language ("Jan", "ene").
const shortMonth = (index: number) => new Intl.DateTimeFormat(trLocale(), { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, index, 1))).replace('.', '')
/** The month of the year (0 = January) `g` months after `start`. */
export function monthIndex(start: string, g: number): number {
  const m = Number(start.split('-')[1])
  return ((((m - 1) + g) % 12) + 12) % 12
}
export function monthLabel(start: string, g: number): string {
  const [y, m] = start.split('-').map(Number)
  const t = (m - 1) + g
  return `${shortMonth(((t % 12) + 12) % 12)} ${y + Math.floor(t / 12)}`
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
  // Who the phase provides for: household size for spending surveys, and the people for food plans.
  const h = phase.household
  const want = catalog!.metrics[item.metric]?.dims || []
  if (want.includes('size')) dims.size = Math.min(5, 1 + (h?.partner ? 1 : 0) + (h?.kids?.length || 0))
  if (want.includes('adults')) dims.adults = h?.partner ? 2 : 1
  if (want.includes('kids') && h?.kids?.length) dims.kids = [...h.kids].sort((x, y) => x - y)
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

/** Costs a household splits: the line's `share` setting divides them. */
export const SHARED_METRICS = ['rent', 'utilities']

export function lineValue(line: Line, est: Estimate | null | undefined): LineValue {
  let estMonthly: number | null = null
  let calc: string | null = null
  if (est) {
    const hours = line.hours ?? DEFAULT_HOURS
    estMonthly = toMonthly(est.value, est.period, hours)
    if (est.period === 'hr') calc = `${money(est.value, { cents: true })} an hour × ${hours} hours a week`
    const share = Number(line.settings?.share || 1)
    if (SHARED_METRICS.includes(est.metric) && share > 1) { estMonthly = estMonthly / share; calc = `${money(toMonthly(est.value, est.period))} split ${share} ways` }
  }
  if (line.own) return { monthly: toMonthly(line.own.value, line.own.unit, line.own.hours ?? line.hours), mine: true, estMonthly, calc }
  return { monthly: estMonthly, mine: false, estMonthly, calc }
}

export const activeAt = (line: Line, m: number) => (line.start || 0) <= m && (line.end == null || m < line.end)

export interface Stretch { i: number; phase: Phase; m0: number; m1: number; g0: number; g1: number; why: string[]; icon: string }

/** A phase splits into stretches wherever something starts, stops, happens once, or a debt is paid off. */
export function stretches(doc: LifeDoc, phase: Phase, projection?: Pick<Projection, 'debtsAt'> | null): Stretch[] {
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
  ;(doc.policies || []).forEach((x) => {
    if (x.phase !== phase.id) return
    const t = doc.debts.find((d) => d.id === x.target) || doc.savings.find((v) => v.id === x.target)
    if (t && !x.after) mark(x.month, 'pay' in x || 'full' in x ? `You change what you pay on ${t.title.toLowerCase()}` : `You change what goes into ${t.title.toLowerCase()}`, 'sliders')
  })
  // A payoff moves with what is paid, so the stretch after it starts wherever the plan puts it.
  if (projection) projection.debtsAt(off).forEach((d) => { if (d.paidOffAt != null) mark(d.paidOffAt + 1 - off, `${d.debt.title} paid off`, 'check') })
  const cuts = [0, ...[...marks.keys()].sort((a, b) => a - b)]
  return cuts.map((m0, i) => {
    const m1 = (cuts[i + 1] ?? phase.months) - 1
    const mk = marks.get(m0)
    return { i, phase, m0, m1, g0: off + m0, g1: off + m1, why: mk ? mk.why : [], icon: mk ? mk.icon : 'flag' }
  })
}

export interface DebtAt {
  debt: Debt
  /** What is owed in that month, after a loan taken that month lands. */
  balance: number
  /** What is paid on it that month (0 before it starts and once it is paid off), left over money included. */
  payment: number
  /** The part of the payment that is left over money sent to debt. */
  extra: number
  /** The least it takes that month: the minimum, or the rest when that is less. */
  minimum: number
  /** 'later': not taken yet; 'paid': paid off (or never had a balance); 'owing': being paid back. */
  state: 'later' | 'owing' | 'paid'
  /** The global month it starts, or null when the learner already has it. */
  startsAt: number | null
  /** The global month it is paid off, or null when it isn't within the plan. */
  paidOffAt: number | null
}

/** One account's month: what you put in, what an employer adds, what is in it once the month's one-time things land. */
export interface SavingAt { id: string; title: string; balance: number; put: number; extra: number; match: number }

/** Something that makes the lines jump in one month, to mark on the chart and explain. */
export interface Mark {
  g: number
  kind: 'loan' | 'buy' | 'sell' | 'once' | 'start' | 'short'
  title: string
  /** Money into savings (+) or out of it (−) that month, when there is any. */
  amount: number
  ref: string | null
}

export interface Projection {
  months: number
  sav: number[]
  own: number[]
  debt: number[]
  short: number[]
  /** Per global month: money in after tax and money out, from the budget (monthly lines only). */
  inn: number[]
  out: number[]
  /** Per global month: the tax taken from pay. */
  tax: number[]
  /** Per global month: paid on debts and put into accounts (not the main one); what is left goes to savings. */
  paid: number[]
  put: number[]
  left: number[]
  /** Per global month: the part of what is left sent to a debt, or to an account other than the savings account. */
  extraDebt: number[]
  extraSave: number[]
  marks: Mark[]
  missing: { phase: string; line: string }[]
  /** The rate on money you'd be short, percent a year, and whether the learner set it. */
  cardRate: number
  /* eslint-disable no-unused-vars -- parameter names in function types */
  /** Every debt in the plan, as it stands in month g once that month's one-time things have
   *  happened (so a loan taken that month already shows), and what is paid on it that month. */
  debtsAt: (g: number) => DebtAt[]
  savingsAt: (g: number) => SavingAt[]
  /** Things owned in month g, once that month's purchase or sale has happened. */
  assetsAt: (g: number) => { asset: Asset; value: number }[]
  /** A debt's, account's or thing's balance at the start of each month (index g), and after the last. */
  historyOf: (id: string) => number[]
  /** Where what is left goes in month g, and the choice in force. */
  leftTo: (g: number) => { to: string; policy: Policy | null }
  /* eslint-enable no-unused-vars */
}

/** The monthly payment that pays a balance off in `months` at `rate` percent a year. */
export function amortized(balance: number, rate: number, months: number): number {
  if (balance <= 0 || months <= 0) return 0
  const r = rate / 1200
  return r === 0 ? balance / months : (balance * r) / (1 - Math.pow(1 + r, -months))
}
/** Months to pay a balance off paying `pay` a month, or null when the payment never covers the interest. */
export function payoffMonths(balance: number, rate: number, pay: number): number | null {
  if (balance <= 0.5) return 0
  const r = rate / 1200
  if (pay <= balance * r + 1e-9) return null
  return r === 0 ? Math.ceil(balance / pay) : Math.ceil(-Math.log(1 - (r * balance) / pay) / Math.log(1 + r))
}

/** The policy in force for a target in global month g: the latest one at or before it. */
export function policyAt(doc: LifeDoc, target: string, g: number): Policy | null {
  let best: Policy | null = null, bestG = -1
  for (const p of doc.policies || []) {
    if (p.target !== target) continue
    const pg = gOf(doc, p)
    if (pg <= g && pg >= bestG) { best = p; bestG = pg }
  }
  return best
}

/** The policy target for what is left each month: 'save' (the savings account, the default) or 'debt'. */
export const LEFT = 'left'
/**
 * Where what is left goes in month g: the savings account ('save'), a debt or another account (by id).
 * A choice holds from its month on, or, when it has `after`, from the month after that debt is paid off
 * (so it follows the payoff wherever it lands). `paidAt` is each debt's last payment month so far.
 */
export function leftAt(doc: LifeDoc, g: number, paidAt: Record<string, number>): { to: string; policy: Policy | null } {
  let best: Policy | null = null, bestG = -1
  for (const p of doc.policies || []) {
    if (p.target !== LEFT) continue
    const pg = p.after ? (paidAt[p.after] != null ? paidAt[p.after] + 1 : Infinity) : gOf(doc, p)
    if (pg <= g && pg >= bestG) { best = p; bestG = pg }
  }
  return { to: best?.to || 'save', policy: best }
}

/** Whether taking a debt lands its money in savings: yes unless it pays for something bought, or the learner said no. */
export const lands = (doc: LifeDoc, d: Debt) => Boolean(d.start) && (d.received ?? !doc.assets.some((a) => a.loan_id === d.id))

/**
 * The rate on money you'd be short, percent a year. There is no published default wired in yet
 * (sources rule: no number without a source), so it is 0 until the learner sets one.
 */
export const CARD_RATE_DEFAULT: { rate: number; source: null } = { rate: 0, source: null }

/** Month by month, from the plan's first month to the end of its last phase. */
// eslint-disable-next-line no-unused-vars -- parameter names in a function type
export function project(doc: LifeDoc, values: (phase: Phase, line: Line) => LineValue): Projection {
  const G = Math.max(1, totalMonths(doc))
  const sav: number[] = [], own: number[] = [], debt: number[] = [], short: number[] = [], inn: number[] = [], out: number[] = [], tax: number[] = []
  const paidT: number[] = [], putT: number[] = [], left: number[] = [], extraDebtT: number[] = [], extraSaveT: number[] = []
  const paidAt: Record<string, number> = {}
  const marks: Mark[] = []
  const missing: { phase: string; line: string }[] = []
  const cardRate = doc.card_rate ?? CARD_RATE_DEFAULT.rate
  const debtBal: Record<string, number> = {}
  const saveBal: Record<string, number> = {}
  const assetVal: Record<string, number> = {}
  const debtHist: Record<string, number[]> = {}, saveHist: Record<string, number[]> = {}, assetHist: Record<string, number[]> = {}
  // The same, taken once each month's one-time things have landed, and what moved that month.
  const debtOpen: Record<string, number[]> = {}, saveOpen: Record<string, number[]> = {}, assetOpen: Record<string, number[]> = {}
  const debtPaid: Record<string, number[]> = {}, debtExtra: Record<string, number[]> = {}, debtMin: Record<string, number[]> = {}, savePut: Record<string, number[]> = {}, saveExtra: Record<string, number[]> = {}, saveMatch: Record<string, number[]> = {}
  const main = doc.savings.find((s) => s.main) || null
  let cash = main ? main.balance : 0
  let owed = 0
  doc.savings.filter((s) => !s.main).forEach((s) => { saveBal[s.id] = s.balance })
  doc.debts.forEach((d) => { if (!d.start) debtBal[d.id] = d.balance })
  doc.assets.forEach((a) => { if (!a.bought) assetVal[a.id] = a.value })
  const evAt = new Map<number, LifeEvent[]>()
  doc.events.forEach((e) => { const g = gOf(doc, e); evAt.set(g, [...(evAt.get(g) || []), e]) })
  const push = (h: Record<string, number[]>, id: string, v: number) => (h[id] = h[id] || []).push(v)
  const snapshot = () => {
    sav.push(Math.max(0, cash) + Object.values(saveBal).reduce((a, b) => a + b, 0))
    own.push(Object.values(assetVal).reduce((a, b) => a + b, 0))
    short.push(owed)
    debt.push(Object.values(debtBal).reduce((a, b) => a + b, 0) + owed)
    doc.debts.forEach((d) => push(debtHist, d.id, debtBal[d.id] ?? 0))
    doc.savings.forEach((s) => push(saveHist, s.id, s.main ? Math.max(0, cash) : saveBal[s.id] ?? 0))
    doc.assets.forEach((a) => push(assetHist, a.id, assetVal[a.id] ?? 0))
  }
  const opened = () => {
    doc.debts.forEach((d) => { push(debtOpen, d.id, debtBal[d.id] ?? 0); push(debtPaid, d.id, 0); push(debtExtra, d.id, 0); push(debtMin, d.id, 0) })
    doc.savings.forEach((s) => { push(saveOpen, s.id, s.main ? Math.max(0, cash) : saveBal[s.id] ?? 0); push(savePut, s.id, 0); push(saveExtra, s.id, 0); push(saveMatch, s.id, 0) })
    doc.assets.forEach((a) => push(assetOpen, a.id, assetVal[a.id] ?? 0))
  }
  snapshot()
  let g = 0
  for (const p of doc.phases) {
    const vals = new Map(p.lines.map((l) => [l.id, values(p, l)]))
    p.lines.forEach((l) => { if (vals.get(l.id)!.monthly == null) missing.push({ phase: p.id, line: l.id }) })
    for (let m = 0; m < p.months; m++, g++) {
      const before = Math.max(0, cash) - owed
      // A starting point: the learner's real balances replace what the plan worked out.
      if (m === 0 && p.starting) {
        const st = p.starting
        Object.entries(st.savings || {}).forEach(([id, v]) => {
          const s = doc.savings.find((x) => x.id === id); if (!s) return
          if (s.main) { cash = v; owed = 0 } else saveBal[id] = v
        })
        Object.entries(st.debts || {}).forEach(([id, v]) => { if (doc.debts.some((d) => d.id === id && (!d.start || gOf(doc, d.start) < g))) debtBal[id] = v })
        if (Object.keys(st.savings || {}).length || Object.keys(st.debts || {}).length) marks.push({ g, kind: 'start', title: `Starting point for ${p.title}`, amount: Math.max(0, cash) - owed - before, ref: p.id })
      }
      // One-time things land at the start of their month.
      doc.debts.forEach((d) => {
        if (!d.start || gOf(doc, d.start) !== g) return
        debtBal[d.id] = d.balance
        const into = lands(doc, d) ? d.balance : 0
        cash += into
        if (!doc.assets.some((a) => a.loan_id === d.id)) marks.push({ g, kind: 'loan', title: d.title, amount: into, ref: d.id })
      })
      doc.assets.forEach((a) => {
        if (a.bought && gOf(doc, a.bought) === g) {
          const outOf = a.loan_id ? (a.down ?? 0) : a.value
          assetVal[a.id] = a.value; cash -= outOf
          marks.push({ g, kind: 'buy', title: a.title, amount: -outOf, ref: a.id })
        }
        if (a.sold && gOf(doc, a.sold) === g && assetVal[a.id] !== undefined) {
          let into = a.sold.price
          cash += a.sold.price; delete assetVal[a.id]
          if (a.loan_id && debtBal[a.loan_id]) { cash -= debtBal[a.loan_id]; into -= debtBal[a.loan_id]; debtBal[a.loan_id] = 0 }
          marks.push({ g, kind: 'sell', title: a.title, amount: into, ref: a.id })
        }
      })
      ;(evAt.get(g) || []).forEach((e) => { cash += e.amount; marks.push({ g, kind: 'once', title: e.title, amount: e.amount, ref: e.id }) })
      opened()
      let i = 0, o = 0, pay = 0
      p.lines.forEach((l) => { const v = vals.get(l.id)!.monthly; if (v == null || !activeAt(l, m)) return; if (l.side === 'in') { i += v; if (isTaxable(l)) pay += v } else o += v })
      const t = monthlyTax(p, pay)
      inn.push(i - t); out.push(o); tax.push(t)
      cash += i - t - o
      let paid = 0, put = 0
      doc.debts.forEach((d) => {
        const b = debtBal[d.id]; if (!b) return
        const withInt = b * (1 + d.rate / 1200)
        const pol = policyAt(doc, d.id, g)
        const min = Math.min(withInt, d.payment)
        const want = pol?.full ? withInt : Math.max(d.payment, pol?.pay ?? d.payment)
        const amt = Math.min(withInt, want)
        debtBal[d.id] = Math.max(0, withInt - amt); cash -= amt; paid += amt
        debtPaid[d.id][g] = amt; debtMin[d.id][g] = min
      })
      doc.savings.forEach((s) => {
        if (s.main) return
        const pol = policyAt(doc, s.id, g)
        const pct = pol?.pct ?? s.pct ?? null
        const c = pct != null ? (pay * pct) / 100 : (pol?.put ?? s.monthly)
        const e = pct != null && s.match ? (pay * Math.min(pct, s.match)) / 100 : 0
        saveBal[s.id] = (saveBal[s.id] + c + e) * (1 + s.rate / 1200); cash -= c; put += c
        savePut[s.id][g] = c; saveMatch[s.id][g] = e
      })
      const spare = i - t - o - paid - put
      // What is left goes where the learner sends it: the savings account (the default), extra on a debt
      // until it is paid off (then the rest to savings), or another account.
      let extraDebt = 0, extraSave = 0
      const to = leftAt(doc, g, paidAt).to
      if (spare > 0.5 && to !== 'save') {
        if (debtBal[to] > 0.005) {
          extraDebt = Math.min(spare, debtBal[to])
          debtBal[to] -= extraDebt; debtPaid[to][g] += extraDebt; debtExtra[to][g] = extraDebt
        } else if (saveBal[to] !== undefined) {
          extraSave = spare
          saveBal[to] += spare; saveExtra[to][g] = spare
        }
        cash -= extraDebt + extraSave
      }
      doc.debts.forEach((d) => { if (paidAt[d.id] == null && debtPaid[d.id][g] > 0 && (debtBal[d.id] ?? 0) <= 0.5) paidAt[d.id] = g })
      paidT.push(paid); putT.push(put); left.push(spare); extraDebtT.push(extraDebt); extraSaveT.push(extraSave)
      doc.assets.forEach((a) => { if (assetVal[a.id] !== undefined) assetVal[a.id] *= Math.pow(1 + a.change / 100, 1 / 12) })
      if (main && cash > 0) cash *= 1 + main.rate / 1200
      // Money you'd be short goes on a card at its rate, and is paid back first from what is left later.
      if (owed > 0) owed *= 1 + cardRate / 1200
      if (cash < 0) {
        if (owed <= 0.5) marks.push({ g, kind: 'short', title: 'Savings run out', amount: 0, ref: null })
        owed += -cash; cash = 0
      } else if (owed > 0) { const back = Math.min(owed, cash); owed -= back; cash -= back }
      snapshot()
    }
  }
  const at = (t: number) => Math.min(Math.max(0, t), G - 1)
  return {
    months: G, sav, own, debt, short, inn, out, tax, paid: paidT, put: putT, left, extraDebt: extraDebtT, extraSave: extraSaveT, marks, missing, cardRate,
    debtsAt: (t) => doc.debts.map((d) => {
      const startsAt = d.start ? gOf(doc, d.start) : null
      const balance = debtOpen[d.id]?.[at(t)] ?? 0
      // Paid off: the month of the last payment, the first after it starts that leaves nothing owed.
      const from = startsAt ?? 0
      const hist = debtHist[d.id] || []
      let paidOffAt: number | null = null
      if (d.balance > 0.5) for (let m = from + 1; m < hist.length; m++) if ((hist[m] ?? 0) <= 0.5) { paidOffAt = m - 1; break }
      const state: DebtAt['state'] = startsAt != null && t < startsAt ? 'later' : balance > 0.5 ? 'owing' : 'paid'
      return { debt: d, balance: state === 'later' ? d.balance : balance, payment: debtPaid[d.id]?.[at(t)] ?? 0, extra: debtExtra[d.id]?.[at(t)] ?? 0, minimum: debtMin[d.id]?.[at(t)] ?? 0, state, startsAt, paidOffAt }
    }),
    savingsAt: (t) => doc.savings.map((s) => ({ id: s.id, title: s.title, balance: saveOpen[s.id]?.[at(t)] ?? 0, put: savePut[s.id]?.[at(t)] ?? 0, extra: saveExtra[s.id]?.[at(t)] ?? 0, match: saveMatch[s.id]?.[at(t)] ?? 0 })),
    assetsAt: (t) => doc.assets.map((a) => ({ asset: a, value: assetOpen[a.id]?.[at(t)] ?? 0 })).filter((x) => x.value > 0.5),
    leftTo: (t) => leftAt(doc, t, Object.fromEntries(Object.entries(paidAt).filter(([, m]) => m < t))),
    historyOf: (id) => debtHist[id] || saveHist[id] || assetHist[id] || [],
  }
}

export function newDoc(): LifeDoc {
  return { version: 1, start: thisMonth(), phases: [], debts: [], savings: [{ id: 'save', kind: 'savings', title: tr('budget.catalog.savings', 'Savings account'), balance: 0, rate: 0, monthly: 0, main: true }], assets: [], events: [] }
}
