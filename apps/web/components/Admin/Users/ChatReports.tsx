'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { Flag } from 'lucide-react'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { chatTime } from '@components/Connect/ConnectView'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { schoolApi, schoolKeys, type ChatReport, type ReportStatus } from '@services/school/school'

const TABS: Array<{ value: ReportStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
]

/** Chat reports for admins: what was reported, the messages before it, and resolve or dismiss. Hidden until the first report. */
export default function ChatReports({ orgId, orgslug, token }: { orgId: number; orgslug: string; token?: string }) {
  const [status, setStatus] = React.useState<ReportStatus>('open')
  const { mutate: mutateAll } = useSWRConfig()
  const { data } = useSWR(orgId && token ? schoolKeys.reports(orgId, status) : null, () => schoolApi.reports(orgId, status, token),
    { revalidateOnFocus: true, refreshInterval: 60_000, keepPreviousData: true, shouldRetryOnError: false })
  // Non-admins get a 403 and see nothing; admins see the panel once anyone has reported something.
  if (!data?.total) return null

  const review = async (report: ChatReport, next: ReportStatus) => {
    try {
      await schoolApi.reviewReport(orgId, report.report_uuid, next, token)
      toast.success(next === 'open' ? 'Report reopened' : next === 'resolved' ? 'Report resolved' : 'Report dismissed')
      // Every status list changes, not just this one.
      const prefix = schoolKeys.reports(orgId).split('?')[0]
      mutateAll((key) => typeof key === 'string' && key.startsWith(`${prefix}?`))
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t save')
    }
  }

  return (
    <section aria-labelledby="chat-reports-title" className="overflow-hidden rounded-xl border border-red-100 bg-white nice-shadow">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div>
          <h2 id="chat-reports-title" className="flex items-center gap-2 text-[15px] font-semibold text-gray-900">
            <Flag size={15} className="text-red-500" />Chat reports
            {data.open ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">{data.open} open</span> : null}
          </h2>
          <p className="text-xs text-gray-500">Messages your members reported, or that someone reported about them.</p>
        </div>
        <div role="group" aria-label="Which reports" className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-semibold">
          {TABS.map((tab) => <button key={tab.value} type="button" aria-pressed={status === tab.value} onClick={() => setStatus(tab.value)}
            className={`rounded-md px-3 py-1.5 ${status === tab.value ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'}`}>{tab.label}</button>)}
        </div>
      </div>
      {data.reports.length ? <ul className="divide-y divide-gray-100">
        {data.reports.map((report) => <ReportRow key={report.report_uuid} report={report} orgslug={orgslug} onReview={(next) => review(report, next)} />)}
      </ul> : <p className="px-5 py-6 text-center text-sm text-gray-500">No {status} reports.</p>}
    </section>
  )
}

function PersonName({ person, inOrg, orgslug }: { person: ChatReport['reporter']; inOrg: boolean; orgslug: string }) {
  if (!person) return <span className="font-semibold text-gray-900">Someone</span>
  if (!inOrg) return <span className="font-semibold text-gray-900">{person.name}</span>
  return <Link href={getUriWithOrg(orgslug, routePaths.org.dash.users.userPage(person.username, 'messages'))} className="font-semibold text-gray-900 underline-offset-2 hover:underline">{person.name}</Link>
}

function ReportRow({ report, orgslug, onReview }: { report: ChatReport; orgslug: string; onReview: (next: ReportStatus) => void }) { // eslint-disable-line no-unused-vars
  const where = report.chat?.kind === 'direct' ? 'a direct chat' : report.chat?.title ? `“${report.chat.title}”` : 'a chat'
  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-gray-600">
          <PersonName person={report.reporter} inOrg={report.reporter_in_org} orgslug={orgslug} /> reported{' '}
          {report.reported ? <PersonName person={report.reported} inOrg={report.reported_in_org} orgslug={orgslug} /> : 'a message'} in {where}
          <span className="text-gray-400"> · {chatTime(report.creation_date)}</span>
        </p>
        <div className="flex shrink-0 gap-2">
          {report.status === 'open' ? <>
            <button type="button" onClick={() => onReview('dismissed')} className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50">Dismiss</button>
            <button type="button" onClick={() => onReview('resolved')} className="h-9 rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white hover:bg-gray-800">Mark resolved</button>
          </> : <button type="button" onClick={() => onReview('open')} className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50">Reopen</button>}
        </div>
      </div>
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900"><span className="font-semibold">Reason: </span>{report.reason}</p>
      {report.messages.length || report.excerpt ? <ol aria-label="Messages before the report" className="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50 p-3">
        {report.messages.map((message) => <li key={message.message_uuid} className={`flex items-start gap-2 rounded-md px-2 py-1 text-sm ${message.reported ? 'bg-amber-100/70' : ''}`}>
          {message.sender ? <PersonAvatar user={message.sender as any} size="sm" /> : null}
          <p className="min-w-0 flex-1 break-words text-gray-800">
            <span className="font-semibold">{message.sender?.name || 'App'}: </span>{message.body}
            {message.reported ? <span className="ml-2 text-xs font-semibold text-amber-800">Reported</span> : null}
          </p>
        </li>)}
        {report.excerpt ? <li className="rounded-md bg-amber-100/70 px-2 py-1 text-sm text-gray-800">
          <span className="font-semibold">Deleted message: </span>{report.excerpt}
        </li> : null}
      </ol> : null}
      {report.reviewed_by ? <p className="text-xs text-gray-500">{report.status === 'resolved' ? 'Resolved' : 'Dismissed'} by {report.reviewed_by.name}{report.review_date ? ` · ${chatTime(report.review_date)}` : ''}</p> : null}
    </li>
  )
}
