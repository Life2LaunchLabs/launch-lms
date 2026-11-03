/**
 * A provisional income tax estimate for pay from work: federal income tax, Social Security,
 * Medicare and, for Oregon, state income tax plus the two state payroll taxes. Every number
 * below comes from the publication named next to it. It treats all work income as wages for
 * one person with the standard deduction and no credits, so it is an estimate, not a return.
 * Aid (family help, grants, scholarships) is not counted as taxable.
 */
import type { Line, Phase } from '@services/life/life'

export type Filing = 'single' | 'joint'

export interface TaxSource { title: string; publisher: string; year: number; url: string }
export interface TaxPart { key: string; title: string; annual: number; note: string; source: TaxSource }
export interface TaxEstimate {
  /** Taxable pay for the year the estimate was worked out on. */
  wages: number
  parts: TaxPart[]
  annual: number
  /** Share of taxable pay, 0 to 1. */
  rate: number
  /** Two-letter state, or null when the phase has no place. */
  state: string | null
  /** False when the state's own income tax isn't worked out here yet. */
  stateCovered: boolean
}

const IRS: TaxSource = { title: 'Rev. Proc. 2025-32: inflation adjustments for 2026', publisher: 'IRS', year: 2026, url: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill' }
const SSA: TaxSource = { title: '2026 Social Security changes (fact sheet)', publisher: 'Social Security Administration', year: 2026, url: 'https://www.ssa.gov/cola/factsheets/2026.html' }
const IRS_MEDICARE: TaxSource = { title: 'Questions and answers for the Additional Medicare Tax', publisher: 'IRS', year: 2026, url: 'https://www.irs.gov/businesses/small-businesses-self-employed/questions-and-answers-for-the-additional-medicare-tax' }
const OR_CHARTS: TaxSource = { title: '2025 tax rate charts and Form OR-40 instructions', publisher: 'Oregon Department of Revenue', year: 2025, url: 'https://www.oregon.gov/dor/programs/individuals/Documents/Part-year%20and%20nonresident%20tax%20rate%20charts.pdf' }
const OR_TRANSIT: TaxSource = { title: 'Statewide transit tax', publisher: 'Oregon Department of Revenue', year: 2026, url: 'https://www.oregon.gov/dor/programs/businesses/Pages/statewide-transit-tax.aspx' }
const OR_PAID_LEAVE: TaxSource = { title: '2026 tax and contribution rates (press release, Nov 18 2025)', publisher: 'Oregon Employment Department', year: 2026, url: 'https://www.oregon.gov/employ/NewsAndMedia/Documents/2025-11-18_Tax_Rate_2026_Press_Release.pdf' }

/** [upper bound of the bracket, rate]; the last bound is Infinity. */
type Brackets = [number, number][]
const bracketTax = (income: number, brackets: Brackets) => {
  let tax = 0, lo = 0
  for (const [hi, rate] of brackets) {
    if (income <= lo) break
    tax += (Math.min(income, hi) - lo) * rate
    lo = hi
  }
  return tax
}

// Federal, tax year 2026 (Rev. Proc. 2025-32).
const FED_STANDARD: Record<Filing, number> = { single: 16_100, joint: 32_200 }
const FED_BRACKETS: Record<Filing, Brackets> = {
  single: [[12_400, 0.10], [50_400, 0.12], [105_700, 0.22], [201_775, 0.24], [256_225, 0.32], [640_600, 0.35], [Infinity, 0.37]],
  joint: [[24_800, 0.10], [100_800, 0.12], [211_400, 0.22], [403_550, 0.24], [512_450, 0.32], [768_700, 0.35], [Infinity, 0.37]],
}
// Social Security 6.2% up to the 2026 wage base; Medicare 1.45%, plus 0.9% over the Additional Medicare Tax threshold.
const SS_RATE = 0.062, SS_WAGE_BASE = 184_500
const MEDICARE_RATE = 0.0145, ADDL_MEDICARE_RATE = 0.009
const ADDL_MEDICARE_FROM: Record<Filing, number> = { single: 200_000, joint: 250_000 }

// Oregon, tax year 2025 (the newest full-year resident charts published): Chart S and Chart J.
const OR_STANDARD: Record<Filing, number> = { single: 2_835, joint: 5_670 }
const OR_BRACKETS: Record<Filing, Brackets> = {
  single: [[4_400, 0.0475], [11_100, 0.0675], [125_000, 0.0875], [Infinity, 0.099]],
  joint: [[8_800, 0.0475], [22_200, 0.0675], [250_000, 0.0875], [Infinity, 0.099]],
}
const OR_EXEMPTION_CREDIT = 256
const OR_EXEMPTION_LIMIT: Record<Filing, number> = { single: 100_000, joint: 200_000 }
/** The federal tax subtraction: up to $8,500, stepping down $1,700 per $5,000 of income over the start (Table 4). */
const OR_FED_SUBTRACTION = 8_500
const OR_FED_PHASEOUT_FROM: Record<Filing, number> = { single: 125_000, joint: 250_000 }
const OR_TRANSIT_RATE = 0.001
const OR_PAID_LEAVE_RATE = 0.006, OR_PAID_LEAVE_WAGE_BASE = 184_500

function orFedSubtractionCap(income: number, filing: Filing) {
  const from = OR_FED_PHASEOUT_FROM[filing], step = filing === 'single' ? 5_000 : 10_000
  if (income < from) return OR_FED_SUBTRACTION
  const steps = Math.floor((income - from) / step) + 1
  return Math.max(0, OR_FED_SUBTRACTION - steps * 1_700)
}

/** The two-letter state of a place key ("city:OR:eugene", "county:OR:lane", "state:WA"), if it has one. */
export function stateOf(place?: string | null): string | null {
  if (!place) return null
  const parts = place.split(':')
  if (parts[0] === 'area') return 'OR' // wage areas are Oregon's
  if ((parts[0] === 'city' || parts[0] === 'county' || parts[0] === 'state') && parts[1]) return parts[1].toUpperCase()
  return null
}

const STATE_NAMES: Record<string, string> = { OR: 'Oregon' }
export const stateName = (code: string | null) => (code ? STATE_NAMES[code] || code : '')

export function estimateTax(wages: number, filing: Filing, state: string | null): TaxEstimate {
  const w = Math.max(0, wages)
  const parts: TaxPart[] = []
  const fedTaxable = Math.max(0, w - FED_STANDARD[filing])
  const fed = bracketTax(fedTaxable, FED_BRACKETS[filing])
  parts.push({ key: 'federal', title: 'Federal income tax', annual: fed, note: `After the ${money0(FED_STANDARD[filing])} standard deduction, 2026 brackets`, source: IRS })
  parts.push({ key: 'ss', title: 'Social Security', annual: Math.min(w, SS_WAGE_BASE) * SS_RATE, note: `6.2% of pay up to ${money0(SS_WAGE_BASE)}`, source: SSA })
  const medicare = w * MEDICARE_RATE + Math.max(0, w - ADDL_MEDICARE_FROM[filing]) * ADDL_MEDICARE_RATE
  parts.push({ key: 'medicare', title: 'Medicare', annual: medicare, note: w > ADDL_MEDICARE_FROM[filing] ? `1.45% of pay, plus 0.9% over ${money0(ADDL_MEDICARE_FROM[filing])}` : '1.45% of pay', source: IRS_MEDICARE })
  let stateCovered = false
  if (state === 'OR') {
    stateCovered = true
    const sub = Math.min(fed, orFedSubtractionCap(w, filing))
    const orTaxable = Math.max(0, w - sub - OR_STANDARD[filing])
    const credit = w <= OR_EXEMPTION_LIMIT[filing] ? OR_EXEMPTION_CREDIT * (filing === 'joint' ? 2 : 1) : 0
    const orTax = Math.max(0, bracketTax(orTaxable, OR_BRACKETS[filing]) - credit)
    parts.push({ key: 'oregon', title: 'Oregon income tax', annual: orTax, note: `After the ${money0(OR_STANDARD[filing])} standard deduction and federal tax subtraction, less the ${money0(OR_EXEMPTION_CREDIT)} exemption credit${filing === 'joint' ? ' each' : ''}; 2025 charts`, source: OR_CHARTS })
    parts.push({ key: 'or_transit', title: 'Oregon transit tax', annual: w * OR_TRANSIT_RATE, note: '0.1% of pay', source: OR_TRANSIT })
    parts.push({ key: 'or_paid_leave', title: 'Paid Leave Oregon', annual: Math.min(w, OR_PAID_LEAVE_WAGE_BASE) * OR_PAID_LEAVE_RATE, note: `Your 0.6% share, on pay up to ${money0(OR_PAID_LEAVE_WAGE_BASE)}`, source: OR_PAID_LEAVE })
  }
  const annual = parts.reduce((a, p) => a + p.annual, 0)
  return { wages: w, parts, annual, rate: w > 0 ? annual / w : 0, state, stateCovered }
}

const money0 = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`

/** Lines that count as taxable pay: everything filed under Work. */
export const isTaxable = (line: Line) => line.side === 'in' && line.cat === 'work'

/** The tax for one month of a phase, from that month's pay as if it lasted a year. */
export function monthlyTax(phase: Phase, monthlyWages: number): number {
  if (monthlyWages <= 0) return 0
  const own = phase.tax?.rate
  if (own != null) return monthlyWages * (own / 100)
  return estimateTax(monthlyWages * 12, phase.tax?.filing || 'single', stateOf(phase.place)).annual / 12
}
