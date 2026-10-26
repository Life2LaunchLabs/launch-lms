'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, CalendarClock, Camera, Check, Copy, Link2, Loader2, Paperclip, Pencil, Printer } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { LINK_DAYS, SCOPE_LABELS, insightKeys, insightsApi, type Capture, type CaptureFilters, type CaptureSummary, type Scope } from '@services/insights/insights'
import { cn } from '@/lib/utils'
import CapturedCards, { Attachments, capturedOn, rangeText } from './CapturedCards'
import InsightsShell from './InsightsShell'
import { ScheduleList } from './Schedules'
import { dashboardHref } from './NewDashboardModal'
import { ScopeGlyph, useDashboards, useInsightsContext } from './shared'

const chip = (on: boolean) => cn('h-8 rounded-full px-3 text-[13px] font-semibold', on ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')
const ghostButton = 'inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold hover:bg-muted'
const SCOPE_FILTERS: Array<Scope | null> = [null, 'org', 'plan', 'group']

function CaptureRow({ capture }: { capture: CaptureSummary }) {
  const { orgslug } = useInsightsContext()
  return <li>
    <Link href={getUriWithOrg(orgslug, routePaths.org.admin.insightsCapture(capture.capture_uuid))} data-testid="capture-row"
      className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5 nice-shadow transition-colors hover:bg-muted">
      <ScopeGlyph scope={capture.scope} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <b className="truncate text-[14.5px]">{capture.title}</b>
          {capture.object_label ? <span className="truncate text-[13px] font-semibold text-muted-foreground">{capture.object_label}</span> : null}
        </span>
        <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{rangeText(capture.range)} · {capture.captured_by} · {capturedOn(capture.creation_date)}</span>
        {capture.note ? <span className="mt-1 line-clamp-2 block text-[13px] text-foreground">{capture.note}</span> : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 text-[11.5px] font-semibold text-muted-foreground">
        {capture.link && !capture.link.expired ? <span className="inline-flex items-center gap-1"><Link2 size={12} aria-hidden="true" />Shared</span> : null}
        {capture.scheduled ? <span className="inline-flex items-center gap-1"><CalendarClock size={12} aria-hidden="true" />Scheduled</span> : null}
        {capture.attachments.length ? <span className="inline-flex items-center gap-1"><Paperclip size={12} aria-hidden="true" />{capture.attachments.length}</span> : null}
      </span>
    </Link>
  </li>
}

/** The capture log: every capture the viewer may open, newest first, narrowed by dashboard, kind, and who made it. */
export function CaptureLog({ dashboard }: { dashboard: string | null }) {
  const { orgId, orgslug, token, ready } = useInsightsContext()
  const { data: dashboards } = useDashboards()
  const [scope, setScope] = React.useState<Scope | null>(null)
  const [mine, setMine] = React.useState(false)
  const filters: CaptureFilters = { dashboard, scope, mine }
  const { data: captures, error } = useSWR(ready ? insightKeys.captures(orgId, filters) : null, () => insightsApi.captures(orgId, filters, token), { revalidateOnFocus: false })
  const board = dashboards?.find((item) => item.dashboard_uuid === dashboard)
  return <InsightsShell place="captures">
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">Captures</h1>
        <p className="text-[13.5px] text-muted-foreground">Dashboards frozen at a moment, kept as they were. Capture any dashboard from its page, or schedule it from its menu.</p>
      </header>
      {dashboard ? null : <ScheduleList />}
      <div className="flex flex-wrap items-center gap-2">
        {board ? <span className="inline-flex h-8 items-center gap-2 rounded-full bg-muted pl-3 pr-1 text-[13px] font-semibold">{board.title}
          <Link href={getUriWithOrg(orgslug, routePaths.org.admin.insightsCaptures())} className="rounded-full px-2 py-0.5 text-muted-foreground hover:bg-card" aria-label="Show every dashboard">×</Link>
        </span> : <div className="inline-flex rounded-full border border-border bg-card p-0.5" role="group" aria-label="Kind">
          {SCOPE_FILTERS.map((item) => <button key={item || 'all'} type="button" onClick={() => setScope(item)} aria-pressed={scope === item} className={chip(scope === item)}>
            {item ? SCOPE_LABELS[item].many : 'All'}</button>)}
        </div>}
        <div className="inline-flex rounded-full border border-border bg-card p-0.5" role="group" aria-label="Made by">
          <button type="button" onClick={() => setMine(false)} aria-pressed={!mine} className={chip(!mine)}>Everyone</button>
          <button type="button" onClick={() => setMine(true)} aria-pressed={mine} className={chip(mine)}>Mine</button>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error.message || "Couldn't load captures"}</p>
        : !captures ? <div className="space-y-2">{[0, 1, 2].map((index) => <span key={index} className="block h-20 animate-pulse rounded-2xl bg-muted" />)}</div>
          : captures.length ? <ul className="space-y-2">{captures.map((capture) => <CaptureRow key={capture.capture_uuid} capture={capture} />)}</ul>
            : <div className="flex flex-col items-center gap-2 rounded-[22px] border-[1.5px] border-dashed border-border px-6 py-14 text-center">
              <Camera size={22} className="text-muted-foreground" aria-hidden="true" />
              <h2 className="text-[18px] font-bold">No captures yet</h2>
              <p className="max-w-[420px] text-muted-foreground">Open a dashboard and press Capture to keep it as it is today, with a note. Captures are kept for good.</p>
            </div>}
    </div>
  </InsightsShell>
}

