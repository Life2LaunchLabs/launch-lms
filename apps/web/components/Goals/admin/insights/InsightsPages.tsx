'use client'

import React from 'react'
import InsightsShell from '@components/Insights/InsightsShell'

/** Engagement by group. Not designed yet. */
export function InsightsEngagementPage() {
  return <InsightsShell place="reports">
    <div className="-mx-4 overflow-hidden rounded-[22px] border border-border bg-card sm:mx-0">
      <div className="px-4 pb-10 pt-6 sm:px-10"><section className="max-w-[640px] rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
        <b className="text-sm text-gray-900">Engagement</b>
        <p className="mt-1 text-[13px] text-gray-500">Coming later: messages, logins and how groups respond to reminders. Group progress is on each group&rsquo;s Insights dashboard.</p>
      </section></div>
    </div>
  </InsightsShell>
}
