'use client'

import useSWR from 'swr'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { schoolApi, schoolKeys } from '@services/school/school'
import { useSchoolRecords } from '@components/Hooks/useSchoolRecords'

/**
 * A learner's team: the staff on their groups and on their open plans (a plan's Lead, Review and Comment staff). Staff write about the learner as staff-only messages in their chat.
 * It's their "School team" only where the organization uses school records (PL-6); elsewhere it's just their team.
 */
export default function LearnerTeam({ orgId, userId, token }: { orgId: number; userId: number; token?: string }) {
  const schoolRecords = useSchoolRecords()
  const { data } = useSWR(orgId && token ? schoolKeys.student(orgId, userId) : null, () => schoolApi.student(orgId, userId, token),
    { revalidateOnFocus: false, shouldRetryOnError: false })
  if (!data) return null
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-bold">{schoolRecords ? 'School team' : 'Team'}</h2>
      {data.team.length ? <ul className="mt-3 space-y-3">{data.team.map((member) => <li key={member.user.id} className="flex items-center gap-3">
        <PersonAvatar user={member.user as any} size="md" />
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{member.user.name}</p><p className="truncate text-xs text-muted-foreground">{[...member.groups.map((group) => `${group.role} · ${group.name}`), ...(member.plans || []).map((plan) => `${plan.role} · ${plan.title}`)].join(', ')}</p></div>
      </li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">Nobody yet. Add staff to one of their groups, or to a plan they’re on.</p>}
    </section>
  )
}
