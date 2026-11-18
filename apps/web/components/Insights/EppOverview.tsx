'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Download, GraduationCap, Loader2 } from 'lucide-react'
import { COLUMNS, Facts, LastReview, Mark } from '@components/Epp/EppCaseload'
import { EmptyState, PageLoader } from '@components/Goals/admin/live/ui'
import { getUriWithOrg } from '@services/config/config'
import { downloadEppPdfs, eppOverviewKey, getEppOverview, type EppOverviewLearner } from '@services/epp/caseload'
import { routePaths } from '@services/routing/paths'
import { cn } from '@/lib/utils'
import { inOrgWords } from '@/lib/people'
import { useDashboards, useInsightsContext } from './shared'

type Show = 'all' | 'complete' | 'incomplete'
const pill = 'h-8 rounded-full px-3 text-sm font-semibold'

/**
 * Insights › Education plans (PL-7): every learner's Education Plan and Profile, filtered by group, complete or
 * not, with each one a step from their EPP dashboard and a chosen set downloaded as PDFs in one go. Staff
 * without See reports see only their own groups' learners; the API decides that, not this page.
 */
export default function EppOverview({ group }: { group: string | null }) {
  const { orgId, orgslug, token, ready } = useInsightsContext()
  const router = useRouter()
  const { data, error } = useSWR(ready ? eppOverviewKey(orgId, group) : null, () => getEppOverview(orgId, group, token), { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true })
  const { data: dashboards } = useDashboards()
  const eppBoard = dashboards?.find((item) => item.source_template === 'starter:learner.epp' && item.scope === 'learner')?.dashboard_uuid
  const [show, setShow] = React.useState<Show>('all')
  const [picked, setPicked] = React.useState<Set<number>>(new Set())
  const [exporting, setExporting] = React.useState(false)
  React.useEffect(() => setPicked(new Set()), [group])

  const learners = data?.learners || []
  const rows = learners.filter((row) => show === 'all' || row.complete === (show === 'complete'))
  const pickable = rows.filter((row) => row.state !== 'waiting')
  const chosen = pickable.filter((row) => picked.has(row.user_id))
  const allPicked = pickable.length > 0 && chosen.length === pickable.length
  const toggle = (id: number) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(pickable.map((row) => row.user_id)))
  const exportPdfs = async () => {
    setExporting(true)
    try {
      const name = await downloadEppPdfs(orgId, chosen.map((row) => row.user_id), token)
      toast.success(`Downloaded ${name}`)
    } catch (failure: any) {
      toast.error(failure?.message || 'That download didn’t work')
    }
    setExporting(false)
  }
  const setGroup = (value: string) => router.replace(getUriWithOrg(orgslug, routePaths.org.admin.insightsEpp(value || null)))
  const open = (row: EppOverviewLearner) => row.user_uuid ? getUriWithOrg(orgslug, routePaths.org.admin.insightsScope('learner', row.user_uuid, eppBoard || null)) : null
  const counts = data?.counts
  const SHOW: { key: Show; label: string; count?: number }[] = [
    { key: 'all', label: 'Everyone', count: counts?.total }, { key: 'complete', label: 'Complete', count: counts?.complete }, { key: 'incomplete', label: 'Not complete', count: counts?.incomplete },
  ]

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reports{data ? ` · ${data.school_year}` : ''}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Education plans</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data && !data.see_reports ? inOrgWords('Learners in your groups who share their Education Plan and Profile with the school.') : inOrgWords('Every learner who shares their Education Plan and Profile with the school.')}</p>
      </div>
      <button type="button" disabled={!chosen.length || exporting} onClick={() => void exportPdfs()}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-40">
        {exporting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
        {chosen.length ? `Download ${chosen.length} PDF${chosen.length === 1 ? '' : 's'}` : 'Download PDFs'}
      </button>
    </header>

    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="epp-group">Group</label>
      <select id="epp-group" value={group || ''} onChange={(event) => setGroup(event.target.value)} disabled={!data}
        className="h-9 max-w-full rounded-full border border-border bg-card px-3 text-sm font-semibold">
        <option value="">{data && !data.see_reports ? 'All my groups' : 'All groups'}</option>
        {(data?.groups || []).map((item) => <option key={item.usergroup_uuid} value={item.usergroup_uuid}>{item.name}</option>)}
      </select>
      <div className="flex flex-wrap rounded-full border border-border p-0.5" role="group" aria-label="Show">
        {SHOW.map((item) => <button key={item.key} type="button" aria-pressed={show === item.key} onClick={() => setShow(item.key)}
          className={cn(pill, show === item.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
          {item.label}{item.count != null ? <span className="ml-1 tabular-nums opacity-70">{item.count}</span> : null}
        </button>)}
      </div>
    </div>

    {error && !data ? <EmptyState title="Education plans aren’t available" detail={error?.message} />
      : !data ? <PageLoader />
      : !learners.length ? <EmptyState icon={<GraduationCap size={22} />} title={data.see_reports || group ? inOrgWords('No learners here share their plan yet') : 'None of your groups’ learners share their plan yet'}
        detail={inOrgWords('Ask a learner to share their plan from the School record on their profile. They say yes in their chat with you.')} />
      : !rows.length ? <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">{show === 'complete' ? 'Nobody here has a complete plan yet.' : 'Every plan here is complete.'}</p>
      : <>
        <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 py-2 pl-4"><input type="checkbox" aria-label="Choose everyone shown" checked={allPicked} onChange={toggleAll} disabled={!pickable.length} className="h-4 w-4 accent-current" /></th>
                <th className="px-2 py-2 font-semibold">Learner</th>
                {COLUMNS.map((column) => <th key={column.key} className="px-2 py-2 text-center font-semibold">{column.label}</th>)}
                <th className="px-2 py-2 font-semibold">Last review</th><th className="px-2 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">{rows.map((row) => {
              const href = open(row)
              return <tr key={row.user_id}>
                <td className="py-2.5 pl-4"><input type="checkbox" aria-label={`Choose ${row.name}`} checked={picked.has(row.user_id)} onChange={() => toggle(row.user_id)} disabled={row.state === 'waiting'} className="h-4 w-4 accent-current" /></td>
                <td className="px-2 py-2.5">
                  {href && row.state !== 'waiting' ? <Link href={href} className="font-semibold hover:underline">{row.name}</Link> : <span className="font-semibold">{row.name}</span>}
                  <Facts row={row} />{row.groups.length ? <span className="block text-xs text-muted-foreground">{row.groups.join(', ')}</span> : null}
                </td>
                {COLUMNS.map((column) => <td key={column.key} className="px-2 py-2.5 text-center"><Mark status={row.components[column.key]} label={column.label} /></td>)}
                <td className="px-2 py-2.5"><LastReview row={row} /></td>
                <td className="px-2 py-2.5"><Status row={row} /></td>
              </tr>
            })}</tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <input id="epp-all" type="checkbox" checked={allPicked} onChange={toggleAll} disabled={!pickable.length} className="h-5 w-5 accent-current" />
          <label htmlFor="epp-all" className="text-sm font-semibold">Choose everyone shown</label>
        </div>
        <ul className="space-y-2 md:hidden">{rows.map((row) => {
          const href = open(row)
          return <li key={row.user_id} className="flex gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <input type="checkbox" aria-label={`Choose ${row.name}`} checked={picked.has(row.user_id)} onChange={() => toggle(row.user_id)} disabled={row.state === 'waiting'} className="mt-1 h-5 w-5 shrink-0 accent-current" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {href && row.state !== 'waiting' ? <Link href={href} className="font-semibold hover:underline">{row.name}</Link> : <p className="font-semibold">{row.name}</p>}
                  <Facts row={row} />
                </div>
                <Status row={row} />
              </div>
              {row.state !== 'waiting' ? <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">{COLUMNS.map((column) => <span key={column.key}><Mark status={row.components[column.key]} label={column.label} /> {column.label}</span>)}</p> : null}
              {row.groups.length ? <p className="mt-1 text-xs text-muted-foreground">{row.groups.join(', ')}</p> : null}
            </div>
          </li>
        })}</ul>
        <p className="text-xs text-muted-foreground">✓ complete, ! needs attention. Complete means every part is done and it was reviewed this school year. Each PDF is the plan as it stands now, with the learner&rsquo;s legal name and no staff notes.</p>
      </>}
  </div>
}

function Status({ row }: { row: EppOverviewLearner }) {
  if (row.state === 'waiting') return <span className="inline-flex shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-bold text-muted-foreground">Waiting to say yes</span>
  return <span className={cn('inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold',
    row.complete ? 'bg-[color-mix(in_oklab,var(--viz-up,#0B8077)_14%,transparent)] text-[var(--viz-up,#0B8077)]' : 'bg-muted text-muted-foreground')}>
    {row.complete ? 'Complete' : 'Not complete'}
  </span>
}
