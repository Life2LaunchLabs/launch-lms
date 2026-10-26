'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Check, ChevronDown, Copy, Lock, MoreHorizontal, Plus, Trash2, Users } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  RANGE_LABELS, SCOPE_LABELS, VISIBILITY_LABELS, insightKeys, insightsApi,
  type Dashboard, type DashboardCard, type DateRange, type InsightObject, type Preset, type ResultRow, type Scope,
} from '@services/insights/insights'
import { cn } from '@/lib/utils'
import DrillSheet, { type DrillTarget } from './DrillSheet'
import InsightCard, { CardSkeleton } from './InsightCard'
import InsightsShell, { useNewDashboard } from './InsightsShell'
import { dashboardHref } from './NewDashboardModal'
import { ScopeGlyph, useDashboards, useInsightsContext } from './shared'

const PRESETS = Object.keys(RANGE_LABELS) as Preset[]
const ghostButton = 'inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold hover:bg-muted'

function VisibilityTag({ dashboard }: { dashboard: Dashboard }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground" title="Who can see this dashboard">
    {dashboard.visibility === 'me' ? <Lock size={11} aria-hidden="true" /> : <Users size={11} aria-hidden="true" />}{VISIBILITY_LABELS[dashboard.visibility]}
  </span>
}

function Empty({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-2.5 rounded-[22px] border-[1.5px] border-dashed border-border px-6 py-14 text-center">
    <h2 className="text-[20px] font-bold tracking-tight">{title}</h2>
    <p className="max-w-[440px] leading-normal text-muted-foreground">{detail}</p>
    {action}
  </div>
}

/** The plan or group a scoped dashboard is showing, with a menu to switch to another. */
function ObjectSwitcher({ scope, objects, current, onPick }: { scope: Scope; objects: InsightObject[]; current: InsightObject; onPick: (key: string) => void }) { // eslint-disable-line no-unused-vars
  return <DropdownMenu>
    <DropdownMenuTrigger className="group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg text-left hover:opacity-80" aria-label={`Switch ${SCOPE_LABELS[scope].one.toLowerCase()}`}>
      <h1 className="truncate text-[26px] font-extrabold leading-tight tracking-tight">{current.label}</h1><ChevronDown size={20} className="shrink-0 text-muted-foreground" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="max-h-[360px] w-[300px] overflow-y-auto">
      <DropdownMenuLabel>{SCOPE_LABELS[scope].many}</DropdownMenuLabel>
      {objects.map((item) => <DropdownMenuItem key={item.key} onSelect={() => onPick(item.key)} className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className="text-[11.5px] text-muted-foreground">{item.learners}</span>
        {item.key === current.key ? <Check size={14} aria-hidden="true" /> : null}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>
}

/** Duplicate or delete the open dashboard. */
function DashboardMenu({ dashboard, scopeRoot }: { dashboard: Dashboard; scopeRoot: string }) {
  const router = useRouter()
  const { orgId, orgslug, token } = useInsightsContext()
  const duplicate = async () => {
    try {
      const copy = await insightsApi.duplicate(orgId, dashboard.dashboard_uuid, undefined, token)
      await mutate(insightKeys.dashboards(orgId))
      toast.success('Made your own copy')
      router.push(dashboardHref(orgslug, copy.scope, copy.dashboard_uuid))
    } catch (error: any) { toast.error(error?.message || "Couldn't copy it") }
  }
  const remove = async () => {
    if (!window.confirm(`Delete “${dashboard.title}”? ${dashboard.visibility === 'me' ? '' : 'Everyone it is shared with loses it too.'}`)) return
    try {
      await insightsApi.remove(orgId, dashboard.dashboard_uuid, token)
      await mutate(insightKeys.dashboards(orgId))
      router.push(scopeRoot)
    } catch (error: any) { toast.error(error?.message || "Couldn't delete it") }
  }
  return <DropdownMenu>
    <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card hover:bg-muted" aria-label="More"><MoreHorizontal size={16} /></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={duplicate}><Copy size={14} className="mr-2" />Duplicate</DropdownMenuItem>
      {dashboard.editable ? <><DropdownMenuSeparator /><DropdownMenuItem onSelect={remove} className="text-red-600"><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem></> : null}
    </DropdownMenuContent>
  </DropdownMenu>
}

function RangeBar({ range, setRange }: { range: DateRange; setRange: (range: DateRange) => void }) { // eslint-disable-line no-unused-vars
  return <div className="flex flex-wrap items-center gap-3">
    <div className="inline-flex rounded-full border border-border bg-card p-0.5" role="group" aria-label="Dates">
      {PRESETS.map((preset) => <button key={preset} type="button" onClick={() => setRange(preset)} aria-pressed={range === preset}
        className={cn('h-8 rounded-full px-3 text-[13px] font-semibold transition-colors', range === preset ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
        {RANGE_LABELS[preset]}
      </button>)}
    </div>
    <span className="text-[12px] text-muted-foreground">Each card compares with the same length of time just before, unless it says otherwise.</span>
  </div>
}

/** The cards of one dashboard, run together for this viewer, the dates and (for a plan or group) the one picked. */
function Cards({ dashboard, scopeKey, range }: { dashboard: Dashboard; scopeKey: string | null; range: DateRange }) {
  const { orgId, orgslug, token } = useInsightsContext()
  const [target, setTarget] = React.useState<DrillTarget | null>(null)
  const cards = dashboard.document.cards
  const scope = { kind: dashboard.scope, key: scopeKey }
  const { data: results, error } = useSWR(insightKeys.cards(orgId, dashboard.dashboard_uuid, dashboard.revision, scopeKey, range),
    () => insightsApi.run(orgId, { scope, range, cards: cards.map(({ key, spec }) => ({ key, spec })) }, token), { revalidateOnFocus: false, keepPreviousData: true })
  const linkFor = React.useCallback((row: ResultRow) => row.link && (row.link.scope === 'plan' || row.link.scope === 'group')
    ? getUriWithOrg(orgslug, routePaths.org.admin.insightsScope(row.link.scope, row.link.key)) : null, [orgslug])
  const drillFor = (card: DashboardCard) => (key: string | null | undefined, title: string) => { if (key) setTarget({ title, spec: card.spec, drill: key }) }
  if (!cards.length) return <Empty title="No cards yet" detail="Adding and arranging cards comes next. For now, start a dashboard from a template under New dashboard." />
  if (error) return <Empty title="Couldn't load this dashboard" detail={error.message || 'Try again in a moment.'} />
  return <>
    <div className="grid grid-cols-12 gap-4">
      {cards.map((card) => results ? <InsightCard key={card.key} card={card} outcome={results[card.key]} drill={drillFor(card)} linkFor={linkFor} />
        : <CardSkeleton key={card.key} span={card.span} />)}
    </div>
    <DrillSheet target={target} onClose={() => setTarget(null)} orgId={orgId} orgslug={orgslug} token={token} scope={scope} range={range} />
  </>
}

/** A dashboard page: the org's (`scope` org), or a plan's or group's for the one picked (`objectKey`). */
export default function InsightsDashboard({ scope, objectKey, dashboardUuid }: { scope: 'org' | 'plan' | 'group'; objectKey?: string | null; dashboardUuid?: string | null }) {
  const router = useRouter()
  const { orgId, orgslug, token, ready } = useInsightsContext()
  const { data: dashboards } = useDashboards()
  const inScope = (dashboards || []).filter((item) => item.scope === scope)
  const chosen = inScope.find((item) => item.dashboard_uuid === dashboardUuid) || inScope[0]
  const { data: objects } = useSWR(ready && scope !== 'org' ? insightKeys.objects(orgId, scope) : null,
    () => insightsApi.objects(orgId, scope as 'plan' | 'group', token), { revalidateOnFocus: false })
  const object = objects?.find((item) => item.key === objectKey) || objects?.[0]
  const { data: dashboard } = useSWR(ready && chosen ? insightKeys.dashboard(orgId, chosen.dashboard_uuid) : null,
    () => insightsApi.dashboard(orgId, chosen!.dashboard_uuid, token), { revalidateOnFocus: false })
  const [range, setRange] = React.useState<DateRange | null>(null)
  React.useEffect(() => { setRange(null) }, [chosen?.dashboard_uuid])
  const admin = routePaths.org.admin
  const scopeHref = (key?: string | null, uuid?: string | null) => getUriWithOrg(orgslug, scope === 'org' ? admin.insights(uuid) : admin.insightsScope(scope, key, uuid))

  const body = () => {
    if (!dashboards || (scope !== 'org' && !objects)) return <div className="space-y-4"><span className="block h-9 w-72 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-12 gap-4">{[3, 3, 3, 3, 7, 5].map((span, index) => <CardSkeleton key={index} span={span} />)}</div></div>
    if (scope !== 'org' && !object) return <Empty title={`No ${SCOPE_LABELS[scope].many.toLowerCase()} to show yet`}
      detail={scope === 'plan' ? 'Once your learners start plans, each plan gets these dashboards.' : 'Make a group in Threads, and each group gets these dashboards.'} />
    if (!chosen) return <Empty title={`No ${SCOPE_LABELS[scope].one.toLowerCase()} dashboards yet`} detail="Make one from a template or start blank."
      action={<NewButton scope={scope} />} />
    const effective = range ?? dashboard?.document.range ?? '90d'
    return <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ScopeGlyph scope={scope} size="lg" />
            <div className="min-w-0">
              {scope === 'org' ? <h1 className="truncate text-[26px] font-extrabold leading-tight tracking-tight">{chosen.title}</h1>
                : <ObjectSwitcher scope={scope} objects={objects!} current={object!} onPick={(key) => router.push(scopeHref(key, chosen.dashboard_uuid))} />}
              <p className="mt-0.5 text-[13px] text-muted-foreground">{scope === 'org' ? SCOPE_LABELS.org.many : `${object!.learners} learner${object!.learners === 1 ? '' : 's'}${object!.external ? ' · from another organization' : ''}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">{dashboard ? <DashboardMenu dashboard={dashboard} scopeRoot={scopeHref(object?.key)} /> : null}</div>
        </div>
        {scope !== 'org' ? <nav aria-label={`${SCOPE_LABELS[scope].one} dashboards`} className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
          {inScope.map((item) => <Link key={item.dashboard_uuid} href={scopeHref(object!.key, item.dashboard_uuid)} aria-current={item.dashboard_uuid === chosen.dashboard_uuid ? 'page' : undefined}
            className={cn('-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 py-2 text-sm font-bold',
              item.dashboard_uuid === chosen.dashboard_uuid ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {item.title}{item.visibility === 'me' ? <Lock size={11} aria-label="Only you" /> : null}
          </Link>)}
          <NewButton scope={scope} tab />
        </nav> : null}
        {dashboard ? <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground"><VisibilityTag dashboard={dashboard} />{dashboard.description}</p> : null}
        <RangeBar range={effective} setRange={setRange} />
      </header>
      {dashboard ? <Cards dashboard={dashboard} scopeKey={object?.key || null} range={effective} />
        : <div className="grid grid-cols-12 gap-4">{[3, 3, 3, 3].map((span, index) => <CardSkeleton key={index} span={span} />)}</div>}
    </div>
  }
  return <InsightsShell place={{ dashboard: chosen?.dashboard_uuid || null, scope }}>{body()}</InsightsShell>
}

function NewButton({ scope, tab }: { scope: Scope; tab?: boolean }) {
  const open = useNewDashboard()
  return <button type="button" onClick={() => open(scope)}
    className={tab ? '-mb-px inline-flex shrink-0 items-center gap-1 border-b-[3px] border-transparent px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground' : ghostButton}>
    <Plus size={14} aria-hidden="true" />{tab ? `New ${SCOPE_LABELS[scope].one.toLowerCase()} view` : 'New dashboard'}
  </button>
}
