'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { CheckCircle2, ChevronRight, Inbox as InboxIcon, Loader2, UserCheck } from 'lucide-react'
import { stepDefinition } from '@components/Goals/steps'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { goalAdminApi, inboxKey, type InboxGroup, type InboxItem, type InboxKind } from '@services/goals/admin'
import { cn } from '@/lib/utils'
import { EmptyState, PageLoader, PersonAvatar, personName, reviewHref, Segmented, timeAgo } from './ui'

type Filter = 'all' | InboxKind

const KIND_LABEL: Record<InboxKind, string> = { review: 'to review', grade: 'to grade', confirm: 'to confirm', nudge: 'learners' }
const keyOf = (group: InboxGroup) => `${group.kind}:${group.assignment_uuid}:${group.step_key || group.step_uuid || group.activity_uuid || ''}`

/** Work waiting on staff across their groups, one row per step: review, grade, confirm, and learners to nudge. */
export default function ReviewInbox({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const { data, isLoading, mutate } = useSWR(orgId && token ? inboxKey(orgId) : null, () => goalAdminApi.inbox(orgId, token), { revalidateOnFocus: true })
  const [filter, setFilter] = React.useState<Filter>('all')
  const [groupName, setGroupName] = React.useState('all')
  const [open, setOpen] = React.useState<Record<string, boolean>>({})
  const [busy, setBusy] = React.useState<string | null>(null)
  if (isLoading || !data) return <PageLoader />

  const groupNames = Array.from(new Set(data.groups.map((item) => item.group?.name).filter(Boolean))) as string[]
  const visible = data.groups.filter((item) => (filter === 'all' || item.kind === filter || (filter === 'review' && item.kind === 'grade')) && (groupName === 'all' || item.group?.name === groupName))
  const counts = data.counts
  const confirmAll = async (group: InboxGroup) => {
    setBusy(keyOf(group))
    try {
      const result = await goalAdminApi.confirm(orgId, group.items.map((entry) => entry.step_uuid!).filter(Boolean), '', token)
      toast.success(`${result.confirmed.length} confirmed${result.skipped.length ? `; ${result.skipped.length} had already changed` : ''}.`)
      await mutate()
    } catch (error: any) { toast.error(error?.message || 'Could not confirm these.') } finally { setBusy(null) }
  }
  const href = (group: InboxGroup, focus?: string) => getUriWithOrg(orgslug, reviewHref({ assignment: group.assignment_uuid, stepKey: group.step_key, stepUuid: group.step_uuid, activity: group.activity_uuid, focus }))
  const entryHref = (group: InboxGroup, entry: InboxItem) => group.kind === 'nudge' ? getUriWithOrg(orgslug, routePaths.org.dash.livePlan(entry.goal_uuid)) : href(group, entry.step_uuid)

  return <div className="px-10 pb-10 pt-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Segmented<Filter> label="Show" value={filter} onChange={setFilter} options={[
        { value: 'all', label: <>All <Count n={data.total} /></> },
        { value: 'review', label: <>To review <Count n={(counts.review || 0) + (counts.grade || 0)} /></> },
        { value: 'confirm', label: <>To confirm <Count n={counts.confirm} /></> },
        { value: 'nudge', label: <>Stalled <Count n={counts.nudge} /></> },
      ]} />
      {groupNames.length > 1 ? <label className="flex items-center gap-2 text-xs font-semibold text-gray-500">Group
        <select value={groupName} onChange={(event) => setGroupName(event.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900">
          <option value="all">All my groups</option>
          {groupNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label> : null}
    </div>
    {visible.length ? <section className="overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
      <div className="hidden grid-cols-[minmax(0,1fr)_120px_110px_220px] gap-4 border-b border-gray-100 bg-gray-50/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 md:grid"><span>Step</span><span>Waiting</span><span>Oldest</span><span /></div>
      {visible.map((group) => {
        const key = keyOf(group)
        const isOpen = Boolean(open[key])
        const Icon = group.kind === 'confirm' ? UserCheck : group.step.type ? stepDefinition(group.step.type).icon : InboxIcon
        return <div key={key} className="border-b border-gray-50 last:border-b-0">
          <div className="grid gap-3 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_120px_110px_220px] md:items-center md:gap-4">
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [key]: !isOpen })} className="flex min-w-0 items-center gap-3 text-left">
              <ChevronRight size={14} className={cn('shrink-0 text-gray-400 transition', isOpen && 'rotate-90')} />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50"><Icon size={14} className="text-gray-500" aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-gray-950">{group.step.title}</span>
                <span className="block truncate text-xs text-gray-500">{[group.template?.title, group.step.stage_title, group.group?.name].filter(Boolean).join(' · ') || 'Across your groups'}</span>
              </span>
            </button>
            <span className="text-sm text-gray-700"><strong className="text-base text-gray-950">{group.count}</strong> {KIND_LABEL[group.kind]}</span>
            <span className="text-sm text-gray-500">{timeAgo(group.oldest_at)}</span>
            <span className="flex justify-start gap-2 md:justify-end">
              {group.kind === 'review' || group.kind === 'grade' ? <Link href={href(group)} className="inline-flex h-9 items-center rounded-full bg-black px-4 text-sm font-medium text-white hover:bg-black/85">{group.kind === 'grade' ? 'Grade' : 'Review'} {group.count}</Link> : null}
              {group.kind === 'confirm' ? <>
                <Link href={href(group)} className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-white px-4 text-sm font-medium hover:bg-gray-50">One by one</Link>
                <button type="button" onClick={() => void confirmAll(group)} disabled={busy === key} className="inline-flex h-9 items-center gap-2 rounded-full bg-black px-4 text-sm font-medium text-white hover:bg-black/85 disabled:opacity-50">{busy === key ? <Loader2 size={14} className="animate-spin" /> : null}Confirm {group.count}</button>
              </> : null}
            </span>
          </div>
          {isOpen ? <ul className="px-5 pb-3 md:pl-[76px]">
            {group.items.slice(0, 25).map((entry) => <li key={entry.step_uuid || entry.review_id || entry.goal_uuid} className="flex items-center gap-3 border-t border-gray-50 py-2">
              <PersonAvatar person={entry.user} size={26} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{personName(entry.user)}</span>
              <span className="w-40 text-xs text-gray-500">{group.kind === 'nudge' ? `Last active ${timeAgo(entry.last_active)}` : timeAgo(entry.submitted_at)}</span>
              {group.kind === 'nudge' ? <span className="hidden w-48 truncate text-xs text-gray-500 lg:block">{entry.template?.title}{entry.group ? ` · ${entry.group.name}` : ''}</span> : null}
              <Link href={entryHref(group, entry)} className="w-14 text-right text-xs font-bold text-gray-900 hover:text-blue-700">Open</Link>
            </li>)}
            {group.items.length > 25 ? <li className="pt-2 text-xs text-gray-500">+ {group.items.length - 25} more</li> : null}
          </ul> : null}
        </div>
      })}
    </section> : <EmptyState icon={data.total ? <InboxIcon size={36} /> : <CheckCircle2 size={36} className="text-green-500" />} title={data.total ? 'Nothing here with these filters' : 'Nothing waiting on you'} detail="Hand-ins, sign-offs and stalled learners from the groups you support land here." />}
    <p className="mt-3 text-xs text-gray-500">Grouped by step, so the same step for many learners is one row.</p>
  </div>
}

function Count({ n }: { n?: number }) {
  return <span className="rounded-full bg-black/5 px-1.5 text-[11px] font-bold text-gray-600">{n || 0}</span>
}
