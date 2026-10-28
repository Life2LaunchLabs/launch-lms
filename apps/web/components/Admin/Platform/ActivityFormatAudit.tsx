'use client'

import React from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { type ActivityAudit, activityAuditPath } from '@services/platform/platform'
import { swrFetcher } from '@services/utils/ts/requests'

// What the move to sequences and version 3 pages would still do, and the activities it flags
// for a person. The migration itself runs from the API's CLI (migrate-learning-content).
export default function ActivityFormatAudit() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [notes, setNotes] = React.useState(false)
  const { data, error, isLoading } = useSWR<ActivityAudit>(token ? activityAuditPath(notes) : null, (url: string) => swrFetcher(url, token))
  const summary = data?.summary

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Activities</p>
      <h2 className="mt-1 text-2xl font-black text-gray-950">New activity format</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        Activities move to sequences and version 3 pages. Anything listed here needs a person: a route that changed, or a page that stays in the old format until someone edits it.
      </p>
      {isLoading && <div className="flex min-h-24 items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>}
      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">The audit could not be loaded.</p>}
      {summary && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Activities', summary.activities],
            ['Sequences to write', summary.sequences],
            ['Pages to convert', summary.pages_converted],
            ['Pages left as they are', summary.pages_kept_v2],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-black/10 p-3">
              <p className="text-2xl font-black text-gray-950">{value}</p>
              <p className="text-xs font-bold text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}
      {data && (
        <div className="mt-6 border-t border-black/10 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-gray-900">{data.activities.length ? `${data.activities.length} need a look` : 'Nothing needs a look.'}</p>
            <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
              <input type="checkbox" checked={notes} onChange={(event) => setNotes(event.target.checked)} />
              Include notes learners won&apos;t notice
            </label>
          </div>
          <ul className="mt-3 divide-y divide-black/10">
            {data.activities.map((row) => (
              <li key={row.activity_uuid} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-gray-950">
                    {row.title}
                    <span className="ml-2 text-xs font-normal text-gray-500">{row.org_name || row.org_slug}{row.frozen ? ' · published copy' : ''}</span>
                  </p>
                  {row.editor_url && <a href={row.editor_url} className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:underline">Open<ExternalLink size={12} /></a>}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {row.flags.map((flag, index) => (
                    <li key={index} className={`text-xs leading-5 ${flag.review ? 'text-amber-800' : 'text-gray-500'}`}>{flag.message}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
