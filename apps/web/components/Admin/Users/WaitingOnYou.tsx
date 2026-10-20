'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { AtSign, ClipboardCheck, MessageCircle } from 'lucide-react'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { chatTime } from '@components/Connect/ConnectView'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { schoolApi, schoolKeys } from '@services/school/school'

/** Students with something for staff: unread school chat messages, mentions, and steps to review. Hidden while there's nothing. */
export default function WaitingOnYou({ orgId, orgslug, token }: { orgId: number; orgslug: string; token?: string }) {
  const [mine, setMine] = React.useState(true)
  const { data } = useSWR(orgId && token ? schoolKeys.waiting(orgId, mine) : null, () => schoolApi.waiting(orgId, mine, token),
    { revalidateOnFocus: true, refreshInterval: 30_000, keepPreviousData: true })
  if (!data || (!data.students.length && !data.can_see_everyone)) return null

  return (
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">{mine ? 'Waiting on you' : 'Waiting on staff'}</h2>
          <p className="text-xs text-gray-500">{mine ? 'Your students with new messages, mentions or work to review.' : 'Every student with new messages, mentions or work to review.'}</p>
        </div>
        {data.can_see_everyone ? <div role="group" aria-label="Whose students" className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-semibold">
          {[{ value: true, label: 'Mine' }, { value: false, label: 'Everyone' }].map((option) => <button key={option.label} type="button" aria-pressed={mine === option.value} onClick={() => setMine(option.value)}
            className={`rounded-md px-3 py-1.5 ${mine === option.value ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'}`}>{option.label}</button>)}
        </div> : null}
      </div>
      {data.students.length ? <ul className="divide-y divide-gray-100">
        {data.students.map((row) => <li key={row.student.id}>
          <Link href={getUriWithOrg(orgslug, routePaths.org.admin.people.userPage(row.student.username, row.reviews && !row.unread && !row.mentions ? 'plans' : 'messages'))}
            className="flex items-center gap-3 px-5 py-3 transition hover:bg-gray-50">
            <PersonAvatar user={row.student as any} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{row.student.name}</p>
              <p className="truncate text-xs text-gray-500">{row.last_message ? `${row.last_message.sender?.name ? `${row.last_message.sender.name}: ` : ''}${row.last_message.preview || row.last_message.body}` : `@${row.student.username}`}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs font-semibold">
              {row.mentions ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-700"><AtSign size={12} />{row.mentions}</span> : null}
              {row.unread ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-700"><MessageCircle size={12} />{row.unread}</span> : null}
              {row.reviews ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700"><ClipboardCheck size={12} />{row.reviews} to review</span> : null}
              {row.last_message ? <span className="w-14 text-right font-normal text-gray-400">{chatTime(row.last_message.update_date)}</span> : null}
            </div>
          </Link>
        </li>)}
      </ul> : <p className="px-5 py-6 text-center text-sm text-gray-500">{mine ? 'Nothing waiting on you.' : 'Nothing waiting on staff.'}</p>}
    </section>
  )
}
