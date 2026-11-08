import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export const lifeUrl = (path = '') => `${getAPIUrl()}life${path}`

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export type Unit = 'hr' | 'wk' | 'mo' | 'yr'
export type Side = 'in' | 'out'

/** The learner's own number for a line, as they entered it. */
export interface Own { unit: Unit; value: number; hours?: number | null }

export interface Line {
  id: string
  cat: string
  item?: string | null
  title: string
  side: Side
  own?: Own | null
  /** Hours a week, for pay that is published per hour. */
  hours?: number | null
  settings: Record<string, any>
  start: number
  end?: number | null
  /** A running cost of something owned (an asset id): it goes when the thing does. */
  asset?: string | null
}

/** A learner's own cover photo for a phase, from their media library. */
export interface PhaseCover { url: string }
/** How a phase's taxes are worked out: filing status for the estimate, or the learner's own effective rate (percent). */
export interface PhaseTax { filing?: 'single' | 'joint'; rate?: number | null }
/** Real numbers to start a phase from, where estimates meet what is actually there: by saving or debt id. */
export interface Starting { savings?: Record<string, number>; debts?: Record<string, number> }
/** What a learner does in a phase. `career` is an O*NET code; `schools` are ones still being weighed. */
export interface Activity { kind: 'learning' | 'working' | 'looking' | 'caring' | 'gap' | 'other'; level?: string | null; school?: string | null; school_id?: string | null; schools?: string[]; field?: string | null; career?: string | null; career_title?: string | null; employer?: string | null; apprentice?: boolean }
/** A partner, and kids by age (0-17). */
export interface Household { partner?: boolean; kids?: number[] }
export interface Phase {
  id: string; title: string; kind: string; place?: string | null; place_label?: string
  /** Only the length of a phase nothing comes after; otherwise it runs until the next one starts. */
  months: number
  lines: Line[]; goals?: string[]; cover?: PhaseCover | null; tax?: PhaseTax | null; starting?: Starting | null
  /** When it starts, YYYY-MM. Old plans have none and run one after another from the plan's start. */
  starts?: string | null
  /** No start date picked yet: `starts` only keeps its place on the map until the learner picks one. */
  undated?: boolean
  /** The phases it comes after: none for the first, two or more where two ways join up. */
  after?: string[]
  /** A dashed idea on the map: quick to add and remove. */
  idea?: boolean
  activities?: Activity[]
  living?: string | null
  /** Who the budget provides for besides the learner; none is just the learner. */
  household?: Household | null
  /** Place keys still being weighed; `place` is the one picked. */
  places?: string[]
  /** Where it sits among the options after the same phase: 0 is the learner's first choice. */
  rank?: number | null
}
/** A photo of a place, picked ahead of time from Wikimedia Commons, with the credit it is shown with. */
export interface PlacePhoto { url: string; width?: number; height?: number; title?: string; author: string; license: string; license_url?: string; source_url: string }
export interface When { phase: string; month: number }
/** A debt: what is owed, its rate and the minimum a month. Taking it later (start) can land the money in savings. */
export interface Debt { id: string; kind: string; title: string; balance: number; rate: number; payment: number; start?: When | null; received?: boolean | null }
/** An account. A 401(k) puts in pct of pay, and the employer matches up to match percent of pay.
 *  `start` is the month the learner opens it (balance lands then); none means they have it when the plan starts. */
export interface Saving { id: string; kind: string; title: string; balance: number; rate: number; monthly: number; main: boolean; pct?: number | null; match?: number | null; start?: When | null }
/** From a month on, until the next one: what you pay on a debt (at least its minimum, or all of it), or put into an account. */
export interface Policy { id: string; target: string; phase: string; month: number; pay?: number | null; full?: boolean | null; put?: number | null; pct?: number | null; to?: string | null; after?: string | null }
export interface Asset { id: string; kind: string; title: string; value: number; change: number; bought?: When | null; down?: number | null; loan_id?: string | null; sold?: (When & { price: number }) | null }
export interface LifeEvent { id: string; phase: string; month: number; title: string; amount: number }

export interface LifeDoc {
  version: number
  /** The month the plan starts, YYYY-MM. */
  start: string
  phases: Phase[]
  debts: Debt[]
  savings: Saving[]
  assets: Asset[]
  events: LifeEvent[]
  policies?: Policy[]
  /** The learner's rate for the card that covers being short, percent a year. */
  card_rate?: number | null
  /** The learner said "don't ask": estimate changes from a new place, living or job apply on their own. */
  auto_estimates?: boolean
}

export interface LifePlanView { plan_uuid: string; revision: number; document: LifeDoc; update_date: string }

