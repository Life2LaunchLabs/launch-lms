'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { CalendarClock, Loader2, Pause, Play, Plus, Send, Trash2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Label } from '@components/ui/label'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  LINK_DAYS, RANGE_LABELS, insightKeys, insightsApi, ruleInput,
  type Cadence, type CaptureRule, type Dashboard, type Preset, type RuleInput,
} from '@services/insights/insights'
import { cn } from '@/lib/utils'
import { capturedOn } from './CapturedCards'
import { dashboardHref } from './NewDashboardModal'
import { useInsightsContext } from './shared'

// Scheduled captures: a dashboard captured weekly, monthly or once on a date, and sent to the people on it.

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const field = 'h-9 rounded-xl border border-border bg-card px-3 text-[13.5px]'
const ghostButton = 'inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold hover:bg-muted'
const iconButton = 'inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40'
const refreshRules = (orgId: number) => mutate((key) => Array.isArray(key) && key[0] === 'insights' && key[1] === orgId && (key[2] === 'rules' || key[2] === 'captures'))

const parseEmails = (text: string) => text.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean)

/** One schedule: when it runs, who hears, and pause, run now or remove. */
export function RuleRow({ rule, showDashboard = false }: { rule: CaptureRule; showDashboard?: boolean }) {
  const router = useRouter()
  const { orgId, orgslug, token } = useInsightsContext()
  const [busy, setBusy] = React.useState(false)
  const act = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    try { await work(); await refreshRules(orgId); if (done) toast.success(done) } catch (error: any) { toast.error(error?.message || "Couldn't change the schedule") } finally { setBusy(false) }
  }
  const toggle = () => act(() => insightsApi.updateRule(orgId, rule.rule_uuid, { ...ruleInput(rule), enabled: !rule.enabled }, token))
  const remove = () => { if (window.confirm('Stop this schedule? The captures it made stay.')) act(() => insightsApi.deleteRule(orgId, rule.rule_uuid, token)) }
  const runNow = () => act(async () => {
    const out = await insightsApi.runRule(orgId, rule.rule_uuid, token)
    router.push(getUriWithOrg(orgslug, routePaths.org.admin.insightsCapture(out.capture_uuid)))
  }, 'Captured and sent')
  const who = [...rule.staff.map((item) => item.name), ...rule.emails]
  return <li className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3" data-testid="schedule-row">
    <span className={cn('mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', rule.enabled ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')} aria-hidden="true"><CalendarClock size={15} /></span>
    <span className="min-w-0 flex-1 text-[13px]">
      <b className="block text-[14px]">{rule.summary}{showDashboard ? <> · {rule.dashboard_uuid ? <Link className="hover:underline" href={dashboardHref(orgslug, rule.scope, rule.dashboard_uuid)}>{rule.title}</Link> : rule.title}</> : null}</b>
      <span className="block text-muted-foreground">
        {rule.enabled ? (rule.next_run_at ? `Next ${capturedOn(rule.next_run_at)}` : 'Done') : rule.last_error ? `Off: ${rule.last_error}` : 'Paused'}
        {who.length ? ` · to ${who.slice(0, 3).join(', ')}${who.length > 3 ? ` and ${who.length - 3} more` : ''}` : ' · kept in Captures, no email'}
        {rule.mine ? '' : ` · ${rule.owner}'s`}
      </span>
      {rule.note ? <span className="mt-0.5 line-clamp-1 block">{rule.note}</span> : null}
    </span>
    {rule.editable ? <span className="flex shrink-0 items-center">
      <button type="button" className={iconButton} onClick={runNow} disabled={busy} aria-label="Run now" title="Capture and send now"><Send size={14} /></button>
      <button type="button" className={iconButton} onClick={toggle} disabled={busy} aria-label={rule.enabled ? 'Pause' : 'Turn on'}>{rule.enabled ? <Pause size={14} /> : <Play size={14} />}</button>
      <button type="button" className={iconButton} onClick={remove} disabled={busy} aria-label="Stop schedule"><Trash2 size={14} /></button>
    </span> : null}
  </li>
}

/** The form for a new schedule on this dashboard (and, for a plan or group, the one open now). */
function RuleForm({ dashboard, scopeKey, objectLabel, onDone }: { dashboard: Dashboard; scopeKey: string | null; objectLabel: string | null; onDone: () => void }) {
  const { orgId, token, userUuid } = useInsightsContext()
  const [cadence, setCadence] = React.useState<Cadence>('monthly')
  const [day, setDay] = React.useState(1)
  const [onDate, setOnDate] = React.useState('')
  const [range, setRange] = React.useState<Preset | ''>('')
  const [note, setNote] = React.useState('')
  const [toMe, setToMe] = React.useState(true)
  const [emails, setEmails] = React.useState('')
  const [linkDays, setLinkDays] = React.useState<number | null>(30)
  const [saving, setSaving] = React.useState(false)
  const outside = parseEmails(emails)
  const pickCadence = (next: Cadence) => { setCadence(next); setDay(next === 'weekly' ? 0 : 1) }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const body: RuleInput = {
      key: scopeKey, cadence, day, on_date: cadence === 'once' ? onDate || null : null, range: range || null, note,
      staff: toMe && userUuid ? [userUuid] : [], emails: outside, link_days: outside.length ? linkDays : null,
    }
    setSaving(true)
    try {
      await insightsApi.createRule(orgId, dashboard.dashboard_uuid, body, token)
      await refreshRules(orgId)
      toast.success('Scheduled')
      onDone()
    } catch (error: any) { toast.error(error?.message || "Couldn't schedule it") } finally { setSaving(false) }
  }
  return <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border p-3.5">
    {objectLabel ? <p className="text-[13px] text-muted-foreground">Captures <b className="text-foreground">{objectLabel}</b> each time.</p> : null}
    <div className="flex flex-wrap items-end gap-2">
      <label className="space-y-1"><span className="block text-[12.5px] font-semibold">How often</span>
        <select value={cadence} onChange={(event) => pickCadence(event.target.value as Cadence)} className={field} aria-label="How often">
          <option value="weekly">Every week</option><option value="monthly">Every month</option><option value="once">Once, on a date</option>
        </select></label>
      {cadence === 'weekly' ? <label className="space-y-1"><span className="block text-[12.5px] font-semibold">On</span>
        <select value={day} onChange={(event) => setDay(Number(event.target.value))} className={field} aria-label="Day of the week">
          {WEEKDAYS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label> : null}
      {cadence === 'monthly' ? <label className="space-y-1"><span className="block text-[12.5px] font-semibold">On</span>
        <select value={day} onChange={(event) => setDay(Number(event.target.value))} className={field} aria-label="Day of the month">
          {Array.from({ length: 28 }, (_, index) => <option key={index + 1} value={index + 1}>Day {index + 1}</option>)}<option value={0}>The last day</option></select></label> : null}
      {cadence === 'once' ? <label className="space-y-1"><span className="block text-[12.5px] font-semibold">On</span>
        <input type="date" value={onDate} onChange={(event) => setOnDate(event.target.value)} required className={field} aria-label="Date" /></label> : null}
      <label className="space-y-1"><span className="block text-[12.5px] font-semibold">Dates it covers</span>
        <select value={range} onChange={(event) => setRange(event.target.value as Preset | '')} className={field} aria-label="Dates it covers">
          <option value="">The dashboard&apos;s own</option>{(Object.keys(RANGE_LABELS) as Preset[]).map((key) => <option key={key} value={key}>Last {RANGE_LABELS[key].toLowerCase()}</option>)}
        </select></label>
    </div>
    <p className="text-[12px] text-muted-foreground">It runs early in the morning (6:00 UTC) and counts the learners you can see.</p>
    <div className="space-y-1.5">
      <Label htmlFor="rule-note">Note</Label>
      <input id="rule-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Goes on every capture, e.g. Monthly board update" className={cn(field, 'w-full')} />
    </div>
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-semibold">Who hears about it</legend>
      <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={toMe} onChange={(event) => setToMe(event.target.checked)} />Email me a link into Insights</label>
      <div className="space-y-1">
        <input value={emails} onChange={(event) => setEmails(event.target.value)} aria-label="Other email addresses" placeholder="Other addresses, separated by commas" className={cn(field, 'w-full')} />
        <p className="text-[12px] text-muted-foreground">Other addresses get a read-only link: no names, and numbers under ten hidden.</p>
      </div>
      {outside.length ? <label className="flex items-center gap-2 text-[13px]">Each link works
        <select value={linkDays ?? ''} onChange={(event) => setLinkDays(event.target.value ? Number(event.target.value) : null)} className={field} aria-label="How long each link works">
          {LINK_DAYS.map((item) => <option key={item} value={item}>for {item} days</option>)}<option value="">until turned off</option></select></label> : null}
    </fieldset>
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onDone} className={ghostButton}>Cancel</button>
      <button type="submit" disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background disabled:opacity-60">
        {saving ? <Loader2 size={14} className="animate-spin" /> : null}Schedule</button>
    </div>
  </form>
}

