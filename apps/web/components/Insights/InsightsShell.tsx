'use client'

import React from 'react'
import Link from 'next/link'
import { BarChart3, Camera, ChevronDown, ClipboardCheck, ListTree, Lock, Plus, User } from 'lucide-react'
import AdminTabPage from '@components/Admin/AdminTabPage'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { Scope } from '@services/insights/insights'
import { cn } from '@/lib/utils'
import NewDashboardModal from './NewDashboardModal'
import { ScopeGlyph, useDashboards, useInsightsContext } from './shared'
import './insights.css'

export type InsightsPlace = { dashboard: string | null; scope: Scope } | 'captures' | 'reports' | 'coverage' | 'evidence'

const item = 'flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13.5px] font-semibold text-foreground transition-colors hover:bg-muted'
const eyebrow = 'mb-1 mt-4 px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground first:mt-0'

/** The dashboards rail: the organization's own, then one plan or group at a time, then the group reports. */
function Rail({ place, onNew }: { place: InsightsPlace; onNew: () => void }) {
  const { orgslug } = useInsightsContext()
  const { data: dashboards } = useDashboards()
  const admin = routePaths.org.admin
  const href = (path: string) => getUriWithOrg(orgslug, path)
  const current = typeof place === 'object' ? place : null
  const count = (scope: Scope) => dashboards?.filter((dashboard) => dashboard.scope === scope).length || 0
  const scopeItem = (scope: 'plan' | 'group', label: string) => <Link key={scope} href={href(admin.insightsScope(scope))}
    aria-current={current?.scope === scope ? 'page' : undefined} className={cn(item, current?.scope === scope && 'bg-muted')}>
    <ScopeGlyph scope={scope} /><span className="min-w-0 flex-1"><b className="block truncate">{label}</b>
      <span className="block truncate text-[11.5px] font-medium text-muted-foreground">{count(scope)} view{count(scope) === 1 ? '' : 's'}</span></span>
  </Link>
  const reportItem = (id: 'captures' | 'reports' | 'coverage' | 'evidence', label: string, path: string, Icon: typeof BarChart3) =>
    <Link key={id} href={href(path)} aria-current={place === id ? 'page' : undefined} className={cn(item, place === id && 'bg-muted')}>
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true"><Icon size={15} /></span>
      <span className="truncate">{label}</span>
    </Link>
  return <nav aria-label="Dashboards" className="flex flex-col">
    <span className={eyebrow}>Overview</span>
    {dashboards ? dashboards.filter((dashboard) => dashboard.scope === 'org').map((dashboard) => {
      const on = current?.dashboard === dashboard.dashboard_uuid
      return <Link key={dashboard.dashboard_uuid} href={href(admin.insights(dashboard.dashboard_uuid))} aria-current={on ? 'page' : undefined} className={cn(item, on && 'bg-muted')}>
        <ScopeGlyph scope="org" /><span className="min-w-0 flex-1 truncate">{dashboard.title}</span>
        {dashboard.visibility === 'me' ? <Lock size={12} className="shrink-0 text-muted-foreground" aria-label="Only you" /> : null}
      </Link>
    }) : <span className="mx-2 h-8 animate-pulse rounded-lg bg-muted" />}
    <span className={eyebrow}>One at a time</span>
    {scopeItem('plan', 'Plans')}
    {scopeItem('group', 'Groups')}
    <span className={cn(item, 'cursor-default text-muted-foreground hover:bg-transparent')}>
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-muted" aria-hidden="true"><User size={15} /></span>
      <span className="flex-1">Learners</span><span className="rounded-full bg-muted px-2 py-px text-[10.5px] font-bold">Next</span>
    </span>
    <button type="button" onClick={onNew} className={cn(item, 'mt-2 text-muted-foreground hover:text-foreground')}>
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-border" aria-hidden="true"><Plus size={15} /></span>New dashboard
    </button>
    <span className={eyebrow}>Reports and evidence</span>
    {reportItem('captures', 'Captures', admin.insightsCaptures(), Camera)}
    {reportItem('reports', 'Group reports', admin.insightsReport(), BarChart3)}
    {reportItem('coverage', 'Requirement coverage', admin.insightsCoverage(), ListTree)}
    {reportItem('evidence', 'Learner evidence', admin.insightsEvidence(), ClipboardCheck)}
  </nav>
}

const NewDashboard = React.createContext<(scope?: Scope) => void>(() => {}) // eslint-disable-line no-unused-vars
/** Opens New dashboard, starting on a kind of dashboard. */
export const useNewDashboard = () => React.useContext(NewDashboard)

/** Insights: the rail of dashboards and reports beside the one that's open. */
export default function InsightsShell({ place, children }: { place: InsightsPlace; children: React.ReactNode }) {
  const here: Scope = typeof place === 'object' ? place.scope : 'org'
  const [creating, setCreating] = React.useState<Scope | null>(null)
  const [railOpen, setRailOpen] = React.useState(false)
  const openNew = React.useCallback((scope?: Scope) => setCreating(scope || here), [here])
  return <NewDashboard.Provider value={openNew}><AdminTabPage tab="insights">
    <div className="insights-viz mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 pb-16 pt-6 sm:px-8 lg:flex-row">
      <aside className="lg:sticky lg:top-6 lg:w-[220px] lg:shrink-0 lg:self-start">
        <button type="button" onClick={() => setRailOpen((open) => !open)} aria-expanded={railOpen}
          className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-2.5 text-[13px] font-bold text-foreground lg:hidden">
          All dashboards and reports<ChevronDown size={16} className={cn('transition-transform', railOpen && 'rotate-180')} aria-hidden="true" />
        </button>
        <div className={cn('mt-2 rounded-2xl border border-border bg-card p-2 lg:mt-0 lg:block lg:border-0 lg:bg-transparent lg:p-0', !railOpen && 'hidden')}>
          <Rail place={place} onNew={() => openNew()} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
    <NewDashboardModal scope={creating} onClose={() => setCreating(null)} />
  </AdminTabPage></NewDashboard.Provider>
}
