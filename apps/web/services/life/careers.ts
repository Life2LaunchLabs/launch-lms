import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { lifeUrl, type Career } from './life'

// The career explorer: a career resource's profile, Career swipe's deck and its skips.

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** What people in the job say it takes: O*NET's required level of education, the share of workers at each level (1 to 12). */
export interface EducationShare { level: number; pct: number }
export interface FullCareer extends Career { description: string; alt_titles: string[]; tasks: string[]; education?: EducationShare[]; related?: string[] }

type Percentiles = Partial<Record<'p10' | 'p25' | 'p50' | 'p75' | 'p90', number>>
/** Pay in one place: region (an Oregon Employment Department area), area (a BLS wage area), state or us. */
export interface PlaceWage { place: string; label: string; level: string; hourly: Percentiles; yearly: Percentiles; year: number | null; source: string; publisher: string }
export interface CareerWages {
  places: PlaceWage[]
  /** The place nearest the learner's home base that has pay, else Oregon. */
  here: string | null
  /** Typical pay a year, oldest first, for Oregon ("state:OR") and the US ("us"). */
  history: Record<string, Array<{ year: number; hourly: number | null; yearly: number | null }>>
}
export interface PlaceOutlook { place: string; label: string; jobs: number | null; jobs_later: number | null; growth: number | null; openings: number | null }
export interface CareerOutlook {
  places: PlaceOutlook[]
  /** The Oregon region nearest the learner's home base, if Oregon publishes one. */
  here: string | null
  start: number | null
  end: number | null
  entry: { typical: string; competitive: string | null } | null
  source: string
}
export interface HomeBase { key: string; label: string; from: 'portfolio' | 'plan' }
export interface CareerPay { yearly: number }
export interface AreaPay { area: string; label: string; median: number; mine: boolean; my_place: string | null }
export interface MyPlace { key: string; label: string; area: string | null }

export interface CareerProfile {
  career: FullCareer
  /** How closely the learner's interest quiz follows this career (a correlation), or null without a quiz. */
  match: number | null
  /** The learner's quiz scores, 0 to 20 for each type. */
  scores: Record<string, number> | null
  pay: {
    overall: { place: string; median: number | null; p25: number | null; p75: number | null; year: number | null } | null
    /** Oregon wage areas, places on the learner's phases first. */
    areas: AreaPay[]
    source: string
  }
  my_places: MyPlace[]
  /** Where the learner lives: the portfolio's location, else the first place on their plan. */
  home: HomeBase | null
  wages: CareerWages
  outlook: CareerOutlook | null
  resource_uuid: string | null
  similar: Array<Omit<Career, 'match'> & { pay: CareerPay | null; resource_uuid: string | null }>
  link: string
}

export interface SwipeCard extends Omit<FullCareer, 'match'> {
  resource_uuid: string
  match: number | null
  pay: CareerPay | null
  /** The best pay among the places on the learner's phases. */
  my_place_pay: { place: string; yearly: number } | null
}

export interface CareerDeck { cards: SwipeCard[]; total: number; has_careers: boolean; has_quiz: boolean }

/** The O*NET-SOC code a career resource is about, read from its O*NET OnLine link. */
export const careerCode = (url?: string | null) => (url || '').match(/(\d{2}-\d{4}\.\d{2})/)?.[1] || null

export const careersApi = {
  profile: (code: string, orgId: number | undefined, token?: string) =>
    request<CareerProfile>(lifeUrl(`/careers/${encodeURIComponent(code)}/profile${orgId ? `?org_id=${orgId}` : ''}`), token),
  deck: (orgId: number, token: string, size = 10) => request<CareerDeck>(lifeUrl(`/careers/deck?org_id=${orgId}&size=${size}`), token),
  links: (orgId: number, codes: string[], token: string) =>
    request<{ links: Record<string, string> }>(lifeUrl(`/careers/links?org_id=${orgId}&codes=${encodeURIComponent(codes.join(','))}`), token),
  skip: (code: string, token: string) => request(lifeUrl(`/careers/${encodeURIComponent(code)}/skip`), token, 'POST'),
  unskip: (code: string, token: string) => request(lifeUrl(`/careers/${encodeURIComponent(code)}/skip`), token, 'DELETE'),
}

/** "$26.50" */
export const hourlyMoney = (value: number) => `$${value.toFixed(2)}`
/** "$62k" */
export const shortMoney = (value: number) => `$${Math.round(value / 1000)}k`
/** "$62,000" */
export const fullMoney = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`