function Note({ capture }: { capture: Capture }) {
  const { orgId, token } = useInsightsContext()
  const [editing, setEditing] = React.useState<string | null>(null)
  const save = async () => {
    try {
      const saved = await insightsApi.captureNote(orgId, capture.capture_uuid, editing || '', token)
      await mutate(insightKeys.capture(orgId, capture.capture_uuid), saved, { revalidate: false })
      setEditing(null)
    } catch (error: any) { toast.error(error?.message || "Couldn't save the note") }
  }
  if (editing !== null) return <div className="space-y-2">
    <textarea value={editing} onChange={(event) => setEditing(event.target.value)} maxLength={2000} rows={3} aria-label="Note" autoFocus
      className="w-full rounded-xl border border-border bg-card px-3 py-2 text-[14px] outline-none focus:border-foreground" />
    <div className="flex gap-2"><button type="button" onClick={save} className={cn(ghostButton, 'bg-foreground text-background hover:bg-foreground')}><Check size={14} />Save</button>
      <button type="button" onClick={() => setEditing(null)} className={ghostButton}>Cancel</button></div>
  </div>
  if (!capture.note && !capture.mine) return null
  return <div className="flex items-start gap-2">
    <p className={cn('whitespace-pre-line text-[14px]', !capture.note && 'text-muted-foreground')}>{capture.note || 'No note.'}</p>
    {capture.mine ? <button type="button" onClick={() => setEditing(capture.note)} className="insights-print-hide rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Edit note"><Pencil size={13} /></button> : null}
  </div>
}

