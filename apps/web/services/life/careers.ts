import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { lifeUrl, type Career } from './life'

// The career explorer: a career resource's profile, Career swipe's deck and its skips.

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

/** What people in the job say it takes: O*NET's required level of education, the share of workers at each level (1 to 12). */
export interface EducationShare { level: number; pct: number }
export interface FullCareer extends Career { description: string; alt_titles: string[]; tasks: string[]; education?: EducationShare[]; related?: string[]; skills?: string[] }

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
/** A program at a school that trains for the career, from the College Scorecard's field-of-study file. */
export interface CareerProgram {
  unitid: string
  school: string
  city: string
  state: string
  control: string
  cip: string
  title: string
  /** The Scorecard's credential level: 1 certificate, 2 associate, 3 bachelor's, 5 master's, 6 doctorate, 7 professional. */
  credential: number
  credential_label: string
  /** Roughly how many years it takes full time. */
  years: number | null
  graduates: number | null
  /** Median earnings of graduates working, one and five years after finishing. */
  earnings_1yr: number | null
  earnings_5yr: number | null
  /** The share of working graduates employed in the school's state (0 to 1). */
  in_state: number | null
  /** Median federal loan debt at graduation. */
  debt: number | null
  /** Fully online. */
  online: boolean
  /** In-state tuition and fees a year. */
  tuition: number | null
  /** 0 your town, 1 your county, 2 your region, 3 your state, 4 farther, 5 online from out of state. */
  near_rank: number
  near: string
  /** The school's resource in Discover, where the organization has one. */
  resource_uuid?: string | null
}
export interface CareerPaths {
  families: Array<{ cip: string; title: string; weight: number }>
  programs: CareerProgram[]
  counts?: Record<string, number>
  has_data: boolean
  source?: string
  credit: string
}
export type HomeReach = 'close' | 'region' | 'state' | 'anywhere'
export interface HomeBase { key: string; label: string; from: 'portfolio' | 'plan'; reach: HomeReach; online: boolean }
/** The home base sheet: the portfolio's location as typed, where we place it, and how far the learner would go. */
export interface HomeSettings { label: string; place: { key: string; label: string } | null; area: string; reach: HomeReach; online: boolean }
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
  /** The skill chips the learner picked in their portfolio (null before they pick any), and the ones this career uses. */
  skills?: { mine: string[] | null; used: string[] }
  /** Where the learner lives: the portfolio's location, else the first place on their plan. */
  home: HomeBase | null
  wages: CareerWages
  outlook: CareerOutlook | null
  /** Programs near the learner that train for the career. */
  paths?: CareerPaths
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
  home: (token: string, text?: string) => request<HomeSettings>(lifeUrl(`/home${text != null ? `?q=${encodeURIComponent(text)}` : ''}`), token),
  saveHome: (body: { label: string; reach: HomeReach; online: boolean }, token: string) => request<HomeSettings>(lifeUrl('/home'), token, 'PUT', body),
  skip: (code: string, token: string) => request(lifeUrl(`/careers/${encodeURIComponent(code)}/skip`), token, 'POST'),
  unskip: (code: string, token: string) => request(lifeUrl(`/careers/${encodeURIComponent(code)}/skip`), token, 'DELETE'),
}

/** "$26.50" */
export const hourlyMoney = (value: number) => `$${value.toFixed(2)}`
/** "$62k" */
export const shortMoney = (value: number) => `$${Math.round(value / 1000)}k`
/** "$62,000" */
export const fullMoney = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`