/** "Schedule captures" from a dashboard's menu: its schedules, and a new one. */
export default function SchedulesModal({ dashboard, scopeKey, objectLabel, open, onOpenChange }: {
  dashboard: Dashboard; scopeKey: string | null; objectLabel: string | null; open: boolean; onOpenChange: (open: boolean) => void // eslint-disable-line no-unused-vars
}) {
  const { orgId, token, ready } = useInsightsContext()
  const { data: rules } = useSWR(open && ready ? insightKeys.rules(orgId, dashboard.dashboard_uuid) : null, () => insightsApi.rules(orgId, dashboard.dashboard_uuid, token))
  const [adding, setAdding] = React.useState(false)
  React.useEffect(() => { if (open && rules && !rules.length) setAdding(true) }, [open, rules])
  return <Modal isDialogOpen={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setAdding(false) }} minHeight="no-min" minWidth="md" dialogTitle="Scheduled captures"
    dialogDescription={`Capture “${dashboard.title}” on a schedule and send it. Each capture is kept in Captures.`}
    dialogContent={open ? <div className="space-y-3">
      {rules?.length ? <ul className="space-y-2">{rules.map((rule) => <RuleRow key={rule.rule_uuid} rule={rule} />)}</ul> : null}
      {adding ? <RuleForm dashboard={dashboard} scopeKey={scopeKey} objectLabel={objectLabel} onDone={() => setAdding(false)} />
        : <button type="button" onClick={() => setAdding(true)} className={ghostButton}><Plus size={14} />New schedule</button>}
    </div> : null} />
}

/** Every schedule the viewer can see, above the capture log. */
export function ScheduleList() {
  const { orgId, token, ready } = useInsightsContext()
  const { data: rules } = useSWR(ready ? insightKeys.rules(orgId) : null, () => insightsApi.rules(orgId, null, token), { revalidateOnFocus: false })
  if (!rules?.length) return null
  return <section className="space-y-2" aria-label="Schedules">
    <h2 className="text-[15px] font-bold">Schedules</h2>
    <ul className="space-y-2">{rules.map((rule) => <RuleRow key={rule.rule_uuid} rule={rule} showDashboard />)}</ul>
  </section>
}
