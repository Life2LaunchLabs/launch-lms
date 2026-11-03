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
}

/** A learner's own cover photo for a phase, from their media library. */
export interface PhaseCover { url: string }
export interface Phase { id: string; title: string; kind: string; place?: string | null; place_label?: string; months: number; lines: Line[]; goals?: string[]; cover?: PhaseCover | null }
/** A photo of a place, picked ahead of time from Wikimedia Commons, with the credit it is shown with. */
export interface PlacePhoto { url: string; width?: number; height?: number; title?: string; author: string; license: string; license_url?: string; source_url: string }
export interface When { phase: string; month: number }
export interface Debt { id: string; kind: string; title: string; balance: number; rate: number; payment: number; start?: When | null }
export interface Saving { id: string; kind: string; title: string; balance: number; rate: number; monthly: number; main: boolean }
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
  level: 'city' | 'county' | 'area' | 'state' | 'us'
  fallback: boolean
  asked_place_label: string | null
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
  metrics: (place: string | null | undefined, token?: string) => request<{ metrics: string[] }>(lifeUrl(`/metrics${place ? `?place=${q(place)}` : ''}`), token),
  estimates: (queries: EstimateQuery[], token?: string) => request<{ estimates: Record<string, Estimate | null> }>(lifeUrl('/estimates'), token, 'POST', { queries }),
}

/** A source of estimate facts, with how many facts it has by status, for platform admins. */
export interface SourceCoverage extends EstimateSource { id: number; facts: number; by_status: Record<string, number>; levels: Record<string, number>; metrics: string[] }
export type EstimateFileKind = 'hud_fmr' | 'bls_oews'
export interface EstimateImportResult { job: string; status: 'running' | 'done'; kind?: EstimateFileKind; year?: number; source?: string; facts?: number; unmatched?: string[]; places?: number }

export const lifeAdminApi = {
  sources: (token?: string) => request<{ sources: SourceCoverage[] }>(lifeUrl('/admin/sources'), token),
  /** The server works out which allowed file this is (HUD FMRs or BLS OEWS) and its year, and refuses anything else. */
  importFile: async (file: File, token?: string) => {
    const form = new FormData()
    form.append('file', file)
    const response = await fetch(lifeUrl('/admin/import'), { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' })
    return errorHandling(response) as Promise<EstimateImportResult>
  },
  /** A big file keeps loading after the upload answers; ask how it is going. */
  importStatus: (job: string, token?: string) => request<EstimateImportResult>(lifeUrl(`/admin/import/${encodeURIComponent(job)}`), token),
  review: (sourceKey: string, status: 'reviewed' | 'draft' | 'retired', token?: string) => request<{ facts: number }>(lifeUrl(`/admin/sources/${encodeURIComponent(sourceKey)}/review`), token, 'POST', { status }),
}