/** The read-only link: on with how long it lasts, copy it, or turn it off. Its maker and admins see this. */
function SharePanel({ capture }: { capture: Capture }) {
  const { orgId, orgslug, token } = useInsightsContext()
  const [days, setDays] = React.useState<number | null>(30)
  const [busy, setBusy] = React.useState(false)
  const link = capture.link && !capture.link.expired ? capture.link : null
  const path = link ? getUriWithOrg(orgslug, routePaths.org.insightsShared(link.token)) : ''
  // getUriWithOrg is already absolute on subdomain hosts.
  const href = path && typeof window !== 'undefined' ? new URL(path, window.location.origin).toString() : ''
  const set = async (on: boolean) => {
    setBusy(true)
    try {
      const saved = await insightsApi.captureLink(orgId, capture.capture_uuid, { on, days: on ? days : null }, token)
      await mutate(insightKeys.capture(orgId, capture.capture_uuid), saved, { revalidate: false })
    } catch (error: any) { toast.error(error?.message || "Couldn't change the link") } finally { setBusy(false) }
  }
  const copy = async () => { await navigator.clipboard.writeText(href); toast.success('Link copied') }
  return <section className="insights-print-hide space-y-2 rounded-2xl border border-border bg-card p-3.5" aria-label="Read-only link">
    <h2 className="flex items-center gap-1.5 text-[14px] font-bold"><Link2 size={14} aria-hidden="true" />Read-only link</h2>
    <p className="text-[12.5px] text-muted-foreground">Anyone with the link sees these cards without signing in. No names, nothing to click into, and any number under ten shows as “fewer than 10”.</p>
    {link ? <div className="flex flex-wrap items-center gap-2">
      <input readOnly value={href} aria-label="Link" className="h-9 min-w-[220px] flex-1 rounded-xl border border-border bg-muted px-3 text-[12.5px]" onFocus={(event) => event.target.select()} />
      <button type="button" onClick={copy} className={ghostButton}><Copy size={14} />Copy</button>
      <button type="button" onClick={() => set(false)} disabled={busy} className={ghostButton}>Turn off</button>
      <span className="w-full text-[12px] text-muted-foreground">{link.expires_at ? `Works until ${capturedOn(link.expires_at)}.` : 'Works until you turn it off.'}</span>
    </div> : <div className="flex flex-wrap items-center gap-2">
      <select value={days ?? ''} onChange={(event) => setDays(event.target.value ? Number(event.target.value) : null)} aria-label="How long it works"
        className="h-9 rounded-full border border-border bg-card px-3 text-[13px] font-semibold">
        {LINK_DAYS.map((item) => <option key={item} value={item}>For {item} days</option>)}
        <option value="">Until turned off</option>
      </select>
      <button type="button" onClick={() => set(true)} disabled={busy} className={cn(ghostButton, 'bg-foreground text-background hover:bg-foreground hover:opacity-90')}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}Make a link</button>
    </div>}
  </section>
}

/** One capture: what it is, its note, its cards as they were, and printing or sharing it. */
export function CaptureView({ captureUuid }: { captureUuid: string }) {
  const { orgId, orgslug, token, ready } = useInsightsContext()
  const { data: capture, error } = useSWR(ready ? insightKeys.capture(orgId, captureUuid) : null, () => insightsApi.getCapture(orgId, captureUuid, token), { revalidateOnFocus: false })
  const admin = routePaths.org.admin
  return <InsightsShell place="captures">
    {error ? <div className="rounded-[22px] border-[1.5px] border-dashed border-border px-6 py-14 text-center">
      <h1 className="text-[20px] font-bold">Capture not found</h1><p className="text-muted-foreground">It may be someone else&apos;s, or the link is wrong.</p>
    </div> : !capture ? <span className="block h-40 animate-pulse rounded-2xl bg-muted" /> : <div className="insights-print space-y-5">
      <Link href={getUriWithOrg(orgslug, admin.insightsCaptures())} className="insights-print-hide inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} aria-hidden="true" />Captures</Link>
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ScopeGlyph scope={capture.scope} size="lg" />
            <div className="min-w-0">
              <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">{capture.object_label || capture.title}</h1>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{capture.object_label ? `${capture.title} · ` : ''}{rangeText(capture.range)}</p>
            </div>
          </div>
          <div className="insights-print-hide flex items-center gap-2">
            {capture.dashboard_uuid ? <Link href={dashboardHref(orgslug, capture.scope, capture.dashboard_uuid)} className={ghostButton}>Open dashboard</Link> : null}
            <button type="button" onClick={() => window.print()} className={ghostButton}><Printer size={14} aria-hidden="true" />Print</button>
          </div>
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          Captured {capturedOn(capture.creation_date)} by {capture.captured_by}{capture.scheduled ? ' on a schedule' : ''}.{' '}
          {capture.whole_org ? 'Counts every learner in the organization.' : `Counts the ${capture.learners} learners ${capture.mine ? 'you' : 'they'} work with.`}
        </p>
        <Note capture={capture} />
      </header>
      {capture.can_share ? <SharePanel capture={capture} /> : null}
      <CapturedCards cards={capture.cards} results={capture.results} />
      <Attachments attachments={capture.attachments} />
    </div>}
  </InsightsShell>
}
