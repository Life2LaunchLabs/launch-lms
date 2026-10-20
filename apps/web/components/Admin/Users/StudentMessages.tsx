'use client'

import React from 'react'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import ChatWorkspace from '@components/Connect/workspace/ChatWorkspace'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { schoolApi, schoolKeys } from '@services/school/school'

const REFRESH_MS = 30_000

function useStudent(orgId: number, userId: number, token?: string, refresh = false) {
  return useSWR(orgId && token ? schoolKeys.student(orgId, userId) : null, () => schoolApi.student(orgId, userId, token),
    { revalidateOnFocus: false, shouldRetryOnError: false, refreshInterval: refresh ? REFRESH_MS : 0 })
}

/** The student's school team as a row of faces, for the header of their page. */
export function SchoolTeam({ orgId, userId, token }: { orgId: number; userId: number; token?: string }) {
  const { data } = useStudent(orgId, userId, token)
  if (!data?.team.length) return null
  const names = data.team.map((member) => `${member.user.name} (${member.groups.map((group) => `${group.role}, ${group.name}`).join('; ')})`)
  return (
    <div className="ml-auto flex items-center gap-2" title={names.join('\n')}>
      <span className="text-xs font-semibold text-gray-500">School team</span>
      <div className="flex -space-x-2">{data.team.slice(0, 5).map((member) => <span key={member.user.id} className="rounded-full ring-2 ring-white"><PersonAvatar user={member.user as any} size="sm" /></span>)}</div>
      {data.team.length > 5 ? <span className="text-xs text-gray-500">+{data.team.length - 5}</span> : null}
    </div>
  )
}

/** Where a step opens for staff: the learner's plan as staff work it, at that step. */
export const staffStepHref = (orgslug: string) => (goalUuid: string, stepUuid: string) => getUriWithOrg(orgslug, `${routePaths.org.admin.livePlan(goalUuid)}#step-${stepUuid}`)

/** A learner's chat with the organization, filtered by plan and step, with staff notes about them between the messages. */
export default function StudentMessages({ orgId, userId, orgslug, token }: { orgId: number; userId: number; orgslug: string; token?: string }) {
  const { data, error } = useStudent(orgId, userId, token, true)

  if (error) return <p className="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500 nice-shadow">Only this student&rsquo;s school team and admins can see their messages.</p>
  if (!data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
      <section className="flex h-[min(76vh,780px)] flex-col overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
        <ChatWorkspace source={{ orgId, userId }} orgslug={orgslug} token={token} stepHref={staffStepHref(orgslug)} staffNotes={{ orgId, userId }}
          empty={data.team.length ? 'No messages yet.' : 'Add staff to one of this student’s groups to start their chat.'}
          header={(chat) => <header className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-bold text-gray-900">{chat?.title || 'Messages'}</h2>
            <p className="text-xs text-gray-500">{data.student.name} and everyone on their plans here. {chat && !chat.can_post ? 'You read along as an admin.' : 'Pick a plan or step to see just what’s about it.'}</p>
          </header>} />
      </section>
      <div className="space-y-5">
        <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
          <h2 className="text-sm font-bold text-gray-900">School team</h2>
          {data.team.length ? <ul className="mt-3 space-y-3">{data.team.map((member) => <li key={member.user.id} className="flex items-center gap-3">
            <PersonAvatar user={member.user as any} size="md" />
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{member.user.name}</p><p className="truncate text-xs text-gray-500">{member.groups.map((group) => `${group.role} · ${group.name}`).join(', ')}</p></div>
          </li>)}</ul> : <p className="mt-2 text-xs text-gray-500">Nobody yet. Staff are added on a group&rsquo;s People tab.</p>}
        </section>
      </div>
    </div>
  )
}
