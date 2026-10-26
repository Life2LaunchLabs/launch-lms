import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

// Insights dashboards and their cards (apps/api/src/services/insights/, routers/insights.py).

const q = encodeURIComponent
const url = (orgId: number, path: string, params: Record<string, string | null | undefined> = {}) => {
  const search = new URLSearchParams({ org_id: String(orgId) })
  Object.entries(params).forEach(([key, value]) => { if (value) search.set(key, value) })
  return `${getAPIUrl()}insights${path}?${search}`
}

async function request<T = any>(target: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(target, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export type Scope = 'org' | 'plan' | 'group' | 'learner'
export type Visibility = 'me' | 'staff' | 'admins'
export type Preset = '28d' | '90d' | '12m' | 'all'
export type DateRange = Preset | { start: string; end: string }
export type Chart = 'auto' | 'number' | 'line' | 'bars' | 'columns' | 'stacked' | 'heatmap' | 'table'
export type Shape = 'single' | 'series' | 'ranked' | 'split' | 'cross'

/** A card: what to count, how to break it down, and how to show it (spec.py CardSpec). */
export interface CardSpec {
  v?: number
  measure: string
  by?: string | null
  by2?: string | null
  filters?: Array<{ field: string; op: 'in' | 'not_in'; values: string[] }>
  range?: 'inherit' | DateRange
  compare?: 'prior' | 'year' | 'none' | { target: number }
  chart?: Chart
  headline?: { mode: 'auto' | 'custom'; text: string }
  note?: string
}

export interface DashboardCard { key: string; span: number; spec: CardSpec }
export interface DashboardDocument { cards: DashboardCard[]; range: DateRange }

export interface DashboardSummary {
  dashboard_uuid: string
  scope: Scope
  title: string
  description: string
  visibility: Visibility
  mine: boolean
  editable: boolean
  revision: number
  source_template: string | null
  update_date: string
  card_count: number
}
export interface Dashboard extends DashboardSummary { document: DashboardDocument }

export interface Cell { v: number | null; n: number; text: string; few: boolean; drill?: string | null }
export interface ResultRow extends Cell {
  key: string
  label: string
  prior: number | null
  change: string
  link: { scope: Scope; key: string } | null
  cells?: Cell[]
}
export interface SeriesPoint { key: string; label: string; period: string; v: number | null; n: number; drill: string | null }
export type Tone = 'good' | 'bad' | 'flat'

export interface CardResult {
  measure: string
  shape: Shape
  unit: string
  kind: 'count' | 'distinct' | 'rate' | 'median' | 'snapshot'
  direction: 'up' | 'down'
  definition: string
  value: Cell
  compare: { v: number | null; text: string; change: string; tone: Tone; real: boolean; against: string } | null
  rows: ResultRow[]
  columns: Array<{ key: string; label: string }>
  series: { bucket: 'day' | 'week' | 'month'; points: SeriesPoint[]; ghost: Array<number | null> | null } | null
  more: (Cell & { count: number; label: string }) | null
  window: { start: string | null; end: string; preset: string }
  as_of: string
  drill: string | null
  chart: Exclude<Chart, 'auto'>
  charts: Array<Exclude<Chart, 'auto'>>
  headline: string
  auto_headline: string
  subline: string
}
export type CardError = { error: 'locked' | 'invalid'; errors: Array<{ field: string; message: string }> }
export type CardOutcome = CardResult | CardError
export const isCardError = (value: CardOutcome | undefined): value is CardError => Boolean(value && 'error' in value)

export interface DrillPerson {
  id: number
  user_uuid: string
  username: string
  first_name: string | null
  last_name: string | null
  avatar_image: string | null
  groups: string[]
  count: number
  counted: boolean
  last: string
}

export interface RegistryMeasure {
  key: string
  label: string
  definition: string
  kind: CardResult['kind']
  unit: string
  direction: 'up' | 'down'
  dims: string[]
  scopes: Scope[]
  snapshot: boolean
  available: boolean
  keywords: string[]
}
export interface Registry {
  measures: RegistryMeasure[]
  dimensions: Array<{ key: string; label: string; available: boolean }>
  charts: Record<Shape, Array<Exclude<Chart, 'auto'>>>
  ranges: string[]
}

export interface CaptureLink { token: string; expires_at: string | null; expired: boolean }
export interface CaptureAttachment { kind: string; label: string; [key: string]: unknown }
export interface CaptureSummary {
  capture_uuid: string
  title: string
  scope: Scope
  object_key: string | null
  object_label: string
  range: { asked: DateRange; start: string | null; end: string }
  note: string
  captured_by: string
  mine: boolean
  whole_org: boolean
  learners: number
  dashboard_uuid: string | null
  scheduled: boolean
  card_count: number
  attachments: Array<{ kind: string; label: string }>
  /** Its maker and admins can share it, and only they see the link. */
  can_share: boolean
  link: CaptureLink | null
  creation_date: string
}
export interface Capture extends Omit<CaptureSummary, 'attachments'> { cards: DashboardCard[]; results: Record<string, CardOutcome>; attachments: CaptureAttachment[] }
/** What a read-only link shows: no names, nothing to click into, numbers under ten hidden. */
export interface SharedCapture {
  title: string
  scope: Scope
  object_label: string
  range: Capture['range']
  note: string
  org: { name: string; slug: string }
  creation_date: string
  cards: DashboardCard[]
  results: Record<string, CardOutcome>
  attachments: CaptureAttachment[]
}
export type CaptureFilters = { dashboard?: string | null; scope?: Scope | null; key?: string | null; mine?: boolean; scheduled?: boolean | null }
export const LINK_DAYS = [7, 30, 90] as const

export type Cadence = 'weekly' | 'monthly' | 'once'
/** A scheduled capture (apps/api/src/services/insights/rules.py). */
export interface CaptureRule {
  rule_uuid: string
  dashboard_uuid: string | null
  title: string
  scope: Scope
  key: string | null
  cadence: Cadence
  /** Weekly: 0 is Monday. Monthly: 1-28, or 0 for the last day. */
  day: number
  on_date: string | null
  range: { preset: Preset } | { start: string; end: string } | null
  note: string
  summary: string
  staff: Array<{ user_uuid: string; name: string }>
  emails: string[]
  link_days: number | null
  enabled: boolean
  next_run_at: string | null
  last_run_at: string | null
  last_error: string
  owner: string
  mine: boolean
  editable: boolean
}
export interface RuleInput {
  key?: string | null
  cadence: Cadence
  day: number
  on_date?: string | null
  range?: DateRange | null
  note?: string
  staff?: string[]
  emails?: string[]
  link_days?: number | null
  enabled?: boolean
}
/** A rule as the form edits it again. */
export const ruleInput = (rule: CaptureRule): RuleInput => ({
  key: rule.key, cadence: rule.cadence, day: rule.day, on_date: rule.on_date, note: rule.note, link_days: rule.link_days, enabled: rule.enabled,
  range: rule.range ? ('preset' in rule.range ? rule.range.preset : rule.range) : null, staff: rule.staff.map((item) => item.user_uuid), emails: rule.emails,
})

export interface InsightObject { key: string; label: string; learners: number; external?: boolean; detail?: string }
export interface LibraryTemplate { key: string; scope: Scope; title: string; description: string; cards: DashboardCard[] }
export interface LibraryQuestion { key: string; text: string; spec: CardSpec }

export const insightKeys = {
  dashboards: (orgId: number) => ['insights', orgId, 'dashboards'] as const,
  dashboard: (orgId: number, uuid: string) => ['insights', orgId, 'dashboard', uuid] as const,
  objects: (orgId: number, scope: Scope) => ['insights', orgId, 'objects', scope] as const,
  library: (orgId: number, scope: Scope) => ['insights', orgId, 'library', scope] as const,
  registry: (orgId: number, scope: Scope, key: string | null) => ['insights', orgId, 'registry', scope, key] as const,
  captures: (orgId: number, filters: CaptureFilters = {}) => ['insights', orgId, 'captures', JSON.stringify(filters)] as const,
  capture: (orgId: number, uuid: string) => ['insights', orgId, 'capture', uuid] as const,
  rules: (orgId: number, dashboard: string | null = null) => ['insights', orgId, 'rules', dashboard] as const,
  cards: (orgId: number, uuid: string, revision: number, scopeKey: string | null, range: DateRange) =>
    ['insights', orgId, 'cards', uuid, revision, scopeKey, JSON.stringify(range)] as const,
}

export const insightsApi = {
  dashboards: (orgId: number, token?: string) =>
    request<{ dashboards: DashboardSummary[] }>(url(orgId, '/dashboards'), token).then((body) => body.dashboards),
  dashboard: (orgId: number, uuid: string, token?: string) => request<Dashboard>(url(orgId, `/dashboards/${q(uuid)}`), token),
  create: (orgId: number, body: { scope: Scope; title?: string; description?: string; visibility?: Visibility; template?: string | null; document?: Partial<DashboardDocument> }, token?: string) =>
    request<Dashboard>(url(orgId, '/dashboards'), token, 'POST', body),
  save: (orgId: number, uuid: string, body: { revision: number; document?: DashboardDocument; title?: string; description?: string; visibility?: Visibility }, token?: string) =>
    request<Dashboard & { copied: boolean }>(url(orgId, `/dashboards/${q(uuid)}`), token, 'PUT', body),
  duplicate: (orgId: number, uuid: string, title?: string, token?: string) =>
    request<Dashboard>(url(orgId, `/dashboards/${q(uuid)}/duplicate`), token, 'POST', { title: title || null }),
  remove: (orgId: number, uuid: string, token?: string) => request<{ deleted: boolean }>(url(orgId, `/dashboards/${q(uuid)}`), token, 'DELETE'),
  objects: (orgId: number, scope: 'plan' | 'group' | 'learner', token?: string) =>
    request<{ objects: InsightObject[] }>(url(orgId, '/objects', { scope }), token).then((body) => body.objects),
  library: (orgId: number, scope: Scope, token?: string) =>
    request<{ templates: LibraryTemplate[]; questions: LibraryQuestion[] }>(url(orgId, '/library', { scope }), token),
  registry: (orgId: number, scope: Scope, key: string | null, token?: string) => request<Registry>(url(orgId, '/registry', { scope, key }), token),
  run: (orgId: number, body: { scope: { kind: Scope; key: string | null }; range: DateRange; cards: Array<{ key: string; spec: CardSpec }> }, token?: string) =>
    request<{ results: Record<string, CardOutcome> }>(url(orgId, '/cards/run'), token, 'POST', body).then((response) => response.results),
  capture: (orgId: number, uuid: string, body: { key?: string | null; range?: DateRange | null; note?: string; attach?: string[] }, token?: string) =>
    request<Capture>(url(orgId, `/dashboards/${q(uuid)}/captures`), token, 'POST', body),
  captures: (orgId: number, filters: CaptureFilters = {}, token?: string) =>
    request<{ captures: CaptureSummary[] }>(url(orgId, '/captures', {
      dashboard: filters.dashboard, scope: filters.scope, key: filters.key, mine: filters.mine ? 'true' : null,
      scheduled: filters.scheduled == null ? null : String(filters.scheduled),
    }), token).then((body) => body.captures),
  getCapture: (orgId: number, uuid: string, token?: string) => request<Capture>(url(orgId, `/captures/${q(uuid)}`), token),
  captureNote: (orgId: number, uuid: string, note: string, token?: string) => request<Capture>(url(orgId, `/captures/${q(uuid)}/note`), token, 'PUT', { note }),
  captureLink: (orgId: number, uuid: string, body: { on: boolean; days?: number | null }, token?: string) =>
    request<Capture>(url(orgId, `/captures/${q(uuid)}/link`), token, 'PUT', body),
  rules: (orgId: number, dashboard: string | null = null, token?: string) =>
    request<{ rules: CaptureRule[] }>(url(orgId, '/rules', { dashboard }), token).then((body) => body.rules),
  createRule: (orgId: number, dashboard: string, body: RuleInput, token?: string) => request<CaptureRule>(url(orgId, `/dashboards/${q(dashboard)}/rules`), token, 'POST', body),
  updateRule: (orgId: number, uuid: string, body: RuleInput, token?: string) => request<CaptureRule>(url(orgId, `/rules/${q(uuid)}`), token, 'PUT', body),
  deleteRule: (orgId: number, uuid: string, token?: string) => request<{ deleted: boolean }>(url(orgId, `/rules/${q(uuid)}`), token, 'DELETE'),
  runRule: (orgId: number, uuid: string, token?: string) => request<{ capture_uuid: string; rule: CaptureRule }>(url(orgId, `/rules/${q(uuid)}/run`), token, 'POST'),
  /** No sign-in: anyone with the link. */
  shared: (token: string) => request<SharedCapture>(`${getAPIUrl()}insights/shared/${q(token)}`),
  drill: (orgId: number, body: { scope: { kind: Scope; key: string | null }; range: DateRange; spec: CardSpec; drill: string }, token?: string) =>
    request<{ total: number; people: DrillPerson[]; truncated: boolean }>(url(orgId, '/drill'), token, 'POST', body),
}

export const RANGE_LABELS: Record<Preset, string> = { '28d': '28 days', '90d': '90 days', '12m': '12 months', all: 'All time' }
export const SCOPE_LABELS: Record<Scope, { one: string; many: string }> = {
  org: { one: 'Organization', many: 'Overview' },
  plan: { one: 'Plan', many: 'Plans' },
  group: { one: 'Group', many: 'Groups' },
  learner: { one: 'Learner', many: 'Learners' },
}
export const VISIBILITY_LABELS: Record<Visibility, string> = { me: 'Only me', staff: 'Staff', admins: 'Admins' }
