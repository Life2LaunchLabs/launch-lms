'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { AtSign, ClipboardCheck, MessageCircle } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { schoolApi, schoolKeys, type WaitingStudent } from '@services/school/school'

type Counts = Pick<WaitingStudent, 'unread' | 'mentions' | 'reviews'>

/** What waits on the viewer from each student, by user id: their own students first, and for admins anyone nobody on staff has answered. */
export function useMessageCounts(orgId: number, token?: string): Record<number, Counts> {
  const options = { revalidateOnFocus: true, refreshInterval: 30_000 }
  const { data: mine } = useSWR(orgId && token ? schoolKeys.waiting(orgId, true) : null, () => schoolApi.waiting(orgId, true, token), options)
  const { data: everyone } = useSWR(orgId && token && mine?.can_see_everyone ? schoolKeys.waiting(orgId, false) : null, () => schoolApi.waiting(orgId, false, token), options)
  const counts: Record<number, Counts> = {}
  for (const row of [...(everyone?.students || []), ...(mine?.students || [])]) counts[row.student.id] = row
  return counts
}

/** The users table's Messages column: what waits on you from this person, linking to their messages. */
export function MessagesCell({ orgslug, username, counts }: { orgslug: string; username: string; counts?: Counts }) {
  if (!counts || !(counts.unread || counts.mentions || counts.reviews)) return <span className="text-xs text-gray-400">—</span>
  const subpage = counts.reviews && !counts.unread && !counts.mentions ? 'plans' : 'messages'
  return (
    <Link href={getUriWithOrg(orgslug, routePaths.org.admin.people.userPage(username, subpage))} className="inline-flex items-center gap-1.5 text-xs font-semibold">
      {counts.mentions ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-700"><AtSign size={12} />{counts.mentions}</span> : null}
      {counts.unread ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-700"><MessageCircle size={12} />{counts.unread}</span> : null}
      {counts.reviews ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700"><ClipboardCheck size={12} />{counts.reviews}</span> : null}
    </Link>
  )
}
