'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { CheckCircle2, ChevronRight, Inbox, Loader2 } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { planInboxApi, type InboxKind } from '@services/programs/programs'
import { cn } from '@/lib/utils'
import { EmptyState, PageLoader, PersonAvatar, personName, Segmented, StepTypeIcon, timeAgo } from './shared'

type Filter = 'all' | InboxKind

const KIND_LABEL: Record<InboxKind, string> = { review: 'to review', grade: 'to grade', confirm: 'to confirm', nudge: 'learners' }

export const inboxKey = (orgId: number) => ['plans-inbox', orgId]

export default function PlansInbox({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const { data, isLoading, mutate } = useSWR(orgId && token ? inboxKey(orgId) : null, () => planInboxApi.inbox(orgId, token), { revalidateOnFocus: true })
  const [filter, setFilter] = React.useState<Filter>('all')
  const [group, setGroup] = React.useState('all')
  const [open, setOpen] = React.useState<Record<string, boolean>>({})
  const [busy, setBusy] = React.useState<string | null>(null)
  if (isLoading || !data) return <PageLoader />

  const groups: any[] = data.groups || []
  const groupNames = Array.from(new Set(groups.map((item) => item.group?.name).filter(Boolean))) as string[]
  const visible = groups.filter((item) => (filter === 'all' || item.kind === filter || (filter === 'review' && item.kind === 'grade')) && (group === 'all' || item.group?.name === group))
  const counts = data.counts || {}
  const keyOf = (item: any) => `${item.kind}:${item.assignment_uuid}:${item.objective_uuid || item.plan_objective_uuid || item.activity_uuid || ''}`

  const confirmAll = async (item: any) => {
    const key = keyOf(item)
    setBusy(key)
    try {
      const result = await planInboxApi.confirm(orgId, item.items.map((entry: any) => entry.plan_objective_uuid), '', token)
      toast.success(`${result.confirmed.length} confirmed${result.skipped.length ? `; ${result.skipped.length} had already changed` : ''}.`)
      await mutate()
    } catch (error: any) { toast.error(error?.message || 'Could not confirm these.') } finally { setBusy(null) }
  }

  const reviewHref = (item: any, focus?: string) => getUriWithOrg(orgslug, routePaths.org.dash.planReview({
    assignment: item.assignment_uuid, objective: item.objective_uuid, planObjective: item.plan_objective_uuid, activity: item.activity_uuid, focus,
  }))
  const learnerHref = (entry: any) => entry.user?.username ? getUriWithOrg(orgslug, routePaths.org.dash.users.userPage(entry.user.username, 'overview')) : null

  return <div className="px-10 pb-10 pt-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Segmented<Filter> label="Show" value={filter} onChange={setFilter} options={[
        { value: 'all', label: <>All <Count n={data.total} /></> },
        { value: 'review', label: <>To review <Count n={(counts.review || 0) + (counts.grade || 0)} /></> },
        { value: 'confirm', label: <>To confirm <Count n={counts.confirm} /></> },
        { value: 'nudge', label: <>Stalled <Count n={counts.nudge} /></> },
      ]} />
      {groupNames.length > 1 ? <label className="flex items-center gap-2 text-xs font-semibold text-gray-500">Group
        <select value={group} onChange={(event) => setGroup(event.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900">
          <option value="all">All my groups</option>
          {groupNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label> : null}
    </div>
    {visible.length ? <section className="overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
      <div className="hidden grid-cols-[minmax(0,1fr)_120px_110px_220px] gap-4 border-b border-gray-100 bg-gray-50/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 md:grid"><span>Step</span><span>Waiting</span><span>Oldest</span><span /></div>
      {visible.map((item) => {
        const key = keyOf(item)
        const isOpen = Boolean(open[key])
        return <div key={key} className="border-b border-gray-50 last:border-b-0">
          <div className="grid gap-3 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_120px_110px_220px] md:items-center md:gap-4">
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [key]: !isOpen })} className="flex min-w-0 items-center gap-3 text-left">
              <ChevronRight size={14} className={cn('shrink-0 text-gray-400 transition', isOpen && 'rotate-90')} />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50"><StepTypeIcon types={item.kind === 'confirm' ? [] : item.objective.step_types} /></span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-gray-950">{item.objective.title}</span>
                <span className="block truncate text-xs text-gray-500">{[item.template?.name, item.objective.phase_name, item.group?.name].filter(Boolean).join(' · ') || 'Across your groups'}</span>
              </span>
            </button>
            <span className="text-sm text-gray-700"><strong className="text-base text-gray-950">{item.count}</strong> {KIND_LABEL[item.kind as InboxKind]}</span>
            <span className="text-sm text-gray-500">{timeAgo(item.oldest_at)}</span>
            <span className="flex justify-start gap-2 md:justify-end">
              {item.kind === 'review' || item.kind === 'grade' ? <Link href={reviewHref(item)} className="inline-flex h-9 items-center rounded-full bg-black px-4 text-sm font-medium text-white hover:bg-black/85">{item.kind === 'grade' ? 'Grade' : 'Review'} {item.count}</Link> : null}
              {item.kind === 'confirm' ? <>
                <Link href={reviewHref(item)} className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-white px-4 text-sm font-medium hover:bg-gray-50">One by one</Link>
                <button type="button" onClick={() => void confirmAll(item)} disabled={busy === key} className="inline-flex h-9 items-center gap-2 rounded-full bg-black px-4 text-sm font-medium text-white hover:bg-black/85 disabled:opacity-50">{busy === key ? <Loader2 size={14} className="animate-spin" /> : null}Confirm {item.count}</button>
              </> : null}
            </span>
          </div>
          {isOpen ? <ul className="px-5 pb-3 md:pl-[76px]">
            {item.items.slice(0, 25).map((entry: any) => {
              const href = item.kind === 'nudge' ? learnerHref(entry) : reviewHref(item, entry.plan_objective_uuid)
              return <li key={entry.plan_objective_uuid || entry.review_id || entry.plan_uuid} className="flex items-center gap-3 border-t border-gray-50 py-2">
                <PersonAvatar person={entry.user} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{personName(entry.user)}</span>
                <span className="w-40 text-xs text-gray-500">{item.kind === 'nudge' ? `Last active ${timeAgo(entry.last_active)}` : timeAgo(entry.submitted_at)}</span>
                {item.kind === 'nudge' ? <span className="hidden w-48 truncate text-xs text-gray-500 lg:block">{entry.template?.name}{entry.group ? ` · ${entry.group.name}` : ''}</span> : null}
                {href ? <Link href={href} className="w-14 text-right text-xs font-bold text-gray-900 hover:text-blue-700">Open</Link> : <span className="w-14" />}
              </li>
            })}
            {item.items.length > 25 ? <li className="pt-2 text-xs text-gray-500">+ {item.items.length - 25} more</li> : null}
          </ul> : null}
        </div>
      })}
    </section> : <EmptyState icon={data.total ? <Inbox size={36} /> : <CheckCircle2 size={36} className="text-green-500" />} title={data.total ? 'Nothing here with these filters' : 'Nothing waiting on you'} detail="Submissions, sign-offs and stalled learners from the groups you support land here." />}
    <p className="mt-3 text-xs text-gray-500">Grouped by step, so the same task for many learners is one row.</p>
  </div>
}

function Count({ n }: { n?: number }) {
  return <span className="rounded-full bg-black/5 px-1.5 text-[11px] font-bold text-gray-600">{n || 0}</span>
}