export interface EstimateSource { key: string; publisher: string; title: string; dataset: string; url: string; released: string; retrieved: string; notes: string }
export interface Estimate {
  metric: string
  value: number
  percentiles: Record<'p10' | 'p25' | 'p50' | 'p75' | 'p90', number> | null
  period: Unit
  stat: string
  label: string
  dollar_year: number | null
  place: string
  place_label: string
  level: 'city' | 'county' | 'region' | 'area' | 'state' | 'us'
  fallback: boolean
  asked_place_label: string | null
  /** A national figure moved to local prices: the price level it was multiplied by, and its source. */
  scaled_by?: { value: number; label: string; place_label: string; source: EstimateSource } | null
  dims: Record<string, any>
  dims_dropped: string[]
  source: EstimateSource
}
export interface EstimateQuery { id: string; metric: string; place?: string | null; dims: Record<string, any> }

export interface Setting { key: string; title: string; kind: 'choice' | 'occupation'; default?: any; choices?: [any, string][] }
export interface CatalogItem { key: string; cat: string; title: string; icon: string; metric?: string; settings?: Setting[]; hourly?: boolean }
export interface Category { key: string; side: Side; title: string; icon: string; expected?: boolean }
export interface Catalog {
  categories: Category[]
  items: CatalogItem[]
  metrics: Record<string, { title: string; dims: string[]; required: string[] }>
  asset_kinds: { key: string; title: string; icon: string }[]
  debt_kinds: { key: string; title: string }[]
  savings_kinds: { key: string; title: string }[]
  /** Photos by place key, each place's own or borrowed from its county or state. */
  place_photos?: Record<string, PlacePhoto>
}
export interface PlaceOption { key: string; label: string; detail: string; level: string }
export interface Occupation { soc: string; title: string }
/** A career from O*NET. `interests` is its RIASEC profile on O*NET's 1 to 7 scale; `match` comes back from careerMatch. */
export interface Career { code: string; soc: string; title: string; job_zone: number | null; interests: Record<string, number>; top_interests: string; match?: number; description?: string; alt_titles?: string[]; source?: { key: string; title: string; license: string; url: string } | null }
/** A school from the College Scorecard. Rates are fractions; tuition is yearly, in-state and out-of-state. */
export interface School { unitid: string; name: string; city: string; state: string; url: string; control: string; degree: string; students: number | null; admission_rate: number | null; completion_rate: number | null; median_earnings: number | null; tuition?: { in?: number; out?: number }; source?: { key: string; title: string; released: string; url: string } | null }

const q = encodeURIComponent

export const lifeApi = {
  get: (token?: string) => request<{ plan: LifePlanView | null }>(lifeUrl('/plan'), token),
  /** Who shared their plans with you. */
  sharedWithMe: (token?: string) => request<{ people: { username: string; name?: string; user_uuid?: string }[] }>(lifeUrl('/shared'), token),
  /** Someone's plan they shared with you in their My people, read-only. */
  shared: (userUuid: string, token?: string) => request<{ person: { username: string; name?: string; user_uuid?: string } | null; plan: LifePlanView | null }>(lifeUrl(`/shared/${encodeURIComponent(userUuid)}`), token),
  save: (document: LifeDoc, revision: number | null, token?: string) => request<{ plan: LifePlanView }>(lifeUrl('/plan'), token, 'PUT', { document, revision }),
  placeGoal: (goal_uuid: string, phase_id: string | null, token?: string) => request<{ plan: LifePlanView }>(lifeUrl('/plan/goals'), token, 'PUT', { goal_uuid, phase_id }),
  remove: (token?: string) => fetch(lifeUrl('/plan'), RequestBodyWithAuthHeader('DELETE', null, null, token)),
  catalog: (token?: string) => request<Catalog>(lifeUrl('/catalog'), token),
  places: (query: string, token?: string) => request<{ places: PlaceOption[] }>(lifeUrl(`/places?q=${q(query)}`), token),
  occupations: (query: string, token?: string) => request<{ occupations: Occupation[] }>(lifeUrl(`/occupations?q=${q(query)}`), token),
  careers: (query: string, token?: string) => request<{ careers: Career[] }>(lifeUrl(`/careers?q=${q(query)}`), token),
  career: (code: string, token?: string) => request<{ career: Career }>(lifeUrl(`/careers/${q(code)}`), token),
  /** Careers whose interest profile lines up with these R, I, A, S, E and C scores (any scale). */
  careerMatch: (scores: Record<string, number>, token?: string, jobZones?: number[]) => request<{ careers: Career[]; method: string }>(lifeUrl('/careers/match'), token, 'POST', { scores, job_zones: jobZones || null }),
  schools: (query: string, state: string | null, token?: string) => request<{ schools: School[] }>(lifeUrl(`/schools?q=${q(query)}${state ? `&state=${q(state)}` : ''}`), token),
  school: (unitid: string, token?: string) => request<{ school: School }>(lifeUrl(`/schools/${q(unitid)}`), token),
  metrics: (place: string | null | undefined, token?: string) => request<{ metrics: string[] }>(lifeUrl(`/metrics${place ? `?place=${q(place)}` : ''}`), token),
  estimates: (queries: EstimateQuery[], token?: string) => request<{ estimates: Record<string, Estimate | null> }>(lifeUrl('/estimates'), token, 'POST', { queries }),
}

/** A source of estimate facts or catalog entries (careers, schools), with how many it has by status, for platform admins. */
export interface SourceCoverage extends EstimateSource { id: number; facts: number; entries?: number; by_status: Record<string, number>; levels: Record<string, number>; metrics: string[] }
export type EstimateFileKind = 'hud_fmr' | 'bls_oews' | 'onet' | 'scorecard'
export interface EstimateImportResult { job: string; status: 'running' | 'done'; kind?: EstimateFileKind; year?: number; source?: string; facts?: number; unmatched?: string[]; places?: number; careers?: number; schools?: number }

export const lifeAdminApi = {
  sources: (token?: string) => request<{ sources: SourceCoverage[] }>(lifeUrl('/admin/sources'), token),
  /** The server works out which allowed file this is (HUD FMRs, BLS OEWS, O*NET, College Scorecard) and its release, and refuses anything else. */
  importFile: async (file: File, token?: string) => {
    const form = new FormData()
    form.append('file', file)
    const response = await fetch(lifeUrl('/admin/import'), { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' })
    return errorHandling(response) as Promise<EstimateImportResult>
  },
  /** A big file keeps loading after the upload answers; ask how it is going. */
  importStatus: (job: string, token?: string) => request<EstimateImportResult>(lifeUrl(`/admin/import/${encodeURIComponent(job)}`), token),
  review: (sourceKey: string, status: 'reviewed' | 'draft' | 'retired', token?: string) => request<{ facts: number }>(lifeUrl(`/admin/sources/${encodeURIComponent(sourceKey)}/review`), token, 'POST', { status }),
  /** The datasets we expect, each with its loaded releases, newest first. */
  datasets: (token?: string) => request<{ datasets: Dataset[] }>(lifeUrl('/admin/datasets'), token),
  /** One page of a release's table, searched and filtered. */
  datasetRows: (sourceKey: string, params: DatasetQuery, token?: string) => request<DatasetPage>(lifeUrl(`/admin/datasets/${encodeURIComponent(sourceKey)}/rows?${datasetQueryString(params)}`), token),
  /** The same rows, every page, as a CSV file the browser downloads. */
  exportDataset: async (sourceKey: string, params: Omit<DatasetQuery, 'page' | 'per_page'>, token?: string) => {
    const response = await fetch(lifeUrl(`/admin/datasets/${encodeURIComponent(sourceKey)}/export?${datasetQueryString(params)}`), { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' })
    if (!response.ok) throw new Error('The export could not be made')
    const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') || '')?.[1] || `${sourceKey}.csv`
    return { blob: await response.blob(), name }
  },
}

/** A release's table: estimate facts, O*NET careers, Scorecard schools, or a table we built (a composite dataset). */
export type DatasetTableName = 'facts' | 'careers' | 'schools' | 'map'
export interface DatasetRelease { key: string; label: string; title: string; publisher: string; dataset: string; url: string; released: string; retrieved: string; license: string; notes: string; tables: Array<{ name: DatasetTableName; title: string; rows: number }>; by_status: Record<string, number> }
export interface Dataset { kind: string; title: string; publisher: string; description: string; used_for: string; license: string; url: string; file: string; origin: 'external' | 'composite'; importable: boolean; inputs?: string[]; releases: DatasetRelease[] }
export interface DatasetQuery { table: DatasetTableName; q?: string; page?: number; per_page?: number; filters?: Record<string, string> }
export interface DatasetPage { source: string; table: DatasetTableName; columns: Array<{ key: string; label: string; numeric: boolean }>; rows: Array<Record<string, string | number | null>>; total: number; page: number; per_page: number; filters: Record<string, Array<string | number>> }

function datasetQueryString({ table, q, page, per_page, filters }: Partial<DatasetQuery>) {
  const params = new URLSearchParams()
  if (table) params.set('table', table)
  if (q) params.set('q', q)
  if (page) params.set('page', String(page))
  if (per_page) params.set('per_page', String(per_page))
  for (const [key, value] of Object.entries(filters || {})) if (value) params.set(key, value)
  return params.toString()
}
